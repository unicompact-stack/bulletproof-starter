(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const validDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T12:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === value;
  };
  const addDays = (value, n) => { if (!validDate(value)) throw Error('Некорректная дата'); const d = new Date(value+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
  const monday = value => { const d = new Date(value+'T12:00:00Z'); if(!validDate(value)) throw Error('Некорректная дата'); return addDays(value,-((d.getUTCDay()+6)%7)); };
  const addMonths = (value,n) => { if(!validDate(value)) throw Error('Некорректная дата'); const [y,m,day]=value.split('-').map(Number); const d=new Date(Date.UTC(y,m-1+n,1,12)); const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); d.setUTCDate(Math.min(day,end)); return d.toISOString().slice(0,10); };
  const id = () => (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  const empty = () => ({version:1, tasks:[], notes:'', history:[], draft:'', suggestions:[]});
  function task(input) {
    const title=String(input.title||'').trim(), date=String(input.date||''), time=String(input.time||'');
    if(!title || title.length>300) throw Error('Введите название задачи (до 300 символов).');
    if(date && !validDate(date)) throw Error('Укажите корректную дату.');
    if(time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('Укажите корректное время.');
    const result={id:input.id||id(),title,date,time,status:input.status||'open'};
    for(const field of ['note','obstacle','nextStep']) {
      if(input[field]!==undefined){if(typeof input[field]!=='string' || input[field].length>2000)throw Error('Текст заметки или разбора должен быть не длиннее 2000 символов.');result[field]=input[field];}
    }
    return result;
  }
  const record = (state,text) => state.history.unshift({at:new Date().toISOString(),text});
  function changeStatus(state, taskId, status, reason='') {
    const item=state.tasks.find(t=>t.id===taskId);
    if(!item || !['open','done','cancelled'].includes(status)) throw Error('Задача или статус не найдены.');
    if(status==='cancelled' && !reason.trim()) throw Error('Укажите причину отмены.');
    item.status=status;
    const labels={open:'Возвращено в работу',done:'Выполнено',cancelled:'Отменено'};
    record(state,`${labels[status]}: ${item.title}${status==='cancelled' ? ' — '+reason.trim() : ''}`);
  }
  const overdue=(item,today)=>item.status==='open' && Boolean(item.date) && item.date<today;
  function validateBackup(raw) {
    if(!raw || raw.version!==1 || !Array.isArray(raw.tasks) || !Array.isArray(raw.history) || typeof raw.notes!=='string') throw Error('Неверный формат резервной копии.');
    if(raw.tasks.length>10000 || raw.history.length>100000 || raw.notes.length>1000000) throw Error('Резервная копия слишком большая.');
    const seen=new Set();
    const tasks=raw.tasks.map(t=>{
      if(!t || typeof t.id!=='string' || !t.id || seen.has(t.id) || typeof t.title!=='string' || typeof t.date!=='string' || typeof t.time!=='string' || !['open','done','cancelled'].includes(t.status)) throw Error('Ошибка в задаче резервной копии.');
      seen.add(t.id); return task(t);
    });
    const history=raw.history.map(h=>{if(!h || typeof h.at!=='string' || Number.isNaN(Date.parse(h.at)) || typeof h.text!=='string' || h.text.length>10000) throw Error('Ошибка в истории резервной копии.'); return {at:h.at,text:h.text};});
    const draft=raw.draft===undefined?'':raw.draft;
    const rawSuggestions=raw.suggestions===undefined?[]:raw.suggestions;
    if(typeof draft!=='string' || draft.length>100000 || !Array.isArray(rawSuggestions) || rawSuggestions.length>10000) throw Error('Ошибка в тексте или предложениях.');
    const proposalIds=new Set();
    const suggestions=rawSuggestions.map(p=>{
      if(!p || typeof p.id!=='string' || !p.id || p.id.length>150 || proposalIds.has(p.id) || typeof p.title!=='string' || typeof p.date!=='string' || typeof p.time!=='string' || typeof p.reason!=='string' || p.reason.length>1000 || (p.note!==undefined && (typeof p.note!=='string' || p.note.length>2000)) || !['pending','later','noted','accepted','rejected'].includes(p.status)) throw Error('Ошибка в предложении.');
      proposalIds.add(p.id);const checked=task({id:p.id,title:p.title,date:p.date,time:p.time});
      const result={id:checked.id,title:checked.title,date:checked.date,time:checked.time,reason:p.reason,status:p.status};if(p.note!==undefined)result.note=p.note;return result;
    });
    return {version:1,tasks,notes:raw.notes,history,draft,suggestions};
  }
  function mergeBatch(state,raw) {
    if(!raw || raw.format!=='personal-planner-tasks-v1' || !Array.isArray(raw.tasks) || raw.tasks.length>200) throw Error('Неверный формат пакета задач.');
    const seen=new Set();
    const incoming=raw.tasks.map(t=>{
      if(!t || typeof t.id!=='string' || !t.id || t.id.length>150 || seen.has(t.id) || typeof t.title!=='string' || typeof t.date!=='string' || typeof t.time!=='string' || (t.status!==undefined && t.status!=='open')) throw Error('Ошибка в пакете задач.');
      seen.add(t.id); return task({id:t.id,title:t.title,date:t.date,time:t.time,status:'open'});
    });
    const existing=new Set(state.tasks.map(t=>t.id));
    const added=incoming.filter(t=>!existing.has(t.id));
    if(state.tasks.length+added.length>10000) throw Error('Слишком много задач.');
    state.tasks.push(...added);
    if(added.length) record(state,`Добавлен пакет задач: ${added.length}`);
    return added.length;
  }
  function mergeSuggestions(state,raw) {
    const source=raw && raw.format==='personal-planner-suggestions-v1' ? raw.suggestions : raw && raw.format==='personal-planner-tasks-v1' ? raw.tasks : null;
    if(!Array.isArray(source) || source.length>200) throw Error('Неверный формат предложений.');
    const seen=new Set();
    const incoming=source.map(p=>{
      if(!p || typeof p.id!=='string' || !p.id || p.id.length>150 || seen.has(p.id) || typeof p.title!=='string' || typeof p.date!=='string' || typeof p.time!=='string' || (p.reason!==undefined && (typeof p.reason!=='string' || p.reason.length>1000)) || (p.status!==undefined && p.status!=='open' && p.status!=='pending')) throw Error('Ошибка в предложении.');
      seen.add(p.id);const checked=task({id:p.id,title:p.title,date:p.date,time:p.time});
      return {id:checked.id,title:checked.title,date:checked.date,time:checked.time,reason:p.reason||'',status:'pending'};
    });
    const existing=new Set(state.suggestions.map(p=>p.id)),taskIds=new Set(state.tasks.map(t=>t.id));
    const added=incoming.filter(p=>!existing.has(p.id) && !taskIds.has(p.id) && !taskIds.has('suggestion:'+p.id));
    if(state.suggestions.length+added.length>10000)throw Error('Слишком много предложений.');
    state.suggestions.push(...added);if(added.length)record(state,`Получено предложений: ${added.length}`);return added.length;
  }
  function decideSuggestion(state,proposalId,action) {
    const item=state.suggestions.find(p=>p.id===proposalId);
    if(!item || !['accept','later','note','reject','restore'].includes(action) || item.status==='accepted' || (item.status==='rejected' && action!=='restore') || (action==='restore' && !['rejected','later','noted'].includes(item.status))) throw Error('Это действие недоступно.');
    if(action==='accept'){
      const taskId='suggestion:'+item.id;
      if(state.tasks.some(t=>t.id===taskId))throw Error('Задача с таким ID уже существует.');
      if(state.tasks.length>=10000)throw Error('Слишком много задач.');
      state.tasks.push(task({id:taskId,title:item.title,date:item.date,time:item.time,note:item.note}));item.status='accepted';
      record(state,`Принято предложение: ${item.title}${item.date?' — '+item.date:' — без даты'}`);
    }else{
      item.status=action==='later'?'later':action==='note'?'noted':action==='reject'?'rejected':'pending';
      record(state,`${action==='later'?'Отложено':action==='note'?'Сохранено в заметки':action==='reject'?'Убрано':'Возвращено'} предложение: ${item.title}`);
    }
  }
  function briefing(s, day) {
    if(!validDate(day)) throw Error('Некорректная дата');
    const active=s.tasks.filter(t=>t.status==='open');
    const todays=active.filter(t=>t.date===day).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
    const late=active.filter(t=>overdue(t,day)).length;
    let text=todays.length ? `На сегодня запланировано задач: ${todays.length}. ${todays.slice(0,3).map(t=>t.title).join('. ')}${todays.length>3?'. И другие задачи':''}.` : 'На сегодня запланированных задач нет.';
    if(late) text+=` Также есть просроченные задачи: ${late}.`;
    return text;
  }
  function report(s) {
    const labels={open:'в работе',done:'выполнено',cancelled:'отменено'};
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone || 'неизвестен';
    return '# Отчёт календаря\n\nСформирован: '+new Date().toISOString()+'; часовой пояс устройства: '+zone+'.\n\n# Контекст и цели\n\n'+(s.notes||'Не заполнено')+'\n\n# Текст для разбора\n\n'+(s.draft||'Не заполнено')+'\n\n# Задачи\n\n'+(s.tasks.map(t=>`- [${t.status==='done'?'x':' '}] ${t.title} — ${labels[t.status]}${t.date?' · '+t.date:''}${t.time?' '+t.time:''}${t.note?' · Заметка: '+t.note:''}${t.obstacle?' · Что помешало: '+t.obstacle:''}${t.nextStep?' · Следующий шаг: '+t.nextStep:''} · ID: ${t.id}`).join('\n')||'Пока нет задач')+'\n\n# Предложения\n\n'+(s.suggestions.filter(p=>p.status!=='accepted').map(p=>`- ${p.title} — ${p.status}${p.date?' · '+p.date:''}${p.time?' '+p.time:''}${p.reason?' · '+p.reason:''}${p.note?' · Заметка: '+p.note:''} · ID: ${p.id}`).join('\n')||'Нет предложений')+'\n\n# История\n\n'+(s.history.map(h=>'- '+h.at+' — '+h.text).join('\n')||'Пока нет записей')+'\n';
  }
  return {validDate,addDays,addMonths,monday,empty,task,record,changeStatus,overdue,validateBackup,mergeBatch,mergeSuggestions,decideSuggestion,briefing,report};
});
