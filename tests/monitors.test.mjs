import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { TranscriptFetch, NotFoundError } from '../dist/index.js';

// Wire fixtures from the public API catalog; no live account or paid API calls.
const fixtures = JSON.parse(readFileSync(new URL('./monitor-fixtures.json', import.meta.url)));
function setup(handler) {
  const requests = [];
  const client = new TranscriptFetch({apiKey:'test-only',baseUrl:'https://example.test',maxRetries:1,
    fetch: async (url, init) => {
      const request = {url:new URL(url),method:init.method,headers:init.headers,body:init.body ? JSON.parse(init.body) : undefined};
      requests.push(request);
      return handler(request, requests.length);
    }});
  return {client,requests};
}
const response = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status,headers});

test('create maps options, auth and idempotency; secret and usage survive normalization', async () => {
  const {client,requests}=setup(()=>response(fixtures.createMonitor,201));
  const m=await client.monitors.create('https://www.youtube.com/@fixture', {type:'channel',platform:'youtube',tab:'shorts',name:'Mine',webhookUrl:'https://example.test/hooks',intervalMinutes:360,transcripts:false,idempotencyKey:'create-key'});
  assert.deepEqual(requests[0].body,{target:'https://www.youtube.com/@fixture',type:'channel',platform:'youtube',tab:'shorts',name:'Mine',webhook_url:'https://example.test/hooks',interval_minutes:360,transcripts:false});
  assert.equal(requests[0].method,'POST');assert.equal(requests[0].url.pathname,'/api/v2/monitors');
  assert.equal(requests[0].headers.Authorization,'Bearer test-only');assert.equal(requests[0].headers['Idempotency-Key'],'create-key');
  assert.equal(m.webhookSecret,'whsec_…');assert.equal(m.baselineCount,30);assert.equal(m.usage.creditsSpent,0);
  assert.equal(m.intervalMinutes,60);assert.equal(m.options.tab,'videos');
});

test('minimal create omits optional settings; 503 retry keeps one idempotency key', async () => {
  const {client,requests}=setup((_,n)=>n===1 ? response({error:{code:'internal_error',message:'retry'}},503,{'retry-after':'0'}) : response(fixtures.createMonitor,201));
  await client.monitors.create('@fixture');assert.equal(requests.length,2);
  assert.deepEqual(requests[0].body,{target:'@fixture'});
  assert.ok(requests[0].headers['Idempotency-Key']);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
});

test('list/get query encoding, news, null plan cap and last error', async () => {
  const fixture=structuredClone(fixtures.listMonitors);fixture.data.limits.max_monitors=null;
  const {client,requests}=setup(r=>response(r.url.pathname.endsWith('/monitors') ? fixture : {...fixtures.getMonitor,data:{...fixtures.getMonitor.data,last_error:{code:'not_found',number:4004,message:'gone',at:'2026-09-27T00:00:00Z'}}}));
  const list=await client.monitors.list({since:'mev_abc+def&x'});
  assert.equal(list.limits.maxMonitors,null);assert.equal(list.hasNew,true);assert.ok(list.lastEventId);
  assert.equal(requests[0].url.searchParams.get('since'),'mev_abc+def&x');assert.equal(requests[0].headers['Idempotency-Key'],undefined);
  const monitor=await client.monitors.get('mon/a?x',{since:list.lastEventId});
  assert.equal(requests[1].url.pathname,'/api/v2/monitors/mon%2Fa%3Fx');assert.equal(monitor.lastError.at,'2026-09-27T00:00:00Z');assert.equal(monitor.webhookSecret,null);
});

test('PATCH preserves false and null, omits other fields; delete has no body', async () => {
  const {client,requests}=setup(r=>response(r.method==='DELETE'?fixtures.deleteMonitor:fixtures.updateMonitor));
  const paused=await client.monitors.update('mon_1',{webhookUrl:null,name:null,transcripts:false,status:'paused'});
  assert.equal(paused.status,'paused');assert.equal(paused.nextCheckAt,null);
  assert.deepEqual(requests[0].body,{webhook_url:null,name:null,transcripts:false,status:'paused'});assert.equal(requests[0].method,'PATCH');
  const deleted=await client.monitors.delete('mon_1');assert.equal(deleted.kind,'monitor_deleted');assert.equal(requests[1].method,'DELETE');assert.equal(requests[1].body,undefined);
});

test('check normalizes nested videos, transcripts, delivery and nonthrowing check failure', async () => {
  const failed={...fixtures.checkMonitor,data:{...fixtures.checkMonitor.data,new_videos:0,event:null,error:{code:'not_found',number:4004,message:'channel gone'}}};
  const {client,requests}=setup((_,n)=>response(n===1?fixtures.checkMonitor:failed));
  const checked=await client.monitors.check('mon_1',{idempotencyKey:'check-key'});
  assert.equal(requests[0].url.pathname,'/api/v2/monitors/mon_1/check');assert.equal(requests[0].headers['Idempotency-Key'],'check-key');
  assert.equal(checked.newVideos,1);assert.equal(checked.event.type,'monitor.videos');assert.equal(checked.event.data.videos[0].videoId,'dQw4w9WgXcQ');assert.equal(checked.event.data.transcripts[0].transcript.segments[0].text,"We're no strangers to love");assert.equal(checked.event.delivery.status,'delivered');assert.equal(checked.usage.creditsSpent,2);
  const failure=await client.monitors.check('mon_1');assert.equal(failure.error.code,'not_found');assert.equal(failure.event,null);
});

test('event iteration carries limit/since/cursor, parses followup errors and stops', async () => {
  const page=structuredClone(fixtures.listMonitorEvents);page.data.next_cursor='a+/=&';
  const followup={...page.data.events[0],type:'monitor.transcript',id:'mev_followup',data:{video_id:'v2',url:'https://example.test/v2',outcome:'error',error:{code:'no_captions',number:3001,message:'none'},videos_event_id:'mev_parent'}};
  const end={...page,data:{...page.data,events:[followup],next_cursor:null}};
  const {client,requests}=setup((_,n)=>response(n===1?page:end));
  const events=[];for await(const event of client.monitors.iterEvents('mon_1',{limit:1,since:'mev_before'}))events.push(event);
  assert.equal(events.length,2);assert.equal(requests.length,2);assert.equal(requests[1].url.searchParams.get('cursor'),'a+/=&');
  for(const req of requests){assert.equal(req.url.searchParams.get('since'),'mev_before');assert.equal(req.url.searchParams.get('limit'),'1');assert.equal(req.method,'GET');}
  assert.equal(events[1].data.videosEventId,'mev_parent');assert.equal(events[1].data.error.code,'no_captions');assert.equal(events[1].data.transcript,null);
});

test('HTTP errors retain SDK error mapping', async () => {
  const {client}=setup(()=>response({ok:false,error:{code:'not_found',message:'Monitor not found',number:4004},request_id:'req_error'},404));
  await assert.rejects(()=>client.monitors.get('missing'),NotFoundError);
});

test('video options from playground are sent, including false timestamps', async () => {
  const {client,requests}=setup(()=>response({ok:true,data:{text:'hello'},usage:{credits_spent:1}}));
  await client.transcripts.video('https://example.test/video',{mode:'captions',timestamps:false,callbackUrl:'https://example.test/hook'});
  assert.deepEqual(requests[0].body,{video:'https://example.test/video',mode:'captions',timestamps:false,callback_url:'https://example.test/hook'});
});

test('CommonJS package entry exports monitor client', () => {
  const {TranscriptFetch: Client}=createRequire(import.meta.url)('../dist/index.cjs');
  assert.equal(typeof new Client('test-only').monitors.events,'function');
});

test('processing and successful follow-up transcripts preserve job ids and full metadata', async () => {
  const page=structuredClone(fixtures.listMonitorEvents);
  const original=page.data.events[0];
  const entry=original.data.transcripts[0];
  original.data.transcripts.push({video_id:'queued',url:'https://example.test/q',outcome:'processing',job_id:'asr_fixture'});
  page.data.events.push({...original,type:'monitor.transcript',id:'mev_done',data:{...entry,videos_event_id:original.id}});
  const {client}=setup(()=>response(page));
  const events=(await client.monitors.events('mon_1')).events;
  assert.equal(events[0].data.transcripts[1].jobId,'asr_fixture');
  assert.equal(events[0].data.transcripts[1].outcome,'processing');
  assert.equal(events[1].data.transcript.videoId,entry.video_id);
  assert.equal(events[1].data.transcript.channel,'Example Channel');
  assert.equal(events[1].data.videosEventId,original.id);
});
