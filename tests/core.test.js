import test from 'node:test';
import assert from 'node:assert/strict';
import {schedule,defaults,parseTime,localISO,event,preferences,overlap} from '../server/core.js';
const now=Date.parse('2026-10-08T08:00:00+09:00');
const base={title:'전공 공부',kind:'flexible',totalMinutes:360,sessionMinutes:60,earliestDate:'2026-10-08',deadline:'2026-10-11',preferredStart:'09:00',preferredEnd:'22:00',daysOfWeek:[0,1,2,3,4,5,6],fixedStart:null,category:'공부',firstStep:'교재 펼치기'};
const state=(events=[],p={})=>({events,preferences:{...defaults,...p}});
test('KST dates validate real calendar and time boundaries',()=>{
  assert.equal(localISO(parseTime('2026-10-08T00:00')),'2026-10-08T00:00');
  for(const invalid of ['2026-02-30T09:00','2026-13-01T09:00','2026-10-08T25:00','2026-10-08T12:60','2026-10-08T09:00Z'])assert.throws(()=>parseTime(invalid));
});
test('six hours are preserved, split and balanced around appointments',()=>{
  const busy=event({title:'면접',start:'2026-10-08T09:00',end:'2026-10-08T12:00',category:'약속'});
  const plan=schedule({tasks:[base]},state([busy]),now);
  assert.equal(plan.events.length,6);assert.equal(plan.unplaced.length,0);
  assert.equal(plan.events.reduce((n,e)=>n+(parseTime(e.end)-parseTime(e.start))/60000,0),360);
  for(const e of plan.events){assert.ok(!overlap(e,busy,10));for(const other of plan.events)if(e.id!==other.id)assert.ok(!overlap(e,other,10));}
  assert.ok(new Set(plan.events.map(e=>e.start.slice(0,10))).size>=3);
});
test('capacity overflow is reported without inventing availability',()=>{
  const plan=schedule({tasks:[{...base,deadline:'2026-10-08'}]},state([],{dayStart:'09:00',dayEnd:'10:00'}),now);
  assert.equal(plan.events.length,1);assert.equal(plan.unplaced[0].minutes,300);
});
test('fixed events conflict and take priority over flexible sessions',()=>{
  const fixed={...base,title:'면접',kind:'fixed',totalMinutes:60,fixedStart:'2026-10-08T09:00'};
  const plan=schedule({tasks:[{...base,totalMinutes:60,deadline:'2026-10-08'},fixed]},state(),now);
  assert.equal(plan.events[0].title,'면접');assert.equal(plan.events[1].start,'2026-10-08T10:10');
  const conflict=schedule({tasks:[fixed]},state([plan.events[0]]),now);
  assert.equal(conflict.events.length,0);assert.equal(conflict.unplaced[0].minutes,60);
});
test('weekday intersection, past exclusion, daily limit and partial session',()=>{
  const plan=schedule({tasks:[{...base,totalMinutes:95,sessionMinutes:50,daysOfWeek:[5],deadline:'2026-10-09'}]},state([],{dailyLimit:100}),now);
  assert.equal(plan.events.length,2);assert.ok(plan.events.every(e=>e.start.startsWith('2026-10-09')));
  assert.equal((parseTime(plan.events[1].end)-parseTime(plan.events[1].start))/60000,45);
  assert.throws(()=>schedule({tasks:[{...base,earliestDate:'2026-10-07'}]},state(),now));
});
test('overnight occupied events block following morning',()=>{
  const busy=event({title:'밤샘 업무',start:'2026-10-07T23:00',end:'2026-10-08T10:00',category:'생활'});
  const plan=schedule({tasks:[{...base,totalMinutes:60,deadline:'2026-10-08'}]},state([busy],{dailyLimit:720}),now);
  assert.equal(plan.events[0].start,'2026-10-08T10:10');
});
test('invalid preferences and task output are rejected',()=>{
  assert.throws(()=>preferences({...defaults,days:[]}));assert.throws(()=>preferences({...defaults,dayStart:'22:00',dayEnd:'09:00'}));
  for(const p of [{totalMinutes:-1},{sessionMinutes:0},{deadline:'2026-12-31'},{daysOfWeek:[8]},{preferredStart:'25:00'}])assert.throws(()=>schedule({tasks:[{...base,...p}]},state(),now));
});
test('fixed work hours occupy time but do not consume the flexible-study limit',()=>{
  const job=event({title:'근무',start:'2026-10-08T09:00',end:'2026-10-08T18:00',category:'생활'});
  const plan=schedule({tasks:[{...base,totalMinutes:180,deadline:'2026-10-08'}]},state([job],{dailyLimit:120}),now);
  assert.equal(plan.events.length,2);assert.equal(plan.unplaced[0].minutes,60);
  assert.equal(plan.events[0].start,'2026-10-08T18:10');
});
