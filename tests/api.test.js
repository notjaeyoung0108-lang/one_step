import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{hashToken,extractIntent} from '../server/worker.js';
import {todayKST,localISO,defaults} from '../server/core.js';
const token='test-only-token-with-at-least-32-characters';
function db(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));return {
  prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};}};}
};}
async function setup(){return {DB:db(),ACCESS_TOKEN_HASH:await hashToken(token),ALLOWED_ORIGINS:'https://example.com'};}
async function request(env,path,{data,auth=token,origin='https://example.com'}={}){const headers={'Origin':origin};if(auth)headers.Authorization='Bearer '+auth;if(data)headers['Content-Type']='application/json';return worker.fetch(new Request('https://api.example.com'+path,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined}),env);}
const e={title:'검증용 일정',start:'2026-10-09T13:00',end:'2026-10-09T14:00',category:'공부',firstStep:'시작'};
test('auth protects every endpoint, disallows origin, never caches data',async()=>{
  const env=await setup();
  for(const path of ['/api/state','/api/mutate','/api/plan','/api/apply']){
    assert.equal((await request(env,path,{auth:null})).status,401);
    assert.equal((await request(env,path,{auth:'invalid-token-that-is-long-enough'})).status,401);
  }
  assert.equal((await request(env,'/api/state',{origin:'https://evil.example'})).status,403);
  const r=await request(env,'/api/state');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal((await r.json()).events.length,0);
});
test('writes reject stale revisions, conflicting schedules, and preserve other data',async()=>{
  const env=await setup();let r=await request(env,'/api/mutate',{data:{action:'create',revision:0,event:e}});assert.equal(r.status,200);let state=await r.json();
  assert.equal((await request(env,'/api/mutate',{data:{action:'create',revision:0,event:e}})).status,409);
  assert.equal((await request(env,'/api/mutate',{data:{action:'create',revision:1,event:e}})).status,409);
  r=await request(env,'/api/mutate',{data:{action:'toggle',revision:1,id:state.events[0].id}});state=await r.json();assert.equal(state.events[0].done,true);
  r=await request(env,'/api/mutate',{data:{action:'delete',revision:2,id:state.events[0].id}});assert.equal((await r.json()).events.length,0);
});
test('two concurrent clients cannot overwrite each other',async()=>{
  const env=await setup();await request(env,'/api/state');
  const responses=await Promise.all([request(env,'/api/mutate',{data:{action:'create',revision:0,event:e}}),request(env,'/api/mutate',{data:{action:'create',revision:0,event:{...e,start:'2026-10-09T15:00',end:'2026-10-09T16:00'}}})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
});
test('proposal application is single-use, versioned and expiring',async()=>{
  const env=await setup();await request(env,'/api/state');const next=Date.now()+86400000;
  const proposed={...e,id:'unique-proposal-event',start:localISO(next),end:localISO(next+3600000)};
  await env.DB.prepare('INSERT INTO proposals VALUES (?, ?, ?, ?)').bind('p1',0,Date.now()+60000,JSON.stringify({events:[proposed]})).run();
  const calls=await Promise.all([request(env,'/api/apply',{data:{id:'p1'}}),request(env,'/api/apply',{data:{id:'p1'}})]);
  assert.equal(calls.filter(r=>r.status===200).length,1);
  assert.equal((await (await request(env,'/api/state')).json()).events.length,1);
  await env.DB.prepare('INSERT INTO proposals VALUES (?, ?, ?, ?)').bind('expired',1,Date.now()-1,'{}').run();
  assert.equal((await request(env,'/api/apply',{data:{id:'expired'}})).status,410);
  await env.DB.prepare('INSERT INTO proposals VALUES (?, ?, ?, ?)').bind('stale',0,Date.now()+60000,'{}').run();
  assert.equal((await request(env,'/api/apply',{data:{id:'stale'}})).status,409);
});
test('AI failures and refusals do not create false plans',async()=>{
  const state={events:[],preferences:defaults},env={OPENAI_API_KEY:'fake'};
  await assert.rejects(()=>extractIntent('test',state,env,Date.now(),async()=>new Response('{}',{status:429})),/한도/);
  await assert.rejects(()=>extractIntent('test',state,env,Date.now(),async()=>Response.json({status:'incomplete'})),/끝까지/);
  await assert.rejects(()=>extractIntent('test',state,env,Date.now(),async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]})),/만들지/);
  const intent={summary:'계획',questions:['기간이 언제인가요?'],notes:[],tasks:[]};
  const parsed=await extractIntent('test',state,env,Date.now(),async(url,init)=>{
    const sent=JSON.parse(init.body);assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.equal(sent.text.format.schema.additionalProperties,false);
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(intent)}]}]});});
  assert.deepEqual(parsed,intent);
});
test('AI daily cost cap is persistent and enforced before upstream request',async()=>{
  const env=await setup();env.OPENAI_API_KEY='unused';env.AI_DAILY_LIMIT='1';
  await env.DB.prepare('INSERT INTO ai_usage VALUES (?, ?)').bind(todayKST(),1).run();
  const r=await request(env,'/api/plan',{data:{prompt:'이번 주 공부 1시간'}});assert.equal(r.status,429);
});
