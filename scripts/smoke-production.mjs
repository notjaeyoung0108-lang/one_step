import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const site='https://notjaeyoung0108-lang.github.io/one_step/';
const api='https://one-step-planner-api.one-step-planner.workers.dev';
const token=(await readFile(new URL('../private/access-token.txt',import.meta.url),'utf8')).trim();
const browser=await chromium.launch({headless:true,channel:'msedge'});
await mkdir('test-results',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(site);
  await page.getByRole('heading',{name:'나만의 일정 노트 열기'}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.fonts.check('20px Juache')&&document.fonts.check('20px IsYun')));
  await page.screenshot({path:'test-results/live-gate.png',fullPage:true});
  if(process.argv.includes('--gate-only')){console.log('PASS: published mobile gate and requested fonts.');}
  else{
    const denied=await fetch(api+'/api/state');assert.equal(denied.status,401);
    await page.locator('#token').fill(token);await page.locator('#unlock').click();
    await page.getByRole('heading',{name:'오늘도, 한 걸음이면 돼요.'}).waitFor({timeout:30000});
    await page.screenshot({path:'test-results/live-today.png',fullPage:true});
    // A real preview exercises hosted CORS, auth, AI, D1 and scheduling without changing user schedules.
    const before=await fetch(api+'/api/state',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
    await page.locator('#prompt').fill('다음 주 월요일부터 일요일까지 전공 공부 총 6시간을 한 번에 1시간씩 나눠 넣어 줘. 오전 9시부터 오후 10시 사이로 해 줘.');
    await page.getByRole('button',{name:'AI로 계획 짜기'}).click();
    await page.getByRole('heading',{name:'이렇게 나눠 봤어요'}).waitFor({timeout:90000});
    assert.equal(await page.locator('.proposal-event').count(),6,await page.locator('#modal').innerText());
    await page.screenshot({path:'test-results/live-plan.png'});
    const after=await fetch(api+'/api/state',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
    assert.equal(after.revision,before.revision);assert.deepEqual(after.events,before.events);
    await page.locator('#close-modal').click();await page.locator('#lock').click();await page.getByRole('heading',{name:'나만의 일정 노트 열기'}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS: production access control, mobile login, fonts, real 6-hour AI preview, no schedule mutations, logout.');
  }
}finally{await browser.close();}
