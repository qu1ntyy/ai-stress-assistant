/* Mindful Space 0.4 — offline-first, no network requests. */
(function(){
"use strict";
const screen=document.getElementById("screen"),toastEl=document.getElementById("toast");
const STORE="mindful_space_v3";
let page="home",chat=[],selectedPractice=null,practiceStep=0,busy=false,journalMonth=new Date(),journalFilter="",editingId=null;
const AI_PROVIDER={name:"gemini",endpoint:"",enabled:false}; // Provider adapter is prepared; network calls remain disabled until deployment is approved.
const AI_CONSENT_KEY="mindful_space_ai_consent_v1";
const hasAIConsent=()=>{try{return localStorage.getItem(AI_CONSENT_KEY)==="yes"}catch{return false}};
const emptyData=()=>({journal:[],completed:[],checkins:[],longTermAnswers:null,profileName:"",program:null});
function storedRaw(){
 try{
  const native=window.MindfulStorage;
  if(native&&typeof native.load==="function"){
   const saved=native.load();
   if(saved)return saved;
   const legacy=localStorage.getItem(STORE);
   if(legacy){native.save(legacy);return legacy}
   return null;
  }
  return localStorage.getItem(STORE);
 }catch{return localStorage.getItem(STORE)}
}
const read=()=>{try{const d=JSON.parse(storedRaw()||"null")||{};return {...emptyData(),...d,journal:Array.isArray(d.journal)?d.journal:[],completed:Array.isArray(d.completed)?d.completed:[],checkins:Array.isArray(d.checkins)?d.checkins:[]}}catch{return emptyData()}};
const write=data=>{const raw=JSON.stringify(data);try{if(window.MindfulStorage&&typeof window.MindfulStorage.save==="function"){window.MindfulStorage.save(raw);return}}catch{}localStorage.setItem(STORE,raw)};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateNow=()=>new Date().toLocaleDateString("ru-RU");
const dateKey=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const parseDate=s=>{if(!s)return null;const m=String(s).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return m?new Date(+m[3],+m[2]-1,+m[1]):new Date(s)};
function toast(message){toastEl.textContent=message;toastEl.classList.add("show");clearTimeout(toastEl._timer);toastEl._timer=setTimeout(()=>toastEl.classList.remove("show"),2300)}
function go(next){page=next;render();window.scrollTo(0,0)}
function nav(){document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page||(page==="stress"||page==="long"||page==="long-result")&&b.dataset.page==="home"))}
const practices=[
{id:"ground",title:"Ориентирование вокруг",category:"Здесь и сейчас",time:"3 минуты",desc:"Мягко переключить внимание на нейтральные детали вокруг.",steps:["Устройся так, чтобы тебе было удобно. Глаза можно оставить открытыми.","Назови про себя три предмета, которые видишь.","Заметь два звука вокруг.","Почувствуй опору под ногами или телом. Закончи в своём темпе."],caution:"Если упражнение неприятно или усиливает напряжение, остановись и выбери другое занятие."},
{id:"pause",title:"Короткая пауза",category:"Восстановление",time:"2 минуты",desc:"Небольшой перерыв без требования немедленно всё решить.",steps:["Если возможно, отложи одну задачу на пару минут.","Выбери удобное положение.","Посмотри на спокойный объект или в окно.","Подумай, какой небольшой следующий шаг сейчас реалистичен."],caution:"Это не замена отдыху или поддержке, если они нужны."},
{id:"facts",title:"Факты и предположения",category:"Мысли",time:"5 минут",desc:"Разделить то, что известно точно, и то, что пока кажется вероятным.",steps:["Кратко опиши ситуацию одним-двумя предложениями.","Запиши факты, которые можно проверить.","Отдельно отметь мысли и предположения.","Подумай, какой информации не хватает. Не нужно заставлять себя мыслить позитивно."],caution:"Если разбор ситуации начинает утомлять, можно остановиться в любой момент."},
{id:"next",title:"Один посильный шаг",category:"Планирование",time:"4 минуты",desc:"Уменьшить ощущение перегруженности через очень небольшой план.",steps:["Запиши всё, что сейчас крутится в голове, коротким списком.","Выбери только один пункт, который действительно важен сейчас.","Раздели его на действие, которое займёт не больше 10 минут.","Реши, когда и где попробуешь сделать этот шаг."],caution:"Необязательно выполнять весь список. Отдых тоже может быть подходящим следующим шагом."},
{id:"kind",title:"Поддерживающая фраза",category:"Отношение к себе",time:"3 минуты",desc:"Подобрать к себе более спокойные и справедливые слова.",steps:["Представь, что похожую ситуацию переживает близкий тебе человек.","Подумай, что ты сказал(а) бы ему без осуждения.","Попробуй сформулировать одну такую фразу для себя.","Оставь её как напоминание — не обязательно сразу в неё верить."],caution:"Не нужно обесценивать сложность ситуации или принуждать себя к позитиву."}
];
function localReply(message){
 const t=message.toLowerCase();
 if(/не хочу жить|не хочется жить|покончить с собой|убить себя|навредить себе|причинить себе вред|сделать себе больно|боюсь за свою безопасность|мне угрожают|сейчас небезопасно|меня могут ударить/i.test(t))return "Спасибо, что сказал(а) об этом. Тебе не нужно справляться в одиночку. Пожалуйста, прямо сейчас обратись к взрослому или другому человеку, которому доверяешь, и скажи, что тебе нужна помощь и чтобы кто-то побыл рядом. Если опасность непосредственная, перейди в безопасное место рядом с людьми и позвони в местную экстренную службу. Я могу помочь составить короткое сообщение этому человеку.";
 if(/сон|не сплю|бессон|устал|устала|не высыпа/i.test(t))return "Похоже, отдых сейчас занимает важное место в твоих переживаниях. Что больше мешает: трудно переключиться вечером, не хватает времени на сон или после отдыха всё равно остаётся усталость?";
 if(/уч[её]б|экзамен|школ|работ|дедлайн|домашн/i.test(t))return "Похоже, нагрузка может быть связана с учёбой или задачами. Давай не будем пытаться решить всё сразу. Какая одна вещь сейчас требует внимания в первую очередь — и что из остального может подождать?";
 if(/тревог|страш|пережива|волную|паник/i.test(t))return "Похоже, сейчас есть переживание, которое занимает много внимания. Можно начать спокойно: что в этой ситуации известно точно, а что пока остаётся предположением?";
 if(/зл|раздраж|бесит|сорвал/i.test(t))return "Похоже, ситуация вызвала сильное раздражение. Не нужно ругать себя за эмоцию. Что именно задело сильнее всего: само событие, чьи-то слова или ощущение несправедливости?";
 return "Спасибо, что рассказал(а). Я могу помочь разложить ситуацию на части, но сейчас работаю офлайн по простым правилам, а не как полноценная нейросеть. Что было бы полезнее: чтобы тебя просто выслушали, чтобы вместе разобраться или чтобы найти небольшой следующий шаг?";
}
function homePage(){const d=read(),last=d.checkins[0];return `<div class="eyebrow">ТВОЁ ПРОСТРАНСТВО ПОДДЕРЖКИ</div><section class="hero"><div class="eyebrow">ДОБРО ПОЖАЛОВАТЬ</div><h1 class="h1">Небольшая пауза — тоже шаг вперёд.</h1><p class="sub">Здесь можно спокойно разобраться в ощущениях и выбрать следующий шаг. Без оценок и спешки.</p></section><div class="section-head"><h2>Как ты сейчас?</h2></div><div class="mood-row">${[["🙂","Неплохо"],["😐","По-разному"],["😟","Непросто"]].map(([e,t])=>`<button class="mood-button" data-mood="${t}"><span>${e}</span>${t}</button>`).join("")}</div>${last?`<p class="muted" style="font-size:11px;margin-top:10px">Последняя отметка: ${esc(last.mood)} · ${esc(last.date)}</p>`:""}<div class="section-head"><h2>Продолжить заботу о себе</h2><button class="button ghost" data-page="practices">Все практики</button></div><button class="mode-card" data-page="stress"><span class="mode-icon">☁</span><span><strong>Стресс сейчас</strong><small>Разобраться с конкретной ситуацией и найти поддержку на данный момент.</small></span><span class="arrow">›</span></button><button class="mode-card long" data-page="long"><span class="mode-icon">🌿</span><span><strong>Длительный стресс</strong><small>Посмотреть на повседневную нагрузку и выбрать посильные изменения.</small></span><span class="arrow">›</span></button><div class="notice">Приложение предназначено для самоподдержки. Оно не ставит диагнозы и не заменяет помощь специалиста или доверенного взрослого.</div>`}
function stressPage(){return `<button class="back" data-page="home">← Назад</button><div class="eyebrow">СТРЕСС СЕЙЧАС</div><h1 class="h1">Что произошло?</h1><p class="sub">Расскажи столько, сколько комфортно. Не указывай имена, адреса и другие личные данные.</p><form id="stress-form"><textarea class="textarea" name="message" maxlength="1800" required placeholder="Что сейчас беспокоит?"></textarea><button class="button full">Продолжить</button></form><div class="notice">Можно написать всего пару слов. Необязательно описывать всё подробно.</div>`}
function longQuestionnairePage(){const saved=read().longTermAnswers||{};return `<button class="back" data-page="home">← Назад</button><div class="eyebrow">ДЛИТЕЛЬНЫЙ СТРЕСС · ЗНАКОМСТВО</div><h1 class="h1">Давай посмотрим на общую картину</h1><p class="sub">Это не диагностический тест. Несколько вопросов помогут определить, какие повседневные области тебе хотелось бы поддержать.</p><form id="long-form"><label class="field-label">Как давно ты замечаешь напряжение?</label><select class="select" name="duration"><option>Несколько дней</option><option>Несколько недель</option><option>Несколько месяцев</option><option>Дольше</option><option>Трудно определить</option></select><label class="field-label">Что сейчас сильнее всего влияет на самочувствие?</label><select class="select" name="source"><option>Учёба или работа</option><option>Отношения и общение</option><option>Большое количество дел</option><option>Неопределённость</option><option>Сон и режим</option><option>Другое или несколько факторов</option></select><label class="field-label">Как ты оцениваешь качество своего отдыха?</label><select class="select" name="rest"><option>В основном удаётся отдыхать</option><option>Иногда не хватает отдыха</option><option>Часто не получается восстановиться</option><option>Пока сложно оценить</option></select><label class="field-label">Как напряжение отражается на повседневности?</label><select class="select" name="impact"><option>Почти не мешает привычным делам</option><option>Иногда мешает сосредоточиться или отдыхать</option><option>Заметно влияет на несколько сфер жизни</option><option>Трудно оценить</option></select><label class="field-label">Что хотелось бы улучшить в первую очередь?</label><select class="select" name="goal"><option>Лучше понимать свои эмоции</option><option>Находить время на отдых</option><option>Справляться с напряжёнными ситуациями</option><option>Улучшить повседневный режим</option><option>Пока хочу разобраться</option></select><button class="button full" type="submit" style="margin-top:20px">Сформировать мой обзор</button></form><div class="notice green">Можно пропустить анкету или вернуться к ней позже. Здесь нет правильных и неправильных ответов.</div>`}
function longPage(){const d=read();if(d.program){const p=d.program,saved=(p.history||[]).filter(x=>x.status==="Сохранён").length;return `<div class="eyebrow">ДЛИТЕЛЬНЫЙ СТРЕСС</div><h1 class="h1">Твоя программа уже готова</h1><p class="sub">Анкета уже пройдена. Можно продолжить с того места, где ты остановился(ась).</p><div class="card"><span class="tag">Фокус: ${esc(p.focus||"Твоя поддержка")}</span><div class="profile-line"><b>Сохранённых дней</b><span>${saved}</span></div><div class="profile-line"><b>Статус</b><span>${p.finished?"Завершена":p.paused?"На паузе":"Продолжается"}</span></div><button class="button full" data-page="program">Продолжить программу</button></div><button class="button secondary full" data-page="long-edit">Изменить ответы анкеты</button><div class="notice">Повторно проходить анкету не нужно. Текущая программа и её история сохраняются.</div>`}return longQuestionnairePage()}
function dailyTasks(a,dayNumber,d){
 const focus=a.goal||"Пока хочу разобраться";
 const source=a.source||"";
 const rest=a.rest||"";
 const impact=a.impact||"";
 const lastMood=d.checkins?.[0]?.mood||"";
 const gentle=/Непросто|Напряжённо|Устал/i.test(lastMood)||/часто не получается|заметно влияет/i.test(rest+" "+impact);
 const pools={
  rest:[
   "Заметь, в какой момент дня тебе особенно нужна пауза.",
   "Выбери короткий перерыв без обязательных дел.",
   "Подумай, что помогает тебе переключиться после нагрузки.",
   "Оцени, какой вид отдыха сегодня был бы реалистичным.",
   "Если удобно, освободи несколько минут от необязательных задач.",
   "Вспомни занятие, после которого обычно становится немного спокойнее.",
   "Подумай, что сегодня можно перенести или упростить."
  ],
  emotions:[
   "Один раз за день попробуй назвать чувство, которое заметил(а).",
   "Если хочется, запиши, что могло повлиять на настроение.",
   "Попробуй отнестись к своему чувству без оценки и критики.",
   "Заметь, меняется ли твоё состояние в разных ситуациях.",
   "Подумай, какая поддержка была бы сейчас кстати.",
   "Отдели само чувство от ситуации, которая могла его вызвать.",
   "Выбери слово или фразу, которая точнее всего описывает сегодняшний день."
  ],
  routine:[
   "Выбери одну привычную точку дня для небольшой паузы.",
   "Добавь к обычному делу короткое действие для переключения.",
   "Понаблюдай, какой распорядок сегодня оказался удобным.",
   "Выбери одну небольшую задачу и реалистичное время для неё.",
   "Подумай, что можно упростить в завтрашнем дне.",
   "Отметь, в какое время дня тебе проще сосредоточиться.",
   "Выбери одно необязательное дело, которое можно перенести."
  ],
  study:[
   "Выбери одну учебную задачу, которую действительно важно сделать первой.",
   "Раздели большую задачу на самый маленький понятный шаг.",
   "Подумай, что можно уточнить у преподавателя или одноклассника.",
   "Определи, какая задача может подождать до другого дня.",
   "Попробуй выделить короткий промежуток на одно дело, а затем сделать паузу."
  ],
  people:[
   "Подумай, с кем тебе обычно спокойно и безопасно общаться.",
   "Если хочется, сформулируй одну вещь, которую важно донести в разговоре.",
   "Заметь, после какого общения у тебя остаётся больше сил.",
   "Подумай, какая граница или просьба помогла бы тебе чувствовать себя комфортнее."
  ],
  uncertainty:[
   "Раздели ситуацию на то, что уже известно, и то, что пока неизвестно.",
   "Выбери один вопрос, на который можно найти ответ.",
   "Отметь, что сейчас зависит от тебя, а что нет.",
   "Подумай, кто мог бы помочь разобраться с неопределённостью."
  ],
  general:[
   "Заметь одну ситуацию, которая сегодня занимала много внимания.",
   "Раздели то, на что можешь повлиять, и то, что пока не зависит от тебя.",
   "Выбери один небольшой посильный шаг.",
   "Подумай, с кем можно спокойно обсудить то, что беспокоит.",
   "Отметь одну вещь, которая сегодня хоть немного помогла.",
   "Подумай, какая часть сегодняшней нагрузки действительно важна.",
   "Заметь, что сегодня получилось сделать в удобном для тебя темпе."
  ]
 };
 let key=/отдых|сон/i.test(focus)||/сон и режим/i.test(source)?"rest":
  /эмоц/i.test(focus)?"emotions":
  /режим/i.test(focus)?"routine":
  /уч[её]б|работ/i.test(source)?"study":
  /отношен|общен/i.test(source)?"people":
  /неопределён/i.test(source)?"uncertainty":"general";
 const pool=pools[key];
 const index=(Math.max(1,dayNumber)-1)%pool.length;
 const first=pool[index];
 const second=gentle
  ?"Сегодня можно выбрать только один небольшой шаг или вовсе отдохнуть. Ничего наверстывать не нужно."
  :pool[(index+2)%pool.length];
 const reflection={
  rest:"Что сегодня помогло тебе немного восстановиться — или чего не хватило?",
  emotions:"Какое чувство чаще всего сопровождало тебя сегодня? Можно не отвечать.",
  routine:"Какой момент дня сегодня оказался наиболее удобным или сложным?",
  study:"Что помогло сделать учебную задачу чуть понятнее или посильнее?",
  people:"Какое общение сегодня поддержало тебя, а какое потребовало сил?",
  uncertainty:"Что стало немного яснее, даже если не все вопросы решены?",
  general:"Что сегодня было для тебя самым важным? Можно записать одну мысль."
 };
 const tasks=[
  {id:1,text:first,done:false,kind:"основной"},
  {id:2,text:second,done:false,kind:"по желанию"}
 ];
 if(gentle)tasks[1].optional=true;
 return tasks;
}
function makeProgram(a){
 const d=read(),focus=a.goal||"Понять, что сейчас важно",dayNumber=1;
 return {focus,answers:a,createdAt:dateNow(),dayNumber,history:[],activeDay:{date:dateKey(new Date()),dayNumber,tasks:dailyTasks(a,dayNumber,d),saved:false},paused:false,finished:false};
}
function ensureProgramDay(){
 const d=read(),p=d.program;if(!p||p.paused||p.finished)return p;
 const today=dateKey(new Date());
 if(!p.activeDay){p.dayNumber=p.dayNumber||1;p.history=p.history||[];p.activeDay={date:today,dayNumber:p.dayNumber,tasks:p.tasks||dailyTasks(p.answers||d.longTermAnswers||{},p.dayNumber,d),saved:false};delete p.tasks;write(d);return p}
 if(p.activeDay.date!==today){
  if(!p.activeDay.saved){p.history=p.history||[];p.history.push({date:p.activeDay.date,dayNumber:p.activeDay.dayNumber,status:"Не сохранён",tasks:p.activeDay.tasks})}
  p.dayNumber=(p.dayNumber||p.activeDay.dayNumber||1)+1;
  p.activeDay={date:today,dayNumber:p.dayNumber,tasks:dailyTasks(p.answers||d.longTermAnswers||{},p.dayNumber,d),saved:false};
  write(d);
 }
 return p;
}
function longResultPage(){const d=read(),a=d.longTermAnswers;if(!a)return longPage();const focus=a.goal||"Понять, что сейчас важно";return `<button class="back" data-page="long-edit">← Изменить ответы</button><div class="eyebrow">ТВОЙ ОБЗОР</div><h1 class="h1">Спасибо, что уделил(а) этому время.</h1><p class="sub">Это не оценка и не диагноз — только краткое отражение твоих ответов.</p><div class="card"><div class="eyebrow">ЧТО ТЫ ОТМЕТИЛ(А)</div><div class="profile-line"><b>Длительность</b><span>${esc(a.duration)}</span></div><div class="profile-line"><b>Основной фактор</b><span>${esc(a.source)}</span></div><div class="profile-line"><b>Отдых</b><span>${esc(a.rest)}</span></div><div class="profile-line"><b>Влияние на дела</b><span>${esc(a.impact)}</span></div><div class="profile-line"><b>Твой приоритет</b><span>${esc(a.goal)}</span></div></div><div class="section-head"><h2>Твоя программа поддержки</h2></div><div class="card"><span class="tag">Фокус: ${esc(focus)}</span><p class="sub" style="margin-top:10px">Небольшие идеи, а не обязательства. Можно менять порядок, пропускать пункты или остановиться.</p><button class="button full" data-page="program">Открыть мою программу</button></div><div class="notice">Если напряжение долго мешает повседневной жизни, поговори с доверенным взрослым или квалифицированным специалистом.</div><button class="button secondary full" data-page="practices">Посмотреть практики</button>`}
function programPage(){
 let d=read(),p=d.program;
 if(!p)return `<div class="eyebrow">ПЕРСОНАЛЬНАЯ ПОДДЕРЖКА</div><h1 class="h1">Твоя программа</h1><p class="sub">Сначала пройди короткую анкету, чтобы создать программу.</p><button class="button full" data-page="long">Перейти к анкете</button>`;
 p=ensureProgramDay();d=read();p=d.program;
 const history=p.history||[],saved=history.filter(x=>x.status==="Сохранён").length,day=p.activeDay,done=day.tasks.filter(t=>t.done).length,total=day.tasks.length,nextReviewAt=p.nextReviewAt||(p.lastReviewCount||0)+7,reviewDue=saved>=nextReviewAt;
 return `<button class="back" data-page="progress">← К прогрессу</button><div class="eyebrow">ТВОЯ ПРОГРАММА · БЕЗ ЖЁСТКОГО СРОКА</div><h1 class="h1">Маленькие шаги в своём темпе</h1><p class="sub">Фокус: ${esc(p.focus)}</p>
 <div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>День ${day.dayNumber}</b><span class="tag">${saved} сохранённых дней</span></div><p class="form-hint">Программа не ограничена 7, 14 или 30 днями. Она меняется постепенно и продолжается по твоему желанию.</p></div>
 ${p.finished?`<div class="notice green">Ты завершил(а) программу. История сохранена. Если захочешь, можно вернуться к поддерживающим шагам.</div><button class="button full" data-program-action="continue">Возобновить программу</button>`:p.paused?`<div class="notice">Программа на паузе. Все сохранённые дни остаются в истории.</div><button class="button full" data-program-action="continue">Продолжить программу</button>`:`<div class="card"><div style="display:flex;justify-content:space-between"><b>Задания на сегодня</b><b style="color:var(--blue-dark)">${done} из ${total}</b></div><div style="height:8px;background:#edf2f6;border-radius:99px;margin-top:12px;overflow:hidden"><div style="height:100%;width:${total?done/total*100:0}%;background:var(--green)"></div></div><p class="form-hint">${day.saved?"Сегодняшний результат уже сохранён.":"Отметь выполненное, затем сохрани результат за сегодня."}</p></div>
 <div class="section-head"><h2>Твои шаги</h2></div>${day.tasks.map(t=>`<label class="card" style="display:flex;gap:12px;align-items:flex-start;cursor:pointer"><input type="checkbox" data-program-task="${t.id}" ${t.done?"checked":""} ${day.saved?"disabled":""} style="width:20px;height:20px;flex:none;margin:1px 0;accent-color:var(--green)"><span style="display:block;flex:1;font-size:13px;line-height:1.55;${t.done?"text-decoration:line-through;color:var(--muted)":""}"><span style="display:block;font-size:10px;font-weight:700;color:var(--muted);margin-bottom:4px">${t.optional?"ПО ЖЕЛАНИЮ · МОЖНО ПРОПУСТИТЬ":"ОСНОВНОЙ ШАГ"}</span>${esc(t.text)}</span></label>`).join("")}
 <div class="card"><label class="field-label" for="program-reflection" style="margin-top:0">Короткая заметка о дне (необязательно)</label><textarea id="program-reflection" class="textarea" maxlength="600" rows="3" ${day.saved?"disabled":""} placeholder="Что сегодня было важным? Что помогло или чего хотелось бы больше?">${esc(day.reflection||"")}</textarea><p class="form-hint">Заметка останется только на этом устройстве. Можно оставить поле пустым.</p></div>
 <button class="button full" data-program-action="save" ${day.saved?"disabled":""}>${day.saved?"Прогресс за сегодня сохранён":"Сохранить прогресс за сегодня"}</button>
 <div class="notice green">Пропуск дня — не провал. Можно вернуться тогда, когда будет удобно.</div>
 <div class="inline-actions"><button class="button secondary" data-program-action="pause">Сделать паузу</button><button class="button ghost" data-program-action="finish">Завершить программу</button></div>
 ${reviewDue?`<form id="program-review-form" class="card"><div class="eyebrow">НЕБОЛЬШОЙ ОБЗОР · ${saved} ДНЕЙ</div><h2>Как тебе нынешний формат?</h2><p class="sub">Это не проверка результата. Просто возможность подстроить программу под себя.</p><label class="field-label">Что сейчас ближе?</label><select class="select" name="fit"><option>В целом подходит</option><option>Хочется меньше заданий</option><option>Хочу изменить направление</option><option>Пока не знаю</option></select><label class="field-label">Что было полезно или что хотелось бы изменить? (необязательно)</label><textarea class="textarea" name="note" maxlength="500" rows="3" placeholder="Можно оставить поле пустым..."></textarea><button class="button secondary full" type="submit">Сохранить обзор</button><p class="form-hint">Можно выбрать любой ответ. Здесь нет правильного варианта.</p></form>`:""}`}
 <div class="section-head"><h2>История программы</h2></div>${history.length?history.slice().reverse().slice(0,7).map(x=>`<div class="card record"><div class="record-meta"><b>День ${x.dayNumber}</b><span>${esc(x.date)}</span></div><p>${x.status==="Сохранён"?"Прогресс сохранён":"День не был сохранён"}</p>${x.reflection?`<p class="form-hint">${esc(x.reflection)}</p>`:""}</div>`).join(""):`<div class="empty">Здесь появятся сохранённые дни программы.</div>`}
 <button class="button secondary full" data-page="long">Пересмотреть ответы анкеты</button>`;
}
function assistantPage(){const online=Boolean(AI_PROVIDER.enabled&&AI_PROVIDER.endpoint);return `<div class="eyebrow">${online&&hasAIConsent()?"ИИ-ПОМОЩНИК":"ЛОКАЛЬНЫЙ ПОМОЩНИК"}</div><h1 class="h1">Разговор без спешки</h1><div class="notice">${online&&hasAIConsent()?"Ответы создаёт Gemini. Текст текущего диалога отправляется через Cloudflare в Google Gemini API. Дневник и профиль не передаются.":"Пока доступны локальные ответы. Внешний ИИ подготовлен архитектурно, но пока отключён. Локальные ответы доступны без отправки данных в интернет. Не указывай личные данные."}</div><div class="chat-list">${chat.map(m=>`<div class="bubble ${m.role}">${esc(m.text)}</div>`).join("")||'<div class="bubble">Привет. О чём тебе хотелось бы поговорить?</div>'}</div><form id="chat-form"><textarea class="textarea" name="message" maxlength="1800" required placeholder="Напиши сообщение..." rows="3"></textarea><button class="button full" ${busy?"disabled":""}>${busy?"Подожди…":"Отправить"}</button></form><p class="form-hint">Не отправляй личные данные. История диалога существует только до закрытия приложения.</p>`}
function practicesPage(){return `<div class="eyebrow">БИБЛИОТЕКА</div><h1 class="h1">Практики</h1><p class="sub">Небольшие упражнения. Выбирай только то, что сейчас подходит, и останавливайся, если становится некомфортно.</p>${practices.map(p=>`<div class="card practice-card"><div class="practice-art">◌</div><div style="flex:1"><h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p><span class="tag">${p.time} · ${esc(p.category)}</span><div><button class="button secondary" data-practice="${p.id}" style="margin-top:10px">Начать</button></div></div></div>`).join("")}`}
function runPage(){const p=practices.find(x=>x.id===selectedPractice)||practices[0],i=practiceStep;return `<button class="back" data-page="practices">← К практикам</button><div class="eyebrow">${esc(p.category)} · ${p.time}</div><h1 class="h1">${esc(p.title)}</h1><div class="step"><div class="step-count">ШАГ ${i+1} ИЗ ${p.steps.length}</div><h2>${["Подготовься","Обрати внимание","Продолжай в своём темпе","Завершение"][Math.min(i,3)]}</h2><p>${esc(p.steps[i])}</p></div><div class="notice">${esc(p.caution)}</div><div style="display:flex;gap:10px">${i>0?'<button class="button secondary" data-step="-1">Назад</button>':""}<button class="button" style="flex:1" data-step="1">${i===p.steps.length-1?"Завершить":"Следующий шаг"}</button></div>`}
function calendarHtml(entries){const y=journalMonth.getFullYear(),m=journalMonth.getMonth(),first=new Date(y,m,1),offset=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),marked=new Set(entries.map(e=>{const d=parseDate(e.date);return d&&d.getMonth()===m&&d.getFullYear()===y?d.getDate():null}).filter(Boolean));let cells=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(x=>`<span class="muted" style="text-align:center;font-size:10px">${x}</span>`).join("");for(let i=0;i<offset;i++)cells+='<span></span>';for(let day=1;day<=days;day++){const key=dateKey(new Date(y,m,day));cells+=`<button class="calendar-day ${marked.has(day)?"has-entry":""} ${journalFilter===key?"selected":""}" data-calendar-day="${key}">${day}</button>`}return `<div class="card"><div class="section-head" style="margin:0 0 8px"><button class="button ghost" data-month="-1">‹</button><b style="font-size:13px">${journalMonth.toLocaleDateString("ru-RU",{month:"long",year:"numeric"})}</b><button class="button ghost" data-month="1">›</button></div><div class="calendar-grid">${cells}</div><p class="form-hint">Зелёным отмечены дни, в которые есть записи.</p>${journalFilter?`<button class="button ghost" data-clear-filter>Показать все записи</button>`:""}</div>`}
function journalPage(){const d=read(),entries=d.journal.filter(e=>{if(!journalFilter)return true;const dt=parseDate(e.date);return dt&&dateKey(dt)===journalFilter});const edit=d.journal.find(x=>x.id===editingId);return `<div class="eyebrow">ЛИЧНЫЕ ЗАМЕТКИ</div><h1 class="h1">Дневник</h1><p class="sub">Место, где можно сохранить мысли, события и то, как ты себя чувствовал(а).</p><div class="notice green">Записи хранятся только на этом устройстве и не отправляются в интернет.</div>${calendarHtml(d.journal)}<form id="journal-form" class="card"><div class="section-head" style="margin:0 0 5px"><h2>${edit?"Редактировать запись":"Новая запись"}</h2>${edit?'<button type="button" class="button ghost" data-cancel-edit>Отмена</button>':""}</div><label class="field-label">Как ты себя чувствуешь?</label><select class="select" name="mood"><option ${(edit?.mood||"Спокойно")==="Спокойно"?"selected":""}>Спокойно</option><option ${edit?.mood==="Неплохо"?"selected":""}>Неплохо</option><option ${edit?.mood==="По-разному"?"selected":""}>По-разному</option><option ${edit?.mood==="Напряжённо"?"selected":""}>Напряжённо</option><option ${edit?.mood==="Устал(а)"?"selected":""}>Устал(а)</option><option ${edit?.mood==="Не хочу оценивать"?"selected":""}>Не хочу оценивать</option></select><label class="field-label">Что произошло? (необязательно)</label><input class="input" name="event" maxlength="120" value="${esc(edit?.event||"")}" placeholder="Например, насыщенный день"><label class="field-label">Что могло повлиять?</label><select class="select" name="source"><option value="">Не хочу указывать</option>${["Учёба","Отношения и общение","Дом и семья","Работа или обязанности","Здоровье и самочувствие","Отдых и режим","Другое"].map(x=>`<option ${edit?.source===x?"selected":""}>${x}</option>`).join("")}</select><label class="field-label">Заметка</label><textarea class="textarea" name="note" maxlength="3000" placeholder="Можно записать событие, эмоции или просто мысли...">${esc(edit?.note||"")}</textarea><button class="button full">${edit?"Сохранить изменения":"Сохранить запись"}</button></form><div class="section-head"><h2>${journalFilter?"Записи за выбранный день":"Предыдущие записи"}</h2><span class="muted">${entries.length}</span></div>${entries.length?entries.map(r=>`<div class="card record"><div class="record-meta"><b>${esc(r.mood)}</b><span>${esc(r.date)}</span></div>${r.event?`<p style="font-weight:700;margin:9px 0 0">${esc(r.event)}</p>`:""}${r.source?`<span class="tag">${esc(r.source)}</span>`:""}<p>${esc(r.note||"Без текстовой заметки")}</p><div class="inline-actions"><button class="button ghost" data-edit="${r.id}">Изменить</button><button class="button ghost" data-delete="${r.id}">Удалить</button></div></div>`).join(""):'<div class="empty">Записей пока нет. Ты можешь начать с короткой заметки.</div>'}`}
function chartSvg(checkins){const vals=checkins.slice(0,7).reverse();if(!vals.length)return '<div class="empty">Отметки появятся здесь, когда ты захочешь отметить самочувствие.</div>';const y=[25,70,115];const map={"Неплохо":25,"Спокойно":25,"По-разному":70,"Непросто":115,"Напряжённо":115,"Устал(а)":95};const pts=vals.map((v,i)=>({x:20+i*(260/Math.max(vals.length-1,1)),y:map[v.mood]||70,label:v.mood,date:v.date}));const path=pts.map((p,i)=>(i?"L":"M")+p.x+","+p.y).join(" ");return `<div class="chart-wrap"><svg viewBox="0 0 300 155" role="img" aria-label="История субъективных отметок самочувствия"><path d="M12 25H288 M12 70H288 M12 115H288" stroke="#e8eef4" stroke-dasharray="3 4" fill="none"/><path d="${path}" stroke="#75b9a0" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#5b9ee8" stroke="white" stroke-width="2"><title>${esc(p.date)} — ${esc(p.label)}</title></circle>`).join("")}<text x="12" y="145" font-size="9" fill="#7d8da0">Раньше</text><text x="288" y="145" text-anchor="end" font-size="9" fill="#7d8da0">Позже</text></svg><p class="form-hint">Это твои субъективные отметки, а не медицинская шкала или диагноз.</p></div>`}
function progressPage(){const d=read(),days=new Set(d.journal.map(x=>x.date)).size,program=d.program,history=program?.history||[],saved=history.filter(x=>x.status==="Сохранён").length;return `<div class="eyebrow">ТВОЯ ДИНАМИКА</div><h1 class="h1">Прогресс</h1><p class="sub">Здесь отображаются твои собственные отметки — без оценок, рейтингов и соревнования.</p><div class="stat-grid"><div class="stat"><b>${d.journal.length}</b><small>Записей в дневнике</small></div><div class="stat"><b>${d.completed.length}</b><small>Завершённых практик</small></div><div class="stat"><b>${d.checkins.length}</b><small>Отметок самочувствия</small></div><div class="stat"><b>${days}</b><small>Дней с заметками</small></div></div><div class="section-head"><h2>Персональная программа</h2><button class="button ghost" data-page="program">Открыть</button></div>${program?`<div class="card"><b>${saved} сохранённых дней программы</b><p class="sub" style="margin-top:7px">${esc(program.focus)}</p><p class="form-hint">Программа продолжается в индивидуальном темпе; пропущенные дни не считаются неудачей.</p></div>`:`<div class="empty">Пройди анкету длительного стресса, чтобы создать программу.</div>`}<div class="section-head"><h2>Динамика самочувствия</h2></div>${chartSvg(d.checkins)}<div class="section-head"><h2>История практик</h2></div>${d.completed.length?d.completed.slice(0,8).map(x=>{const p=practices.find(z=>z.id===x.practice);return `<div class="card record"><div class="record-meta"><b>${esc(p?.title||"Практика")}</b><span>${esc(x.date)}</span></div></div>`}).join(""):`<div class="empty">Завершённые практики появятся здесь.</div>`}<div class="notice">Количество записей и практик не показывает, насколько хорошо или плохо ты справляешься. Это просто личная история.</div>`}function profilePage(){const d=read(),name=d.profileName||"";return `<div class="eyebrow">ПЕРСОНАЛЬНЫЕ НАСТРОЙКИ</div><h1 class="h1">Профиль</h1><div class="card"><div class="profile-head"><div class="profile-avatar">${esc((name.trim()[0]||"М").toUpperCase())}</div><div><b>${esc(name||"Твоё пространство")}</b><p class="sub">Личный профиль на устройстве</p></div></div><label class="field-label">Имя или псевдоним</label><input class="input" id="profile-name" maxlength="40" value="${esc(name)}" placeholder="Как к тебе обращаться?"><button class="button secondary" id="save-profile" style="margin-top:12px">Сохранить профиль</button></div><div class="card"><b style="font-size:14px">Режим работы</b><div class="profile-line"><b>AI-помощник</b><span>${AI_PROVIDER.enabled&&AI_PROVIDER.endpoint&&hasAIConsent()?"Gemini онлайн":"Локальный режим"}</span></div><div class="profile-line"><b>Интернет</b><span>${AI_PROVIDER.enabled&&AI_PROVIDER.endpoint&&hasAIConsent()?"Используется для ответов ИИ":"Не используется"}</span></div>${AI_PROVIDER.enabled&&AI_PROVIDER.endpoint?(hasAIConsent()?'<button class="button secondary full" id="ai-revoke">Отключить онлайн-режим</button>':'<button class="button secondary full" id="ai-consent">Разрешить ответы Gemini</button>'):'<p class="form-hint">Онлайн-режим ещё не настроен.</p>'}<p class="form-hint">Подключение внешнего провайдера требует отдельной проверки условий сервиса и защиты данных.</p></div><div class="card"><b style="font-size:14px">Конфиденциальность и данные</b><p class="sub" style="margin:8px 0 12px">Дневник, отметки и настройки хранятся в памяти приложения на этом устройстве. При очистке данных приложения или переустановке они могут исчезнуть.</p><button class="button secondary full" id="export-data">Экспортировать мои данные</button><input id="import-data-file" type="file" accept="application/json,.json" hidden><button class="button secondary full" id="import-data">Восстановить из резервной копии</button><button class="button danger full" id="delete-data">Удалить все локальные данные</button></div><div class="notice">Не записывай пароли, адреса, номера документов и другие сведения, по которым тебя можно определить. Приложение не заменяет помощь доверенного взрослого или специалиста.</div>`}
function render(){nav();const pages={home:homePage,stress:stressPage,long:longPage,"long-edit":longQuestionnairePage,"long-result":longResultPage,program:programPage,assistant:assistantPage,practices:practicesPage,run:runPage,journal:journalPage,progress:progressPage,profile:profilePage};screen.innerHTML=(pages[page]||homePage)();screen.focus({preventScroll:true});}
async function requestAI(){
 const messages=chat.slice(-12).map(m=>({role:m.role==="assistant"?"model":"user",text:m.text}));
 const response=await fetch(AI_PROVIDER.endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages})});
 if(!response.ok)throw new Error("AI request failed");
 const data=await response.json();
 return typeof data.reply==="string"&&data.reply.trim()?data.reply.trim():null;
}
async function send(message){
 if(busy)return;
 chat.push({role:"user",text:message});go("assistant");busy=true;render();
 let reply=null;
 if(AI_PROVIDER.enabled&&AI_PROVIDER.endpoint&&hasAIConsent()){try{reply=await requestAI()}catch(error){console.warn("Gemini unavailable; using local fallback",error)}}
 chat.push({role:"assistant",text:reply||localReply(message)});busy=false;render();
}
function saveCheckin(mood){const d=read();d.checkins.unshift({mood,date:dateNow()});d.checkins=d.checkins.slice(0,100);write(d);toast("Отметка сохранена");render()}
function exportData(){const payload={format:"mindful-space-backup",version:1,exportedAt:new Date().toISOString(),data:read()},json=JSON.stringify(payload,null,2);try{if(window.MindfulStorage&&typeof window.MindfulStorage.exportData==="function"){window.MindfulStorage.exportData(json);return}}catch{}const a=document.createElement("a"),url=URL.createObjectURL(new Blob([json],{type:"application/json"}));a.href=url;a.download="mindful-space-backup.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function importDataFile(file){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result||""));const data=parsed?.format==="mindful-space-backup"?parsed.data:parsed;if(!data||typeof data!=="object"||Array.isArray(data)||!Array.isArray(data.journal)||!Array.isArray(data.completed)||!Array.isArray(data.checkins))throw new Error("invalid");if(!confirm("Заменить текущие данные данными из резервной копии? Текущие записи будут перезаписаны."))return;const restored={...emptyData(),...data,journal:data.journal,completed:data.completed,checkins:data.checkins};write(restored);editingId=null;chat=[];go("profile");toast("Резервная копия восстановлена")}catch{alert("Не удалось прочитать резервную копию. Выбери JSON-файл, созданный Mindful Space.")}};reader.onerror=()=>alert("Не удалось прочитать файл.");reader.readAsText(file)}
document.addEventListener("click",e=>{
 const n=e.target.closest("[data-page]");if(n){go(n.dataset.page);return}
 if(e.target.closest("#profile-shortcut")){go("profile");return}
 const task=e.target.closest("[data-program-task]");if(task){const d=read();if(d.program?.activeDay&&!d.program.activeDay.saved){d.program.activeDay.tasks=d.program.activeDay.tasks.map(t=>t.id===Number(task.dataset.programTask)?{...t,done:task.checked}:t);write(d);render()}return}
 const pa=e.target.closest("[data-program-action]");if(pa){const d=read(),p=d.program;if(!p)return;const action=pa.dataset.programAction;if(action==="save"&&p.activeDay&&!p.activeDay.saved){p.activeDay.reflection=String(document.getElementById("program-reflection")?.value||"").trim().slice(0,600);p.activeDay.saved=true;p.history=p.history||[];p.history.push({date:p.activeDay.date,dayNumber:p.activeDay.dayNumber,status:"Сохранён",tasks:p.activeDay.tasks.map(t=>({...t})),reflection:p.activeDay.reflection});write(d);toast("Прогресс за сегодня сохранён");render();return}if(action==="pause")p.paused=true;if(action==="continue"){p.paused=false;p.finished=false}if(action==="finish"){p.finished=true;p.paused=false}write(d);render();return}
 const mood=e.target.closest("[data-mood]");if(mood){saveCheckin(mood.dataset.mood);return}
 const p=e.target.closest("[data-practice]");if(p){selectedPractice=p.dataset.practice;practiceStep=0;go("run");return}
 const st=e.target.closest("[data-step]");if(st){const item=practices.find(x=>x.id===selectedPractice)||practices[0];practiceStep+=Number(st.dataset.step);if(practiceStep>=item.steps.length){const d=read();d.completed.unshift({practice:item.id,date:dateNow()});write(d);practiceStep=0;go("practices");toast("Практика отмечена");return}practiceStep=Math.max(0,practiceStep);render();return}
 const del=e.target.closest("[data-delete]");if(del){const d=read();d.journal=d.journal.filter(x=>x.id!==Number(del.dataset.delete));write(d);editingId=null;render();toast("Запись удалена");return}
 const edit=e.target.closest("[data-edit]");if(edit){editingId=Number(edit.dataset.edit);go("journal");return}
 if(e.target.closest("[data-cancel-edit]")){editingId=null;render();return}
 const mon=e.target.closest("[data-month]");if(mon){journalMonth.setMonth(journalMonth.getMonth()+Number(mon.dataset.month));render();return}
 const day=e.target.closest("[data-calendar-day]");if(day){journalFilter=journalFilter===day.dataset.calendarDay?"":day.dataset.calendarDay;render();return}
 if(e.target.closest("[data-clear-filter]")){journalFilter="";render();return}
 if(e.target.closest("#save-profile")){const d=read();d.profileName=document.getElementById("profile-name").value.trim().slice(0,40);write(d);render();toast("Профиль сохранён");return}
 if(e.target.closest("#export-data")){exportData();return}
 if(e.target.closest("#ai-consent")){if(!AI_PROVIDER.enabled||!AI_PROVIDER.endpoint){toast("Онлайн-провайдер пока не активирован");return}if(confirm("Разрешить отправку текста текущего диалога внешнему ИИ-провайдеру? Дневник и профиль не отправляются. Не указывай личные данные. Согласие можно отозвать в любой момент.")){try{localStorage.setItem(AI_CONSENT_KEY,"yes")}catch{}toast("Согласие сохранено");render()}return}
 if(e.target.closest("#ai-revoke")){try{localStorage.removeItem(AI_CONSENT_KEY)}catch{}toast("Онлайн-режим отключён");render();return}
 if(e.target.closest("#import-data")){document.getElementById("import-data-file").click();return}
 if(e.target.closest("#delete-data")){if(confirm("Удалить дневник, отметки, профиль и историю практик с этого устройства?")){localStorage.removeItem(STORE);try{window.MindfulStorage?.clear()}catch{}chat=[];editingId=null;go("profile");toast("Локальные данные удалены")}return}
});
document.addEventListener("submit",e=>{e.preventDefault();const form=e.target,fd=new FormData(form);
 if(form.id==="stress-form"){const m=String(fd.get("message")||"").trim();if(m)send(m)}
 if(form.id==="long-form"){const d=read();d.longTermAnswers=Object.fromEntries(fd);d.program=makeProgram(d.longTermAnswers);write(d);go("long-result")}
 if(form.id==="chat-form"){const m=String(fd.get("message")||"").trim();if(m){form.reset();send(m)}}
 if(form.id==="program-review-form"){const d=read(),p=d.program;if(!p)return;const saved=(p.history||[]).filter(x=>x.status==="Сохранён").length;p.reviews=p.reviews||[];p.reviews.unshift({date:dateNow(),savedDays:saved,fit:String(fd.get("fit")||"Пока не знаю"),note:String(fd.get("note")||"").trim().slice(0,500)});p.reviews=p.reviews.slice(0,30);p.nextReviewAt=saved+7;write(d);go("program");toast("Обзор сохранён");return}
 if(form.id==="journal-form"){const d=read(),record={id:editingId||Date.now(),mood:String(fd.get("mood")),event:String(fd.get("event")||"").trim(),source:String(fd.get("source")||""),note:String(fd.get("note")||"").trim(),date:editingId?(d.journal.find(x=>x.id===editingId)?.date||dateNow()):dateNow()};if(editingId){d.journal=d.journal.map(x=>x.id===editingId?record:x);editingId=null}else d.journal.unshift(record);d.journal=d.journal.slice(0,500);write(d);journalFilter="";go("journal");toast("Запись сохранена")}
});
document.getElementById("profile-shortcut").addEventListener("click",()=>go("profile"));
document.addEventListener("change",e=>{if(e.target?.id==="import-data-file"){importDataFile(e.target.files?.[0]);e.target.value=""}});
render();
})();