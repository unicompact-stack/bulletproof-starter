const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./logic');

test('неделя начинается с понедельника и пересекает границу года', () => {
  assert.equal(L.monday('2027-01-01'), '2026-12-28');
  assert.equal(L.addDays('2026-12-28', 6), '2027-01-03');
});
test('задача требует название и корректную дату', () => {
  assert.throws(() => L.task({ title:'  ' }));
  assert.throws(() => L.task({ title:'Задача', date:'2026-02-31' }));
  assert.throws(() => L.task({ title:'Задача', time:'99:00' }));
  assert.equal(L.task({title:'  Тест  ', date:''}).title, 'Тест');
});
test('отмена требует причину и сохраняет задачу и историю', () => {
  const s=L.empty(); const t=L.task({title:'План', date:'2026-11-20'}); s.tasks.push(t);
  assert.throws(() => L.changeStatus(s,t.id,'cancelled',''));
  L.changeStatus(s,t.id,'cancelled','Не актуально');
  assert.equal(s.tasks.length,1); assert.equal(t.status,'cancelled');
  assert.match(s.history[0].text,/Не актуально/);
  L.changeStatus(s,t.id,'open'); assert.equal(t.status,'open');
});
test('просрочка только для невыполненных задач с датой раньше сегодня', () => {
  const today='2026-11-20';
  assert.equal(L.overdue({status:'open',date:'2026-11-19'},today),true);
  assert.equal(L.overdue({status:'done',date:'2026-11-19'},today),false);
  assert.equal(L.overdue({status:'open',date:''},today),false);
  assert.equal(L.overdue({status:'open',date:today},today),false);
});
test('резервная копия проверяется и не подменяет статус ошибочными данными', () => {
  assert.throws(() => L.validateBackup({tasks:'no', history:[]}));
  assert.throws(() => L.validateBackup({version:1, tasks:[{id:'a',title:'X',status:'wat'}], history:[],notes:''}));
  const data=L.empty(); data.tasks.push(L.task({title:'Сделать'}));
  assert.deepEqual(L.validateBackup(JSON.parse(JSON.stringify(data))),data);
});
test('отчёт содержит контекст, задачи и историю без скрытых данных', () => {
  const s=L.empty(); s.notes='Моя цель'; s.tasks.push(L.task({title:'Первый шаг'}));
  L.changeStatus(s,s.tasks[0].id,'done');
  const report=L.report(s); assert.match(report,/Моя цель/); assert.match(report,/Первый шаг/); assert.match(report,/История/);
});

test('календарные месяцы корректно переходят через год', () => {
  assert.equal(L.addMonths('2026-12-01', 1), '2027-01-01');
  assert.equal(L.addMonths('2026-01-01', -1), '2025-12-01');
  assert.equal(L.addMonths('2026-01-31', 1), '2026-02-28');
});
test('пакет задач валидируется и добавляется без повторов и удаления существующих дел', () => {
  const s=L.empty(); s.tasks.push(L.task({id:'existing',title:'Уже было'}));
  const batch={format:'personal-planner-tasks-v1',tasks:[{id:'batch-1',title:'Новая',date:'2026-11-20',time:''},{id:'batch-2',title:'Ещё',date:'',time:''}]};
  assert.equal(L.mergeBatch(s,batch),2); assert.equal(L.mergeBatch(s,batch),0); assert.equal(s.tasks.length,3);
  assert.throws(()=>L.mergeBatch(s,{format:batch.format,tasks:[{id:'a',title:'Сломано',date:'2026-02-31',time:''}]}));
  assert.equal(s.tasks.length,3);
});
test('пакет нельзя использовать для смены статусов существующих задач', () => {
  const s=L.empty();s.tasks.push(L.task({id:'x',title:'Старая'}));
  assert.throws(()=>L.mergeBatch(s,{format:'personal-planner-tasks-v1',tasks:[{id:'new',title:'Новая',date:'',time:'',status:'done'}]}));
  assert.equal(s.tasks.length,1);assert.equal(s.tasks[0].status,'open');
});

test('голосовая сводка различает задачи на сегодня и просроченные', () => {
  const s=L.empty();
  assert.match(L.briefing(s,'2026-11-20'),/на сегодня запланированных задач нет/i);
  s.tasks.push(L.task({title:'Отложенная',date:'2026-11-19'}));
  assert.match(L.briefing(s,'2026-11-20'),/просрочен/i);
  s.tasks.push(L.task({title:'Сегодня',date:'2026-11-20'}));
  s.tasks.push(L.task({title:'Выполненная',date:'2026-11-20',status:'done'}));
  const b=L.briefing(s,'2026-11-20');assert.match(b,/Сегодня/);assert.match(b,/просрочен/i);assert.doesNotMatch(b,/Выполненная/);
});

test('старая копия сохраняет задачи и заметки при миграции',()=>{
 const old={version:1,tasks:[{id:'old',title:'Старое',date:'',time:'',status:'open'}],notes:'Заметка',history:[]};
 const s=L.validateBackup(old);assert.equal(s.notes,'Заметка');assert.equal(s.tasks[0].title,'Старое');assert.equal(s.draft,'');assert.deepEqual(s.suggestions,[]);
});
test('предложения добавляются без повторов; действия атомарны',()=>{
 const s=L.empty(),batch={format:'personal-planner-suggestions-v1',suggestions:[{id:'one',title:'Забор',date:'2026-11-23',time:'',reason:'Вторая часть'},{id:'two',title:'Разобрать дела',date:'',time:'',reason:''}]};
 assert.equal(L.mergeSuggestions(s,batch),2);assert.equal(L.mergeSuggestions(s,batch),0);
 L.decideSuggestion(s,'one','accept');assert.equal(s.tasks.length,1);assert.equal(s.tasks[0].date,'2026-11-23');
 assert.throws(()=>L.decideSuggestion(s,'one','accept'));assert.equal(s.tasks.length,1);
 L.decideSuggestion(s,'two','later');assert.equal(s.suggestions[1].status,'later');
 L.decideSuggestion(s,'two','reject');assert.equal(L.mergeSuggestions(s,batch),0);assert.equal(s.tasks.length,1);
 assert.deepEqual(L.validateBackup(JSON.parse(JSON.stringify(s))),s);
});
test('импорт ошибок не меняет состояние; старый пакет становится предложениями',()=>{
 const s=L.empty();const before=JSON.stringify(s);
 assert.throws(()=>L.mergeSuggestions(s,{format:'personal-planner-suggestions-v1',suggestions:[{id:'a',title:'Хорошо',date:'',time:'',reason:''},{id:'b',title:'Плохо',date:'2026-02-31',time:'',reason:''}]}));
 assert.equal(JSON.stringify(s),before);
 assert.equal(L.mergeSuggestions(s,{format:'personal-planner-tasks-v1',tasks:[{id:'old-packet',title:'Старый пакет',date:'',time:''}]}),1);
 assert.equal(s.tasks.length,0);assert.equal(s.suggestions[0].status,'pending');
});
test('отчёт для чата содержит черновик, предложения и идентификаторы задач',()=>{
 const s=L.empty();s.draft='Неструктурированный текст';s.tasks.push(L.task({id:'task-x',title:'Существующая'}));
 L.mergeSuggestions(s,{format:'personal-planner-suggestions-v1',suggestions:[{id:'q',title:'Новая',date:'',time:'',reason:'Проверить'}]});
 const r=L.report(s);assert.match(r,/Неструктурированный текст/);assert.match(r,/task-x/);assert.match(r,/Новая/);
});

test('повторный импорт старого пакета не предлагает уже добавленную задачу',()=>{
 const s=L.empty();s.tasks.push(L.task({id:'legacy-task',title:'Сохранённая'}));
 const old={format:'personal-planner-tasks-v1',tasks:[{id:'legacy-task',title:'Сохранённая',date:'',time:''}]};
 assert.equal(L.mergeSuggestions(s,old),0);assert.equal(s.suggestions.length,0);assert.equal(s.tasks.length,1);
});

test('заметка к предложению сохраняется и переходит в задачу только после согласия',()=>{
 const s=L.empty(),p={format:'personal-planner-suggestions-v1',suggestions:[{id:'idea',title:'Идея',date:'2026-11-25',time:'',reason:'Причина'}]};
 L.mergeSuggestions(s,p);s.suggestions[0].note='Проверить детали';L.decideSuggestion(s,'idea','note');assert.equal(s.tasks.length,0);assert.equal(s.suggestions[0].status,'noted');assert.equal(L.mergeSuggestions(s,p),0);
 const restored=L.validateBackup(JSON.parse(JSON.stringify(s)));assert.equal(restored.suggestions[0].note,'Проверить детали');L.decideSuggestion(restored,'idea','accept');assert.equal(restored.tasks[0].note,'Проверить детали');assert.equal(restored.tasks[0].date,'2026-11-25');assert.deepEqual(L.validateBackup(JSON.parse(JSON.stringify(restored))),restored);
});
test('сохранённую заметку можно вернуть и убрать, не создавая задачу',()=>{
 const s=L.empty();L.mergeSuggestions(s,{format:'personal-planner-suggestions-v1',suggestions:[{id:'i',title:'Идея',date:'',time:'',reason:''}]});s.suggestions[0].note='Личный текст';L.decideSuggestion(s,'i','note');L.decideSuggestion(s,'i','restore');assert.equal(s.suggestions[0].note,'Личный текст');L.decideSuggestion(s,'i','later');L.decideSuggestion(s,'i','note');L.decideSuggestion(s,'i','reject');assert.equal(s.tasks.length,0);assert.equal(s.suggestions[0].note,'Личный текст');
});
test('разбор просрочки и заметки сохраняются, проверяются и входят в отчёт',()=>{
 const s=L.empty();s.tasks.push(L.task({id:'review',title:'Отложенное',date:'2026-11-19',note:'Уточнение',obstacle:'Не хватило времени',nextStep:'Позвонить'}));assert.equal(L.overdue(s.tasks[0],'2026-11-20'),true);const round=L.validateBackup(JSON.parse(JSON.stringify(s)));assert.deepEqual(round,s);const report=L.report(round);assert.match(report,/Не хватило времени/);assert.match(report,/Позвонить/);assert.match(report,/Уточнение/);
 const broken=JSON.parse(JSON.stringify(s));broken.tasks[0].obstacle='x'.repeat(2001);assert.throws(()=>L.validateBackup(broken));broken.tasks[0].obstacle=42;assert.throws(()=>L.validateBackup(broken));
 const old=L.validateBackup({version:1,tasks:[{id:'old',title:'Старое',date:'',time:'',status:'open'}],notes:'',history:[]});assert.equal(old.tasks[0].title,'Старое');assert.equal(old.tasks[0].note,undefined);
});

test('недельная сводка считает только отмеченные задачи в календарной неделе',()=>{
 const s=L.empty();for(const t of [
 {id:'start',title:'Понедельник',date:'2026-12-28',income:true},
 {id:'end',title:'Воскресенье',date:'2027-01-03',income:true,status:'done'},
 {id:'before',title:'До недели',date:'2026-12-27',income:true},
 {id:'after',title:'После недели',date:'2027-01-04',income:true},
 {id:'undated',title:'Без даты',date:'',income:true},
 {id:'cancelled',title:'Отменено',date:'2027-01-01',income:true,status:'cancelled'},
 {id:'unknown',title:'Связь неизвестна',date:'2027-01-01'},
 ])s.tasks.push(L.task(t));
 assert.deepEqual(L.incomeWeek(s,'2027-01-01'),{start:'2026-12-28',end:'2027-01-03',open:1,done:1});assert.throws(()=>L.incomeWeek(s,'not-a-date'));
});
test('отметки дохода сохраняются в копии и отчёте, старые задачи не классифицируются',()=>{
 const s=L.empty();s.tasks.push(L.task({id:'income',title:'Найти клиента',date:'2026-11-20',income:true,note:'Мой контекст'}));s.tasks.push(L.task({id:'unknown',title:'Старое дело',date:'2026-11-20'}));const round=L.validateBackup(JSON.parse(JSON.stringify(s)));assert.deepEqual(round,s);assert.equal(round.tasks[1].income,undefined);assert.match(L.report(round),/Задача о заработке/);round.tasks[0].income='yes';assert.throws(()=>L.validateBackup(round));
});

test('частичное выполнение сохраняется, попадает в отчёт и остаётся открытым',()=>{
 const s=L.empty();const t=L.task({id:'partial',title:'Условная задача',date:'2026-11-19',income:true,progressText:'Часть сделана',progress:{done:10,total:40,unit:'м²'}});s.tasks.push(t);
 L.changeStatus(s,t.id,'progress');assert.equal(L.overdue(t,'2026-11-20'),true);assert.equal(L.incomeWeek(s,'2026-11-20').open,1);assert.match(L.briefing(s,'2026-11-19'),/Условная задача/);assert.equal(L.progressLabel(t.progress),'10 / 40 м² (25%; осталось 30 м²)');
 const restored=L.validateBackup(JSON.parse(JSON.stringify(s)));assert.deepEqual(restored,s);assert.match(L.report(restored),/Часть сделана/);assert.match(L.report(restored),/осталось 30/);assert.equal(restored.tasks[0].date,'2026-11-19');
 L.changeStatus(restored,'partial','done');assert.equal(L.overdue(restored.tasks[0],'2026-11-20'),false);assert.equal(restored.tasks[0].progress.done,10);
});
test('числовой прогресс валидируется, в том числе в резервных копиях',()=>{
 for(const p of [{done:-1,total:40,unit:''},{done:41,total:40,unit:''},{done:0,total:0,unit:''},{done:'10',total:40,unit:''},{done:Infinity,total:40,unit:''},{done:1,total:2,unit:'x'.repeat(31)}])assert.throws(()=>L.task({title:'Тест',progress:p}));
 const s=L.empty();s.tasks.push(L.task({title:'Тест',progress:{done:40,total:40,unit:'м²'}}));assert.equal(s.tasks[0].status,'open');s.tasks[0].progress.total=0;assert.throws(()=>L.validateBackup(s));
});

test('единая сессия содержит все данные календаря и отчёт; восстанавливается как обычная копия',()=>{
 const s=L.empty();s.notes='Личная заметка';s.draft='Черновик';s.tasks.push(L.task({id:'x',title:'Задача',status:'progress',progressText:'Часть',progress:{done:1,total:3,unit:'шт'}}));L.record(s,'История');L.mergeSuggestions(s,{format:'personal-planner-suggestions-v1',suggestions:[{id:'y',title:'Идея',date:'',time:'',reason:'Причина'}]});
 const file=L.session(s);assert.equal(file.format,'personal-planner-session-v1');assert.match(file.reportForChat,/Личная заметка/);assert.match(file.reportForChat,/Часть/);assert.deepEqual(L.validateBackup(JSON.parse(JSON.stringify(file))),s);
});

test('строгое чтение сессии не повреждает русский текст в UTF-8, UTF-16 и Windows-1251',()=>{
 const text='{"title":"Привет"}';
 const utf8=new TextEncoder().encode(text);assert.deepEqual(L.decodeSession(utf8),{text,encoding:'UTF-8'});
 const cp=Uint8Array.from(Buffer.from([123,34,116,105,116,108,101,34,58,34,207,240,232,226,229,242,34,125]));assert.deepEqual(L.decodeSession(cp),{text,encoding:'Windows-1251'});
 const le=Uint8Array.from(Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,'utf16le')]));assert.deepEqual(L.decodeSession(le),{text,encoding:'UTF-16'});
 assert.throws(()=>L.decodeSession(Uint8Array.from([0xff,0xfe,0xff])));assert.throws(()=>JSON.parse(L.decodeSession(Uint8Array.from([0x98])).text));assert.throws(()=>L.decodeSession('не байты'));
});

test('шаги сохраняются в задаче, копии и отчёте независимо от её статуса',()=>{
 const s=L.empty();s.tasks.push(L.task({id:'parent',title:'Задача',date:'2026-11-20',steps:[{id:'a',title:'Проверить',done:true},{id:'b',title:'Подготовить',done:false}]}));
 assert.equal(s.tasks.length,1);assert.equal(s.tasks[0].status,'open');const copy=L.validateBackup(JSON.parse(JSON.stringify(L.session(s))));assert.deepEqual(copy,s);assert.match(L.report(copy),/\[x\] Проверить/);assert.match(L.report(copy),/\[ \] Подготовить/);
 L.changeStatus(copy,'parent','done');assert.equal(copy.tasks[0].steps[1].done,false);assert.equal(copy.tasks.length,1);
});
test('валидируются шаги и поддерживаются старые копии без шагов',()=>{
 const make=steps=>L.task({title:'Задача',steps});const good={id:'one',title:'Шаг',done:false};
 assert.throws(()=>make('ошибка'));assert.throws(()=>make([{...good}, {...good}]));assert.throws(()=>make([{...good,done:'yes'}]));assert.throws(()=>make([{...good,title:' '} ]));assert.throws(()=>make([{title:'Шаг',done:false}]));assert.throws(()=>make(Array.from({length:51},(_,i)=>({...good,id:String(i)}))));
 const s=L.empty();s.tasks.push(L.task({title:'Старая'}));assert.equal(L.validateBackup(s).tasks[0].steps,undefined);
});
