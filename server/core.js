export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const defaults = { dayStart: '09:00', dayEnd: '22:00', days: [0,1,2,3,4,5,6], dailyLimit: 240, breakMinutes: 10 };
export const categories = ['공부', '취업', '운동', '생활', '약속'];
export const localISO = ms => new Date(ms + 9 * 3600000).toISOString().slice(0,16);
export const todayKST = (now = Date.now()) => localISO(now).slice(0,10);
export function parseTime(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) throw new AppError('날짜와 시간을 확인해 주세요.');
  const ms = Date.parse(s + ':00+09:00');
  if (!Number.isFinite(ms) || localISO(ms) !== s) throw new AppError('존재하지 않는 날짜나 시간이에요.');
  return ms;
}
export const minutes = s => Number(s.slice(0,2)) * 60 + Number(s.slice(3));
const validClock = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export function cleanText(s, max = 120) {
  if (typeof s !== 'string' || !s.trim() || s.length > max) throw new AppError('입력 내용의 길이를 확인해 주세요.');
  return s.trim();
}
export function preferences(p) {
  if (!p || !validClock(p.dayStart) || !validClock(p.dayEnd) || p.dayStart >= p.dayEnd ||
      !Array.isArray(p.days) || !p.days.length || p.days.some(d => !Number.isInteger(d) || d < 0 || d > 6) ||
      !Number.isInteger(p.dailyLimit) || p.dailyLimit < 15 || p.dailyLimit > 720 ||
      !Number.isInteger(p.breakMinutes) || p.breakMinutes < 0 || p.breakMinutes > 60) throw new AppError('활동 시간과 하루 최대 시간을 확인해 주세요.');
  return { dayStart:p.dayStart, dayEnd:p.dayEnd, days:[...new Set(p.days)], dailyLimit:p.dailyLimit, breakMinutes:p.breakMinutes };
}
export function event(input, id = crypto.randomUUID()) {
  if(!input || typeof input!=='object') throw new AppError('일정 내용을 확인해 주세요.');
  const start = parseTime(input.start), end = parseTime(input.end);
  if (end <= start || end-start > 24*3600000) throw new AppError('일정 길이는 1분 이상, 24시간 이내로 입력해 주세요.');
  if (!categories.includes(input.category)) throw new AppError('분류를 선택해 주세요.');
  return { id, title:cleanText(input.title), start:input.start, end:input.end, category:input.category,
    firstStep: typeof input.firstStep === 'string' ? input.firstStep.slice(0,200) : '', done:input.done === true,
    source:input.source === 'ai' ? 'ai' : 'manual', flexible:input.flexible === true };
}
export function overlap(a,b,gap=0) {
  return parseTime(a.start) < parseTime(b.end)+gap*60000 && parseTime(a.end)+gap*60000 > parseTime(b.start);
}
export function checkConflicts(events, existing = []) {
  const all = [...existing];
  for (const e of events) {
    const other = all.find(x => x.id !== e.id && overlap(e,x));
    if (other) throw new AppError(`‘${e.title}’ 일정이 ‘${other.title}’ 일정과 겹쳐요. 시간을 바꿔 주세요.`,409);
    all.push(e);
  }
}
const dateOK = d => { try { return parseTime(d+'T00:00') >= 0; } catch { return false; } };
function task(t, now) {
  const title = cleanText(t.title);
  if (!['fixed','flexible'].includes(t.kind) || !categories.includes(t.category) ||
    !Number.isInteger(t.totalMinutes) || t.totalMinutes < 5 || t.totalMinutes > 2400 ||
    !Number.isInteger(t.sessionMinutes) || t.sessionMinutes < 5 || t.sessionMinutes > 240 ||
    !dateOK(t.earliestDate) || !dateOK(t.deadline) || t.deadline < t.earliestDate ||
    t.earliestDate < todayKST(now) || parseTime(t.deadline+'T23:59') > now+32*86400000 ||
    !validClock(t.preferredStart) || !validClock(t.preferredEnd) || t.preferredStart >= t.preferredEnd ||
    !Array.isArray(t.daysOfWeek) || !t.daysOfWeek.length || t.daysOfWeek.some(d=>!Number.isInteger(d)||d<0||d>6)) throw new AppError(`‘${title}’의 배치 조건을 해석하지 못했어요. 날짜와 시간을 더 구체적으로 적어 주세요.`,422);
  if (t.kind === 'fixed' && (typeof t.fixedStart !== 'string' || parseTime(t.fixedStart) < now)) throw new AppError('지난 시간에는 새 일정을 배치할 수 없어요.',422);
  return { ...t, title };
}
// AI extracts intent. Actual placement is deterministic and checked independently.
export function schedule(raw, state, now = Date.now()) {
  if (!Array.isArray(raw.tasks) || raw.tasks.length > 30) throw new AppError('한 번에 최대 30개 목표까지 배치할 수 있어요.',422);
  const prefs = preferences(state.preferences);
  const tasks = raw.tasks.map(t=>task(t,now)).sort((a,b)=>(a.kind==='fixed'?0:1)-(b.kind==='fixed'?0:1) || a.deadline.localeCompare(b.deadline));
  const events=[], unplaced=[];
  const occupied = [...state.events];
  for (const t of tasks) {
    if (t.kind === 'fixed') {
      const start = parseTime(t.fixedStart);
      const e = event({ ...t, start:t.fixedStart, end:localISO(start+t.totalMinutes*60000), source:'ai', flexible:false });
      if (occupied.some(o=>overlap(e,o))) { unplaced.push({title:t.title,minutes:t.totalMinutes,reason:'정해진 시간이 기존 일정과 겹쳐요.'}); continue; }
      occupied.push(e); events.push(e); continue;
    }
    let remaining=t.totalMinutes;
    while (remaining > 0) {
      if (events.length >= 150) break;
      const length=Math.min(remaining,t.sessionMinutes), candidates=[];
      for (let day=parseTime(t.earliestDate+'T00:00'); day<=parseTime(t.deadline+'T00:00'); day+=86400000) {
        const date=todayKST(day), weekday=new Date(day+9*3600000).getUTCDay();
        if (!prefs.days.includes(weekday) || !t.daysOfWeek.includes(weekday)) continue;
        const start=Math.max(day+minutes(prefs.dayStart)*60000, day+minutes(t.preferredStart)*60000, Math.ceil(now/300000)*300000);
        const end=day+Math.min(minutes(prefs.dayEnd),minutes(t.preferredEnd))*60000;
        const dayEvents=occupied.filter(e=>parseTime(e.start)<day+86400000 && parseTime(e.end)>day);
        const load=dayEvents.reduce((n,e)=>n+(Math.min(parseTime(e.end),day+86400000)-Math.max(parseTime(e.start),day))/60000,0);
        const flexibleLoad=dayEvents.filter(e=>e.flexible).reduce((n,e)=>n+(Math.min(parseTime(e.end),day+86400000)-Math.max(parseTime(e.start),day))/60000,0);
        if(flexibleLoad+length>prefs.dailyLimit) continue;
        for(let s=start;s+length*60000<=end;s+=5*60000) {
          const e={start:localISO(s),end:localISO(s+length*60000)};
          if (!occupied.some(o=>overlap(e,o,prefs.breakMinutes))) { candidates.push({ ...e,load }); break; }
        }
      }
      candidates.sort((a,b)=>a.load-b.load || a.start.localeCompare(b.start));
      if(!candidates.length) break;
      const e=event({...t,...candidates[0],source:'ai',flexible:true});
      occupied.push(e); events.push(e); remaining-=length;
    }
    if(remaining) unplaced.push({title:t.title,minutes:remaining,reason:'가능 시간·휴식 간격·하루 최대 시간을 만족하는 빈 시간이 부족해요.'});
  }
  checkConflicts(events,state.events);
  return {events:events.sort((a,b)=>a.start.localeCompare(b.start)),unplaced};
}
const str={type:'string'}, integer={type:'integer'};
const taskFields={ title:str, kind:{type:'string',enum:['fixed','flexible']}, totalMinutes:integer, sessionMinutes:integer,
  earliestDate:str, deadline:str, preferredStart:str, preferredEnd:str, daysOfWeek:{type:'array',items:integer},
  fixedStart:{type:['string','null']}, category:{type:'string',enum:categories}, firstStep:str };
export const intentSchema={type:'object',additionalProperties:false,properties:{
  summary:str, questions:{type:'array',items:str}, notes:{type:'array',items:str},
  tasks:{type:'array',items:{type:'object',additionalProperties:false,properties:taskFields,required:Object.keys(taskFields)}}
},required:['summary','questions','notes','tasks']};
