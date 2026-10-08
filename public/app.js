import { CONFIG } from './config.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='one-step.auth.v1', weekNames=['일','월','화','수','목','금','토'];
const iso=ms=>new Date(ms+9*3600000).toISOString().slice(0,16), today=()=>iso(Date.now()).slice(0,10);
const ms=s=>Date.parse(s+':00+09:00'), addDays=(d,n)=>iso(ms(d+'T00:00')+n*86400000).slice(0,10);
const dayName=d=>weekNames[new Date(ms(d+'T00:00')+9*3600000).getUTCDay()];
const dateLabel=d=>`${Number(d.slice(5,7))}월 ${Number(d.slice(8,10))}일 ${dayName(d)}요일`;
const duration=e=>Math.round((ms(e.end)-ms(e.start))/60000);
const timeLabel=e=>`${e.start.slice(11)}–${e.end.slice(0,10)!==e.start.slice(0,10)?e.end.slice(5,10)+' ':''}${e.end.slice(11)}`;
let auth=null,state=null,view='today',selected=today(),proposal=null,planning=false,draft='',focus=null,authEpoch=0;
let busy=false, toastTimer, installPrompt;
function storedAuth(){try{return JSON.parse(sessionStorage.getItem(KEY)||localStorage.getItem(KEY)||'null');}catch{return null;}}
function remember(a,persist){try{localStorage.removeItem(KEY);sessionStorage.removeItem(KEY);(persist?localStorage:sessionStorage).setItem(KEY,JSON.stringify(a));}catch{toast('이 브라우저에는 토큰을 저장할 수 없어요. 현재 화면에서만 사용할게요.');}}
function logout(message=''){
  authEpoch++;auth=null;state=null;proposal=null;focus=null;draft='';planning=false;busy=false;
  try{localStorage.removeItem(KEY);sessionStorage.removeItem(KEY);}catch{}
  $('#modal').close();gate(message);
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4500);}
function normalizeURL(raw){
  const u=new URL(raw);const local=['localhost','127.0.0.1'].includes(u.hostname);
  if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||(!local&&(u.protocol!=='https:'||!u.hostname.endsWith('.workers.dev'))))throw Error('서버 주소를 확인해 주세요.');
  return u.origin;
}
async function api(path,data){
  if(!auth)throw Error('토큰을 먼저 입력해 주세요.');
  const current=auth,epoch=authEpoch;
  let response;
  try{response=await fetch(current.base+path,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${current.token}`,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store',signal:AbortSignal.timeout(path==='/api/plan'?80000:20000)});}
  catch{throw Error(navigator.onLine?'서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.':'인터넷에 연결하면 일정을 확인하고 저장할 수 있어요.');}
  if(epoch!==authEpoch)throw Error('로그아웃했어요.');
  let result;try{result=await response.json();}catch{throw Error('서버 응답을 읽지 못했어요.');}
  if(response.status===401){logout(result.error);throw Error(result.error);}
  if(!response.ok)throw Object.assign(Error(result.error||'요청을 처리하지 못했어요.'),{status:response.status});
  return result;
}
function gate(message=''){
  $('#root').innerHTML=`<main class="gate" id="main"><div class="gate-inner">
    <img class="gate-mark" src="./icon.svg" alt=""><div class="eyebrow">A LITTLE PLAN, A BETTER DAY</div>
    <h1>오늘 한 걸음.</h1><p class="muted">머릿속에 맴도는 할 일을 꺼내면,<br>나의 하루에 맞는 작은 계획이 돼요.</p>
    <form id="login" class="card"><h2>나만의 일정 노트 열기</h2><p class="muted">접근 토큰으로 나의 공간에 들어가요.</p>
    ${message?`<p class="error" role="alert">${esc(message)}</p>`:''}
    <div class="field"><label for="token">접근 토큰</label><input type="password" id="token" placeholder="발급받은 토큰을 붙여 넣으세요" autocomplete="off" autocapitalize="off" spellcheck="false" required minlength="20" maxlength="512"></div>
    <label class="checkbox-label"><input type="checkbox" id="remember">이 기기에 토큰 기억하기</label>
    <button class="primary full" id="unlock" type="submit">내 하루 열기 <span aria-hidden="true">↗</span></button>
    ${!CONFIG.apiBase?`<details open><summary>연결 설정</summary><div class="field"><label for="api-base">서버 주소</label><input id="api-base" type="url" placeholder="https://…workers.dev" value="${location.hostname==='localhost'||location.hostname==='127.0.0.1'?'http://localhost:8787':''}" required></div></details>`:''}
    <p id="login-error" class="error" role="alert" hidden></p></form>
    <p class="install-note">나의 일정은 토큰을 확인한 뒤에만 열려요.<br>홈 화면에 추가하면 앱처럼 사용할 수 있어요.</p>
  </div></main>`;
  $('#login').onsubmit=async e=>{
    e.preventDefault();const button=$('#unlock'),error=$('#login-error');button.disabled=true;button.textContent='내 공간을 여는 중…';error.hidden=true;
    try{const base=normalizeURL(CONFIG.apiBase||$('#api-base').value.trim());const token=$('#token').value.trim();const persist=$('#remember').checked;
      auth={base,token};const result=await api('/api/state');state=result;remember(auth,persist);render();
    }catch(err){auth=null;if(error.isConnected){error.textContent=err.message;error.hidden=false;button.disabled=false;button.textContent='내 하루 열기 ↗';}}
  };
}
function sorted(events){return [...events].sort((a,b)=>a.start.localeCompare(b.start));}
function taskRow(e){return `<div class="task-row ${e.done?'completed':''}"><button class="check ${e.done?'done':''}" data-toggle="${esc(e.id)}" aria-label="${esc(e.title)} ${e.done?'완료 취소':'완료'}">${e.done?'✓':'○'}</button><button class="task-detail" data-edit="${esc(e.id)}"><span class="title">${esc(e.title)}</span><span class="task-meta">${timeLabel(e)} · ${esc(e.category)}${e.source==='ai'?' · AI 배치':''}</span></button></div>`;}
function composer(){return `<section class="composer" aria-labelledby="composer-label"><form id="plan-form"><label id="composer-label" for="prompt">할 일을 말해 주세요 <span aria-hidden="true">✳</span></label><textarea id="prompt" placeholder="이번 주 전공 공부 6시간을 빈 시간에 나눠 넣어 줘. 한 번에 1시간씩!" maxlength="2500" required ${planning?'disabled':''}>${esc(draft)}</textarea><div class="composer-footer"><small>가능한 시간을 찾아<br>적용 전에 보여드릴게요.</small><button class="primary" ${planning?'disabled':''}>${planning?'계획을 짜는 중…':'AI로 계획 짜기 ↗'}</button></div></form>
  <div class="suggestions"><button data-prompt="이번 주 전공 공부 6시간을 한 번에 1시간씩 나눠 넣어 줘.">전공 공부 나누기</button><button data-prompt="내일 오후 3시부터 30분 동안 면접 연습을 넣어 줘.">면접 연습 잡기</button></div>${planning?'<div class="loading" role="status"><span class="spinner"></span>빈 시간과 하루 분량을 살펴보고 있어요.</div>':''}</section>`;}
function todayView(){
  const day=today(),items=sorted(state.events.filter(e=>e.start.slice(0,10)===day)),done=items.filter(e=>e.done).length;
  const next=items.find(e=>!e.done&&ms(e.end)>Date.now()),late=items.filter(e=>!e.done&&ms(e.end)<=Date.now());
  return `<section class="intro"><div class="eyebrow">${esc(dateLabel(day))}</div><h1>오늘도, 한 걸음이면 돼요.</h1><p>거창한 계획보다 지금 시작할 작은 하나.</p></section>
  <div class="content-grid"><section class="card focus-card"><div class="row between"><span class="eyebrow">YOUR NEXT STEP</span><span>${next?`${duration(next)}분`:'한 번의 시작'}</span></div><h2>${next?esc(next.title):items.length&&done===items.length?'오늘의 계획을 마쳤어요.':'오늘의 첫 걸음을 정해 볼까요?'}</h2><p>${next?esc(next.firstStep||'준비를 마치고, 5분만 시작해 보세요.'):'아래에 할 일을 적으면 시간을 함께 찾아요.'}</p><div class="row"><button class="primary" ${next?`data-start="${esc(next.id)}"`:'id="first-plan"'}>${next?'지금 시작하기 →':'계획 적어 보기 →'}</button>${next?`<button class="subtle" data-edit="${esc(next.id)}">시간 바꾸기</button>`:''}</div></section>
  <section class="card"><div class="row between"><h2>작은 성취가 쌓여요</h2><span aria-hidden="true">✧</span></div><div class="progress-label"><span class="big">${done}<small> / ${items.length}</small></span><span class="muted">오늘 마친 일정</span></div><div class="progress-track"><progress value="${done}" max="${Math.max(1,items.length)}" aria-label="오늘 일정 완료율"></progress></div><p>${done?'이미 한 걸음 움직였어요. 다음도 가볍게.':'아직 시작 전이어도 괜찮아요.'}</p><div class="note">${late.length?`시간이 지난 일정 ${late.length}개가 있어요. 일정을 눌러 지금 가능한 시간으로 바꿔 보세요.`:'완벽한 하루가 아니어도, 해낸 일은 남아요.'}</div></section></div>
  ${composer()}<section><div class="section-head"><h2>오늘의 일정</h2><button class="subtle" id="add-event">＋ 직접 추가</button></div><div class="task-list">${items.length?items.map(taskRow).join(''):'<div class="empty">아직 비어 있는 하루예요. 약속부터 넣어 두면 AI가 그 시간을 피해서 계획해요.</div>'}</div></section>`;
}
function weekView(){
  const dow=new Date(ms(selected+'T00:00')+9*3600000).getUTCDay(),start=addDays(selected,-((dow+6)%7));
  const items=sorted(state.events.filter(e=>e.start.slice(0,10)===selected));
  return `<section class="intro"><div class="eyebrow">MAKE ROOM FOR WHAT MATTERS</div><h1>내 시간의 모양.</h1><p>약속 사이에, 내가 하고 싶은 일도.</p></section><div class="row between wrap"><h2>${Number(start.slice(5,7))}월의 한 주</h2><div class="date-controls"><button id="prev-week" aria-label="지난주">←</button><button id="this-week">오늘</button><button id="next-week" aria-label="다음 주">→</button></div></div><div class="calendar-strip">${Array.from({length:7},(_,i)=>{const d=addDays(start,i);return `<button class="day-btn ${d===selected?'active':''}" data-day="${d}" aria-label="${dateLabel(d)}" aria-pressed="${d===selected}"><span>${dayName(d)}</span><b>${Number(d.slice(8))}</b><i class="dot ${state.events.some(e=>e.start.slice(0,10)===d)?'':'invisible'}"></i></button>`;}).join('')}</div><div class="section-head"><h2>${dateLabel(selected)}</h2><button id="add-event" class="subtle">＋ 일정 추가</button></div>${items.length?items.map(e=>`<div class="timeline-item"><div class="time-label">${e.start.slice(11)}</div>${taskRow(e)}</div>`).join(''):'<div class="card empty">아직 일정이 없어요.<br>비워 둔 시간도 소중한 계획이에요.</div>'}${composer()}`;
}
function recordView(){
  const start=addDays(today(),-6),days=Array.from({length:7},(_,i)=>addDays(start,i));
  const events=state.events.filter(e=>e.start.slice(0,10)>=start&&e.start.slice(0,10)<=today()),done=events.filter(e=>e.done),total=done.reduce((n,e)=>n+duration(e),0);
  return `<section class="intro"><div class="eyebrow">LOOK HOW FAR YOU'VE COME</div><h1>해낸 일은 남으니까.</h1><p>쉬어 간 날까지, 나의 속도로 쌓는 기록.</p></section><div class="stats"><div class="stat"><small>최근 7일 완료</small><span class="big">${done.length}<small>개</small></span></div><div class="stat"><small>완료한 일정 분량</small><span class="big">${Math.floor(total/60)}<small>시간</small></span></div><div class="stat"><small>움직인 날</small><span class="big">${new Set(done.map(e=>e.start.slice(0,10))).size}<small>일</small></span></div></div><section class="card"><h2>이번 주의 작은 발자국</h2><div class="week-bars">${days.map(d=>{const count=done.filter(e=>e.start.slice(0,10)===d).length;return `<div class="bar-col"><small>${count}</small><meter min="0" max="${Math.max(5,...days.map(x=>done.filter(e=>e.start.slice(0,10)===x).length))}" value="${count}" aria-label="${dateLabel(d)} 완료 ${count}개"></meter><span>${dayName(d)}</span></div>`;}).join('')}</div><small>완료한 일정의 예정 시간을 합산해요.</small></section><div class="section-head"><h2>최근 마친 일정</h2></div>${done.length?sorted(done).reverse().map(taskRow).join(''):'<div class="empty">첫 번째 완료가 이곳에 남을 거예요.</div>'}`;
}
function render(){
  if(!auth||!state)return gate();
  $('#root').innerHTML=`<div class="shell"><header class="topbar"><a href="#today" class="brand"><img src="./icon.svg" alt="">오늘 한 걸음</a><div class="top-actions"><button class="subtle" id="refresh" aria-label="일정 새로고침">↻</button><button class="subtle" id="settings">설정</button><button class="subtle" id="lock">잠그기</button></div></header><main id="main">${!navigator.onLine?'<div class="offline-banner">인터넷에 다시 연결하면 일정을 저장할 수 있어요.</div>':''}${view==='week'?weekView():view==='record'?recordView():todayView()}</main><p class="install-note">서울 시간 기준 · 내 속도로, 한 걸음씩.</p></div><nav class="bottom-nav" aria-label="주요 메뉴">${[['today','◷','오늘'],['week','▦','일정'],['record','✓','기록']].map(([id,icon,title])=>`<button class="${view===id?'active':''}" data-view="${id}" aria-current="${view===id?'page':'false'}"><span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-label">${title}</span></button>`).join('')}</nav>`;
  $('#lock').onclick=()=>logout();$('#settings').onclick=settings;$('#refresh').onclick=()=>refresh();
  $$('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;location.hash=view;render();window.scrollTo(0,0);});
  $$('[data-toggle]').forEach(b=>b.onclick=()=>mutate({action:'toggle',id:b.dataset.toggle},'기록했어요.'));
  $$('[data-edit]').forEach(b=>b.onclick=()=>editEvent(b.dataset.edit));
  $$('[data-start]').forEach(b=>b.onclick=()=>startFocus(b.dataset.start));
  $$('[data-day]').forEach(b=>b.onclick=()=>{selected=b.dataset.day;render();});
  $('#add-event')?.addEventListener('click',()=>editEvent());
  $('#first-plan')?.addEventListener('click',()=>$('#prompt').focus());
  $('#prev-week')?.addEventListener('click',()=>{selected=addDays(selected,-7);render();});
  $('#next-week')?.addEventListener('click',()=>{selected=addDays(selected,7);render();});
  $('#this-week')?.addEventListener('click',()=>{selected=today();render();});
  $('#prompt')?.addEventListener('input',e=>draft=e.target.value);
  $$('[data-prompt]').forEach(b=>b.onclick=()=>{if(planning)return;draft=b.dataset.prompt;$('#prompt').value=draft;$('#prompt').focus();});
  $('#plan-form')?.addEventListener('submit',plan);
  if(focus)toast('집중 중이에요. 오늘 화면에서 시작 버튼을 누르면 이어서 볼 수 있어요.');
}
async function refresh(){try{const next=await api('/api/state');state=next;render();toast('최신 일정으로 열었어요.');}catch(e){toast(e.message);}}
async function mutate(data,message){
  if(busy)return false;busy=true;
  const buttons=$$('button');buttons.forEach(b=>b.disabled=true);
  try{state=await api('/api/mutate',{revision:state.revision,...data});proposal=null;render();if(message)toast(message);return true;}
  catch(e){toast(e.message);if(e.status===409)await refresh();return false;}
  finally{busy=false;buttons.forEach(b=>{if(b.isConnected)b.disabled=false;});}
}
function modal(title,content){const d=$('#modal');d.innerHTML=`<div class="modal-head"><h2 id="modal-title">${title}</h2><button type="button" id="close-modal" aria-label="닫기">×</button></div>${content}`;$('#close-modal').onclick=()=>d.close();if(!d.open)d.showModal();return d;}
function editEvent(id){
  const old=state.events.find(e=>e.id===id),base=(view==='week'?selected:today());
  const defaultStart=base===today()?iso(Math.ceil((Date.now()+5*60000)/300000)*300000):base+'T09:00';
  const e=old||{title:'',start:defaultStart,end:iso(ms(defaultStart)+30*60000),category:'공부',firstStep:''};
  modal(old?'일정 다듬기':'새 일정 적기',`<form id="event-form"><div class="field"><label for="event-title">무엇을 할까요?</label><input id="event-title" required maxlength="120" value="${esc(e.title)}" placeholder="예: 토질역학 10문제 풀기"></div><div class="form-grid"><div class="field"><label for="event-start">시작 · 서울 시간</label><input id="event-start" type="datetime-local" required value="${e.start}"></div><div class="field"><label for="event-end">끝</label><input id="event-end" type="datetime-local" required value="${e.end}"></div></div><div class="field"><label for="category">분류</label><select id="category">${['공부','취업','운동','생활','약속'].map(c=>`<option ${c===e.category?'selected':''}>${c}</option>`).join('')}</select></div><div class="field"><label for="first-step">가볍게 시작할 첫 행동</label><input id="first-step" maxlength="200" value="${esc(e.firstStep)}" placeholder="예: 교재 46쪽 펴기"></div><p id="event-error" role="alert" class="error" hidden></p><div class="modal-actions">${old?'<button type="button" class="subtle danger" id="delete-event">삭제</button>':''}<button class="primary">일정 저장하기</button></div></form>`);
  $('#event-form').onsubmit=async ev=>{ev.preventDefault();const input={title:$('#event-title').value,start:$('#event-start').value,end:$('#event-end').value,category:$('#category').value,firstStep:$('#first-step').value};
    if(input.end<=input.start){$('#event-error').hidden=false;$('#event-error').textContent='끝나는 시간을 시작 시간 뒤로 정해 주세요.';return;}
    if(await mutate({action:old?'update':'create',id,event:input},'일정을 저장했어요.'))$('#modal').close();
  };
  $('#delete-event')?.addEventListener('click',async()=>{if(confirm('이 일정을 삭제할까요?'))if(await mutate({action:'delete',id},'일정을 지웠어요.'))$('#modal').close();});
}
async function plan(e){
  e.preventDefault();if(planning)return;draft=$('#prompt').value.trim();if(!draft)return;
  planning=true;proposal=null;const epoch=authEpoch;render();
  try{const p=await api('/api/plan',{prompt:draft});if(epoch!==authEpoch)return;proposal=p;showProposal();}
  catch(err){toast(err.message);}finally{if(epoch===authEpoch){planning=false;render();}}
}
function showProposal(){
  const p=proposal;
  if(p.questions.length){modal('조금만 더 알려 주세요',`<p>${esc(p.summary)}</p><div class="note">${p.questions.map(q=>`<p>${esc(q)}</p>`).join('')}</div><form id="clarify"><div class="field"><label for="answer">답변</label><textarea id="answer" maxlength="1000" required placeholder="예: 이번 주 일요일까지, 하루에 1시간씩"></textarea></div><div class="modal-actions"><button class="primary">답변하고 다시 배치</button></div></form>`);$('#clarify').onsubmit=e=>{e.preventDefault();draft+='\n추가 답변: '+$('#answer').value;$('#modal').close();render();$('#plan-form').requestSubmit();};return;}
  const total=p.events.reduce((n,e)=>n+duration(e),0);
  modal('이렇게 나눠 봤어요',`<p>${esc(p.summary)}</p><div class="row wrap"><span class="pill">${p.events.length}개 일정</span><span class="pill">총 ${total}분</span><span class="pill">기존 일정과 겹치지 않아요</span></div>${p.notes.length?`<ul class="proposal-notes">${p.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}${p.unplaced.length?`<div class="warning"><b>아직 넣지 못한 분량이 있어요.</b>${p.unplaced.map(u=>`<p>${esc(u.title)} · ${u.minutes}분<br>${esc(u.reason)}</p>`).join('')}</div>`:''}<div>${p.events.map(e=>`<div class="proposal-event"><small>${dateLabel(e.start.slice(0,10))} · ${timeLabel(e)}</small><b>${esc(e.title)}</b><small>${esc(e.firstStep)}</small></div>`).join('')||'<p class="empty">배치할 수 있는 시간이 없어요. 설정에서 가능 시간을 늘리거나 요청 분량을 줄여 주세요.</p>'}</div><p class="muted">적용 전까지 일정은 바뀌지 않아요. 배치안은 30분 동안 유효해요.</p><div class="modal-actions"><button id="revise">다시 적기</button>${p.events.length?`<button class="primary" id="apply-plan">${p.unplaced.length?'가능한 '+p.events.length+'개만 적용':'이 계획으로 시작하기'}</button>`:''}</div>`);
  $('#revise').onclick=()=>{$('#modal').close();$('#prompt').focus();};
  $('#apply-plan')?.addEventListener('click',async()=>{const b=$('#apply-plan');b.disabled=true;b.textContent='저장하는 중…';try{state=await api('/api/apply',{id:p.id});draft='';proposal=null;$('#modal').close();render();toast('내 일정에 담았어요. 한 걸음 시작해 볼까요?');}catch(e){toast(e.message);b.disabled=false;b.textContent='계획 적용';if([409,410].includes(e.status)){b.disabled=true;b.textContent='새 배치안이 필요해요';await refresh();}}});
}
function settings(){
  const p=state.preferences;
  modal('나의 하루 설정',`<form id="settings-form"><p class="muted">AI가 계획을 넣어도 괜찮은 시간을 알려 주세요.</p><div class="form-grid"><div class="field"><label for="day-start">하루 시작</label><input id="day-start" type="time" value="${p.dayStart}" required></div><div class="field"><label for="day-end">하루 마무리</label><input id="day-end" type="time" value="${p.dayEnd}" required></div></div><div class="field"><label>계획 가능한 요일</label><div class="weekday-options">${[1,2,3,4,5,6,0].map(d=>`<label><input type="checkbox" name="weekday" value="${d}" ${p.days.includes(d)?'checked':''}>${weekNames[d]}</label>`).join('')}</div></div><div class="form-grid"><div class="field"><label for="daily-limit">하루 최대 일정 · 분</label><input id="daily-limit" type="number" min="15" max="720" step="5" required value="${p.dailyLimit}"></div><div class="field"><label for="break-minutes">일정 사이 휴식 · 분</label><input id="break-minutes" type="number" min="0" max="60" step="5" required value="${p.breakMinutes}"></div></div><p class="note">가능 시간은 자동 배치에 적용돼요. 점심·출근·고정 약속은 일정으로 추가해 두면 그 시간을 피해요. 현재 배치는 앞으로 31일 이내에서 가능해요.</p><div class="modal-actions"><button class="primary">설정 저장</button></div></form><div class="section-head"><h3>내 기록 보관하기</h3></div><button id="export">일정 백업 내려받기</button><p class="muted">백업 파일에는 일정 내용이 담겨요. 접근 토큰은 포함하지 않아요.</p><div class="section-head"><h3>홈 화면에 두기</h3></div>${installPrompt?'<button id="install-app">앱 설치하기</button>':'<p class="muted">아이폰은 Safari 공유 메뉴에서 ‘홈 화면에 추가’, 안드로이드는 브라우저 메뉴에서 ‘앱 설치’를 선택해 주세요.</p>'}<p class="connection">${esc(auth.base)}</p>`);
  $('#settings-form').onsubmit=async e=>{e.preventDefault();const p={dayStart:$('#day-start').value,dayEnd:$('#day-end').value,days:$$('input[name=weekday]:checked').map(e=>Number(e.value)),dailyLimit:Number($('#daily-limit').value),breakMinutes:Number($('#break-minutes').value)};if(await mutate({action:'preferences',preferences:p},'나의 가능 시간을 저장했어요.'))$('#modal').close();};
  $('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),events:state.events,preferences:state.preferences},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`one-step-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('#install-app')?.addEventListener('click',async()=>{await installPrompt.prompt();installPrompt=null;});
}
function startFocus(id){
  const e=state.events.find(e=>e.id===id);if(!e)return;
  if(focus&&focus.id!==id&&!confirm('진행 중인 집중 타이머를 마치고 새로 시작할까요?'))return;
  if(!focus||focus.id!==id)focus={id,end:Date.now()+Math.min(duration(e),25)*60000};
  modal('지금은, 이 일 하나',`<span class="pill">가볍게 집중하기</span><h1>${esc(e.title)}</h1><p>${esc(e.firstStep||'준비를 마치고 첫 번째 행동을 시작해 보세요.')}</p><div class="timer" id="timer" role="timer"></div><p class="muted">${Math.min(duration(e),25)}분만 함께 해 봐요. 시간이 끝나도 완료는 직접 표시해요.</p><div class="modal-actions"><button id="stop-focus">집중 마치기</button><button class="primary" id="complete-focus">일정 완료 ✓</button></div>`);
  $('#stop-focus').onclick=()=>{focus=null;$('#modal').close();};$('#complete-focus').onclick=async()=>{if(await mutate({action:'toggle',id},'한 걸음 해냈어요!')){focus=null;$('#modal').close();}};tick();
}
function tick(){if(!focus||!$('#timer'))return;const sec=Math.max(0,Math.ceil((focus.end-Date.now())/1000));$('#timer').textContent=sec?`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`:'한 걸음 해냈어요';}
setInterval(tick,1000);
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
addEventListener('hashchange',()=>{const name=location.hash.slice(1);if(['today','week','record'].includes(name)&&view!==name){view=name;render();}});
addEventListener('offline',()=>{if(state)render();});addEventListener('online',()=>{if(state)render();});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
async function boot(){auth=storedAuth();if(!auth)return gate();try{auth.base=normalizeURL(CONFIG.apiBase||auth.base);state=await api('/api/state');view=['today','week','record'].includes(location.hash.slice(1))?location.hash.slice(1):'today';render();}catch(e){gate(e.message);}}
boot();
