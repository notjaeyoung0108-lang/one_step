import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {localISO} from '../server/core.js';
const token=(await readFile(new URL('../private/access-token.txt',import.meta.url),'utf8')).trim();
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const api='http://127.0.0.1:8787',headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
async function call(path,data){const r=await fetch(api+path,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined});const json=await r.json();assert.ok(r.ok,JSON.stringify(json));return json;}
await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
try{
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('heading',{name:'나만의 일정 노트 열기'}).waitFor();
  await page.screenshot({path:'test-results/mobile-gate.png',fullPage:true});
  await page.locator('#token').fill('wrong-token-that-is-long-enough');
  await page.locator('#unlock').click();
  await page.getByRole('alert').filter({hasText:'토큰을 확인'}).waitFor();
  await page.locator('#token').fill(token);await page.locator('#unlock').click();
  await page.getByRole('heading',{name:'오늘도, 한 걸음이면 돼요.'}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('one-step.auth.v1')),null);
  await page.locator('#add-event').click();
  await page.locator('#event-title').fill('브라우저 검증용 면접 연습');
  const start=localISO(Date.now()+2*3600000),end=localISO(Date.now()+3*3600000);
  await page.locator('#event-start').fill(start);await page.locator('#event-end').fill(end);await page.locator('#first-step').fill('자기소개 한 번 말하기');
  await page.getByRole('button',{name:'일정 저장하기'}).click();
  await page.locator('#modal').waitFor({state:'hidden'});
  await page.getByRole('button',{name:/브라우저 검증용 면접 연습 완료$/}).click();
  await page.getByRole('button',{name:'브라우저 검증용 면접 연습 완료 취소'}).waitFor();
  await page.getByRole('button',{name:'브라우저 검증용 면접 연습 완료 취소'}).click();
  await page.locator('#settings').click();await page.locator('#daily-limit').fill('300');await page.getByRole('button',{name:'설정 저장'}).click();await page.locator('#modal').waitFor({state:'hidden'});
  assert.equal((await call('/api/state')).preferences.dailyLimit,300);
  await page.screenshot({path:'test-results/mobile-today.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile overflow');
  await page.locator('[data-view="week"]').click();await page.screenshot({path:'test-results/mobile-week.png',fullPage:true});
  await page.locator('[data-view="record"]').click();await page.getByRole('heading',{name:'해낸 일은 남으니까.'}).waitFor();
  await page.locator('[data-view="today"]').click();
  // Live AI integration: preview must not write anything; apply persists exactly once.
  const before=await call('/api/state');
  const first=localISO(Date.now()+86400000).slice(0,10),last=localISO(Date.now()+4*86400000).slice(0,10);
  await page.locator('#prompt').fill(`${first}부터 ${last}까지 전공 공부 6시간을 빈 시간에 나눠 넣어 줘. 한 번에 1시간씩, 오전 9시부터 오후 10시 사이에 해 줘.`);
  await page.getByRole('button',{name:'AI로 계획 짜기'}).click();
  await page.getByRole('heading',{name:'이렇게 나눠 봤어요'}).waitFor({timeout:90000});
  assert.equal((await call('/api/state')).revision,before.revision,'preview mutated state');
  assert.equal(await page.locator('.proposal-event').count(),6,await page.locator('#modal').innerText());
  await page.screenshot({path:'test-results/mobile-plan.png',fullPage:true});
  await page.locator('#apply-plan').click();await page.locator('#modal').waitFor({state:'hidden'});
  let after=await call('/api/state');assert.equal(after.events.length,before.events.length+6);
  // Injection remains text, even when titles arrive from storage.
  const currentDate=localISO(Date.now()).slice(0,10);
  await call('/api/mutate',{action:'create',revision:after.revision,event:{title:'<img src=x onerror=alert(1)>',start:currentDate+'T01:00',end:currentDate+'T02:00',category:'생활'}});
  await page.setViewportSize({width:1440,height:1000});await page.locator('#refresh').click();await page.getByText('<img src=x onerror=alert(1)>',{exact:true}).waitFor();
  assert.equal(await page.locator('img[onerror]').count(),0);
  await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.fonts.check('20px Juache')&&document.fonts.check('20px IsYun')),true);
  await page.screenshot({path:'test-results/desktop-today.png',fullPage:true});
  await page.locator('#lock').click();await page.getByRole('heading',{name:'나만의 일정 노트 열기'}).waitFor();
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('one-step.auth.v1')),null);
  assert.equal(await page.locator('.task-row').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile gate, token rejection, CRUD, completion, preferences, navigation, live AI preview + apply, no overflow, logout, desktop rendering.');
}finally{
  // This script only runs against local D1. Remove all local test events.
  let current=await call('/api/state');
  for(const e of current.events)current=await call('/api/mutate',{action:'delete',id:e.id,revision:current.revision});
  await browser.close();
}
