(() => {
  'use strict';
  const L=window.Planner, key='personal-planner-v1';
  const $=id=>document.getElementById(id);
  const today=()=>{const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const dateObj=value=>new Date(value+'T12:00:00');
  const fmt=(value,options)=>new Intl.DateTimeFormat('ru-RU',options).format(dateObj(value));
  const taskCount=n=>`${n} ${n%10===1 && n%100!==11 ? 'задача' : n%10>=2 && n%10<=4 && (n%100<12 || n%100>14) ? 'задачи' : 'задач'}`;
  let state=L.empty(), focus=today(), view='week', editing=null, editingIdea=null, canWrite=true, notesDirty=false, draftDirty=false, draftTimer=null;
  $('notes').addEventListener('input',()=>{notesDirty=true;$('note-status').textContent='Изменения ещё не сохранены.';});
  $('source-text').addEventListener('input',()=>{draftDirty=true;$('draft-status').textContent='Сохраняем…';clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,600);});
  window.addEventListener('beforeunload',event=>{if(notesDirty||draftDirty){event.preventDefault();event.returnValue='';}});
  const warning=$('storage-error');
  function error(message) {warning.textContent=message; warning.hidden=false;}
  try { const saved=localStorage.getItem(key); if(saved) state=L.validateBackup(JSON.parse(saved)); }
  catch(e) { canWrite=false; error('Не удалось прочитать сохранённые данные. Они не перезаписаны. Попробуйте загрузить резервную копию или сохранить старые данные через инструменты браузера.'); }
  function improveKnownReasons(next) {
    let changed=0;
    for(const item of next.suggestions || []) {
      const update=window.PLANNER_REASON_UPDATES.find(u=>u.id===item.id);
      if(!update)continue;
      for(const prefix of ['', 'Демонстрационный пример. ']) {
        if(item.reason===prefix+update.before){item.reason=prefix+update.after;changed++;break;}
      }
    }
    return changed;
  }
  function commit(next, allowRecovery=false, renderNow=true) {
    if(!canWrite && !allowRecovery) {error('Сохранение заблокировано, чтобы не перезаписать данные. Загрузите проверенную резервную копию.');return false;}
    try {const checked=L.validateBackup(next); improveKnownReasons(checked); localStorage.setItem(key,JSON.stringify(checked)); state=checked;canWrite=true;warning.hidden=true;if(renderNow)render();return true;}
    catch(e) {error('Не удалось сохранить изменения в браузере. Проверьте доступность хранилища и свободное место. '+e.message);return false;}
  }
  const copy=()=>JSON.parse(JSON.stringify(state));
  function saveDraft(){
    clearTimeout(draftTimer);if(!draftDirty)return true;
    const next=copy();next.draft=$('source-text').value;draftDirty=false;
    if(!commit(next,false,false)){draftDirty=true;$('draft-status').textContent='Текст не сохранён. Проверь предупреждение выше.';return false;}
    $('draft-status').textContent='Сохранено в этом браузере ✓';return true;
  }
  function element(tag,className,text){const node=document.createElement(tag);if(className) node.className=className;if(text!==undefined) node.textContent=text;return node;}
  function openTask(item, date='', incomeDefault=false) {
    editing=item ? item.id : null;
    $('task-form').reset(); $('form-error').hidden=true;
    $('dialog-title').textContent=item?'Задача':'Новая задача';
    $('task-title').value=item?.title || ''; $('task-date').value=item?.date || date; $('task-time').value=item?.time || '';
    $('task-note').value=item?.note || '';$('task-obstacle').value=item?.obstacle || '';$('task-next-step').value=item?.nextStep || '';$('task-income').checked=item ? item.income===true : incomeDefault;
    $('task-review').open=Boolean(item && L.overdue(item,today()));
    $('dialog-status').textContent=item ? ({open:'В работе',done:'Выполнено',cancelled:'Отменено'})[item.status] : '';
    $('mark-done').hidden=!item || item.status!=='open'; $('reopen').hidden=!item || item.status==='open'; $('cancel-task').hidden=!item || item.status==='cancelled';
    $('task-dialog').showModal(); $('task-title').focus();
  }
  function taskButton(item,mini=false){
    const button=element('button',mini?'mini-task'+(L.overdue(item,today())?' overdue':''):'task-card'+(item.status==='done'?' done':''));
    button.type='button';
    if(!mini && item.time) button.append(element('small','',item.time));
    button.append(element(mini?'span':'strong','',item.title));
    const status=item.status==='done'?'✓ Выполнено':item.status==='cancelled'?'Отменено':L.overdue(item,today())?'Просрочено':'Запланировано';
    if(mini){if(item.date || item.status!=='open')button.append(element('small','',`${item.date?fmt(item.date,{day:'numeric',month:'short'}):'Без даты'} · ${status}`));}
    else button.append(element('span','task-status',status));
    button.addEventListener('click',()=>openTask(item));return button;
  }
  function renderList(target,items,emptyText){target.replaceChildren(); if(!items.length)target.append(element('p','empty-small',emptyText));else items.forEach(t=>target.append(taskButton(t,true)));}
  function renderProposals(){
    const allPending=state.suggestions.filter(p=>p.status==='pending'),samples=allPending.filter(p=>p.id.startsWith('sample-proposal-')),real=allPending.filter(p=>!p.id.startsWith('sample-proposal-'));
    const showSamplesSeparately=real.length>0 && samples.length>0,pending=showSamplesSeparately?real:allPending,later=state.suggestions.filter(p=>p.status==='later'),ideas=state.suggestions.filter(p=>p.status==='noted'),rejected=state.suggestions.filter(p=>p.status==='rejected');
    $('proposal-count').textContent=pending.length;$('later-count').textContent=later.length;$('later-link-count').textContent=later.length;$('idea-count').textContent=ideas.length;$('idea-link-count').textContent=ideas.length;$('rejected-count').textContent=rejected.length;
    $('proposal-sub').textContent=pending.length>3?'Прокрути список и проверь каждую идею.':'Проверь каждую идею перед добавлением.';
    $('sample-section').hidden=!showSamplesSeparately;$('sample-count').textContent=samples.length;
    const draw=(target,items,empty)=>{target.replaceChildren();if(!items.length){target.append(element('p','proposal-empty',empty));return;}
      items.forEach(item=>{
        const card=element('article','proposal-card');const title=element('div','proposal-name',item.title);card.append(title);
        const reason=element('p','proposal-reason');reason.append(element('strong','proposal-reason-label','Почему так: '),document.createTextNode(item.reason || 'Объяснение пока не добавлено.'));card.append(reason);
        if(item.note){const note=element('p','proposal-user-note');note.append(element('strong','','Твоя заметка: '),document.createTextNode(item.note));card.append(note);}
        const meta=element('div','proposal-meta'),label=element('label','',item.status==='rejected'?'Дата предложения':'Предложенная дата');
        const date=element('input','proposal-date');date.type='date';date.value=item.date;date.setAttribute('aria-label','Дата: '+item.title);date.disabled=item.status==='rejected';
        date.addEventListener('change',()=>{const next=copy(),p=next.suggestions.find(x=>x.id===item.id);if(date.value&&!L.validDate(date.value)){error('Некорректная дата предложения.');return;}p.date=date.value;L.record(next,`Изменена дата предложения: ${p.title} — ${p.date||'без даты'}`);commit(next);});
        meta.append(label,date);if(item.time)meta.append(element('span','proposal-time','Время: '+item.time));card.append(meta);
        const actions=element('div','proposal-actions');
        const button=(text,klass,action)=>{const b=element('button',klass,text);b.type='button';b.onclick=()=>{
          try{const next=copy(),p=next.suggestions.find(x=>x.id===item.id),oldFocus=focus,oldView=view;L.decideSuggestion(next,item.id,action);
            if(action==='accept' && p.date){focus=p.date;view='week';}
            if(!commit(next)){focus=oldFocus;view=oldView;return;}
            if(action==='later'){$('later-section').open=true;$('proposal-feedback').textContent='Отложено. Найдёшь во «Входящие» → «На потом»; открой по кнопке «На потом».';$('proposal-feedback').hidden=false;}
            if(action==='restore'){$('proposal-feedback').textContent='Предложение возвращено в список на согласование.';$('proposal-feedback').hidden=false;}
            if(action==='reject'){$('proposal-feedback').textContent='Предложение убрано. Его можно вернуть из раздела «Убранные».';$('proposal-feedback').hidden=false;}
            if(action==='accept'){$('proposal-feedback').textContent=p.date?'Добавлено в календарь на '+fmt(p.date,{day:'numeric',month:'long',year:'numeric'})+'.':'Добавлено в список «Без даты».';$('proposal-feedback').hidden=false;}
            if(item.status==='later'){$('later-feedback').textContent=$('proposal-feedback').textContent;$('later-feedback').hidden=false;}
            else if(action==='later')$('later-feedback').hidden=true;
            if(item.status==='noted'){$('idea-feedback').textContent=$('proposal-feedback').textContent;$('idea-feedback').hidden=false;}
          }catch(e){error(e.message);}
        };return b;};
        if(item.status!=='rejected')actions.append(button('✓ В календарь','proposal-accept','accept'));
        if(item.status==='pending')actions.append(button('На потом','proposal-later','later'));
        if(item.status!=='rejected'){const noteButton=element('button','proposal-note',item.status==='noted'?'Изменить заметку':'В заметки');noteButton.type='button';noteButton.onclick=()=>openIdea(item);actions.append(noteButton);}
        if(item.status==='later' || item.status==='noted' || item.status==='rejected')actions.append(button('Вернуть','proposal-later','restore'));
        if(item.status!=='rejected')actions.append(button('Убрать','proposal-remove','reject'));
        card.append(actions);target.append(card);
      });};
    draw($('proposal-list'),pending,'Здесь появятся предложения из чата. Для знакомства нажми «Посмотреть пример».');
    draw($('sample-list'),showSamplesSeparately?samples:[],'Примеров пока нет.');
    draw($('later-list'),later,'Отложенных предложений пока нет.');draw($('idea-list'),ideas,'Заметок из предложений пока нет.');draw($('rejected-list'),rejected,'Убранных предложений пока нет.');
  }
  function openIdea(item){
    editingIdea=item.id;$('idea-subject').textContent=item.title;$('idea-text').value=item.note || '';$('idea-error').hidden=true;
    $('idea-title').textContent=item.status==='noted'?'Изменить заметку':'В заметки';$('idea-dialog').showModal();$('idea-text').focus();
  }
  $('close-idea-dialog').onclick=()=>$('idea-dialog').close();$('cancel-idea-dialog').onclick=()=>$('idea-dialog').close();
  $('idea-form').addEventListener('submit',event=>{
    event.preventDefault();try{
      const next=copy(),item=next.suggestions.find(p=>p.id===editingIdea);
      if(!item || item.status==='accepted' || item.status==='rejected')throw Error('Предложение больше недоступно.');
      const previousStatus=item.status;item.note=$('idea-text').value;
      L.decideSuggestion(next,item.id,'note');
      if(commit(next)){
        $('idea-dialog').close();$('idea-section').open=true;$('idea-feedback').hidden=true;
        $('proposal-feedback').textContent='Сохранено во «Входящие» → «Заметки из предложений». В календарь не добавлено.';$('proposal-feedback').hidden=false;
        if(previousStatus==='later'){$('later-feedback').textContent=$('proposal-feedback').textContent;$('later-feedback').hidden=false;}
        if(previousStatus==='noted'){$('idea-feedback').textContent='Заметка сохранена.';$('idea-feedback').hidden=false;}
      }else{$('idea-error').textContent=$('storage-error').textContent;$('idea-error').hidden=false;}
    }catch(e){$('idea-error').textContent=e.message;$('idea-error').hidden=false;}
  });
  $('show-ideas').onclick=()=>{const section=$('idea-section');section.open=true;section.scrollIntoView({block:'center'});section.querySelector('summary').focus({preventScroll:true});};
  $('show-later').onclick=()=>{
    const section=$('later-section');section.open=true;section.scrollIntoView({block:'center'});section.querySelector('summary').focus({preventScroll:true});
  };
  function render(){
    $('today-label').textContent=fmt(today(),{day:'numeric',month:'long',weekday:'long'});
    const income=L.incomeWeek(state,today());
    $('income-week-range').textContent='Даты задач на этой неделе: '+fmt(income.start,{day:'numeric',month:'short'})+' — '+fmt(income.end,{day:'numeric',month:'short',year:'numeric'});
    $('income-status').textContent=!canWrite?'Сохранённые данные недоступны — сводка не рассчитана.':income.open+income.done ? `Отмеченных дел: ${income.open+income.done} · в работе: ${income.open} · выполнено: ${income.done}.` : 'На эту неделю нет отмеченных дел о заработке. Возможно, нужные дела ещё не отмечены.';
    $('add-income').disabled=!canWrite;
    if(!notesDirty && $('notes').value!==state.notes) $('notes').value=state.notes;
    if(!draftDirty && $('source-text').value!==state.draft) $('source-text').value=state.draft;
    renderProposals();
    const grid=$('week-grid'); grid.replaceChildren();
    document.querySelectorAll('.view-tab').forEach(tab=>{const active=tab.dataset.view===view;tab.classList.toggle('active',active);tab.setAttribute('aria-pressed',String(active));});
    $('view-heading').textContent={week:'Неделя',month:'Месяц',year:'Год'}[view];
    const currentTasks=state.tasks.filter(t=>t.date===today() && t.status==='open');
    $('today-summary').textContent=!canWrite ? '· сохранённые данные недоступны' : currentTasks.length ? `· ${taskCount(currentTasks.length)}: ${currentTasks.slice(0,2).map(t=>t.title).join(', ')}${currentTasks.length>2?' и другие':''}` : '· запланированных задач нет';
    $('voice-today').disabled=!canWrite;
    $('example-notice').hidden=!state.tasks.some(t=>t.id.startsWith('demo-20261120-'));
    const dayNames=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    const tasksFor=day=>state.tasks.filter(t=>t.date===day && t.status!=='cancelled').sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
    if(view==='week') {
      const week=L.monday(focus); grid.className='week-grid';
      $('week-label').textContent=fmt(week,{day:'numeric',month:'short'})+' — '+fmt(L.addDays(week,6),{day:'numeric',month:'short',year:'numeric'});
      for(let i=0;i<7;i++){
        const day=L.addDays(week,i),col=element('div'),head=element('div','day-head'+(day===today()?' today':'')),body=element('div','day-body');
        head.append(element('b','',dayNames[i]),element('span','',fmt(day,{day:'numeric',month:'short'})));col.append(head);
        tasksFor(day).forEach(t=>body.append(taskButton(t)));
        const add=element('button','add-day','＋');add.type='button';add.setAttribute('aria-label','Добавить задачу на '+fmt(day,{day:'numeric',month:'long'}));add.addEventListener('click',()=>openTask(null,day));body.append(add);col.append(body);grid.append(col);
      }
    } else if(view==='month') {
      const first=focus.slice(0,7)+'-01',start=L.monday(first),next=L.addMonths(first,1),last=L.addDays(next,-1),end=L.addDays(L.monday(last),6);
      $('week-label').textContent=fmt(first,{month:'long',year:'numeric'});grid.className='month-grid';
      dayNames.forEach(name=>grid.append(element('div','month-weekday',name)));
      for(let day=start;day<=end;day=L.addDays(day,1)){
        const cell=element('div','month-cell'+(day.slice(0,7)!==first.slice(0,7)?' outside':'')+(day===today()?' today-cell':''));
        const head=element('div','month-cell-head');head.append(element('span','',String(Number(day.slice(-2)))));
        const add=element('button','month-add','＋');add.type='button';add.setAttribute('aria-label','Добавить задачу на '+fmt(day,{day:'numeric',month:'long'}));add.onclick=()=>openTask(null,day);head.append(add);cell.append(head);
        tasksFor(day).forEach(t=>cell.append(taskButton(t)));grid.append(cell);
      }
    } else {
      const year=focus.slice(0,4);$('week-label').textContent=year;grid.className='year-grid';
      for(let m=1;m<=12;m++){
        const first=`${year}-${String(m).padStart(2,'0')}-01`,prefix=first.slice(0,7),items=state.tasks.filter(t=>t.date.startsWith(prefix) && t.status!=='cancelled');
        const button=element('button','year-card');button.type='button';button.append(element('strong','',fmt(first,{month:'long'})),element('span','',items.length?taskCount(items.length):'Нет задач'));
        items.slice(0,3).forEach(t=>button.append(element('small','',`${Number(t.date.slice(-2))} · ${t.title}`)));
        button.onclick=()=>{focus=first;view='month';render();};grid.append(button);
      }
    }
    const inbox=state.tasks.filter(t=>!t.date && t.status!=='cancelled'),overdue=state.tasks.filter(t=>L.overdue(t,today())).sort((a,b)=>a.date.localeCompare(b.date)),cancelled=state.tasks.filter(t=>t.status==='cancelled');
    $('inbox-count').textContent=inbox.length;$('overdue-count').textContent=overdue.length;
    $('overdue-question').hidden=overdue.length===0;$('overdue-tips').hidden=overdue.length===0;
    renderList($('inbox'),inbox,'Здесь пока пусто.');renderList($('overdue'),overdue,'Просроченных задач нет.');renderList($('cancelled'),cancelled,'Отменённых задач нет.');
    const list=$('history-list');list.replaceChildren();state.history.slice(0,30).forEach(h=>{const el=element('div','history-item');const when=new Date(h.at);el.append(element('time','',new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(when)),element('span','',h.text));list.append(el);});
    if(!state.history.length)list.append(element('p','empty-small','Изменений пока нет.'));
  }
  function movePeriod(delta){focus=view==='week'?L.addDays(focus,7*delta):L.addMonths(focus,(view==='month'?1:12)*delta);render();}
  $('prev-week').onclick=()=>movePeriod(-1);$('next-week').onclick=()=>movePeriod(1);$('this-week').onclick=()=>{focus=today();render();};
  document.querySelectorAll('.view-tab').forEach(tab=>tab.onclick=()=>{view=tab.dataset.view;render();});
  $('show-example').onclick=()=>{
    if(!canWrite){error('Нельзя загрузить пример: сначала восстановите доступ к сохранённым данным.');return;}
    const next=copy(),added=L.mergeBatch(next,window.PLANNER_EXAMPLE);
    if(added && !commit(next))return;
    focus='2026-11-20';view='week';render();
  };
  $('add-top').onclick=()=>openTask(null);$('add-inbox').onclick=()=>openTask(null);$('add-income').onclick=()=>openTask(null,'',true);$('close-dialog').onclick=()=>$('task-dialog').close();
  function applyTaskForm(next){
    const old=next.tasks.find(t=>t.id===editing);
    if(editing && !old)throw Error('Задача больше недоступна.');
    const entry=L.task({id:editing||undefined,title:$('task-title').value,date:$('task-date').value,time:$('task-time').value,status:old?.status||'open',note:$('task-note').value,obstacle:$('task-obstacle').value,nextStep:$('task-next-step').value,income:$('task-income').checked});
    if(old){
      const before=`${old.title} (${old.date||'без даты'}${old.time?' '+old.time:''})`,after=`${entry.title} (${entry.date||'без даты'}${entry.time?' '+entry.time:''})`;
      if(before!==after)L.record(next,`Изменено: ${before} → ${after}`);
      if((old.income===true)!==entry.income)L.record(next,`${entry.income?'Отмечено как дело о заработке':'Снята отметка о заработке'}: ${entry.title}`);
      if((old.note||'')!==entry.note)L.record(next,`Обновлена заметка к задаче: ${entry.title}`);
      if((old.obstacle||'')!==entry.obstacle || (old.nextStep||'')!==entry.nextStep)L.record(next,`Разбор: ${entry.title}. Что помешало: ${entry.obstacle||'не указано'}. Следующий шаг: ${entry.nextStep||'не указан'}`);
      Object.assign(old,entry);
    }else {next.tasks.push(entry);L.record(next,`Добавлено: ${entry.title}${entry.date?' — '+entry.date:''}${entry.time?' '+entry.time:''}`);if(entry.obstacle || entry.nextStep)L.record(next,`Разбор: ${entry.title}. Что помешало: ${entry.obstacle||'не указано'}. Следующий шаг: ${entry.nextStep||'не указан'}`);}
  }
  $('task-form').addEventListener('submit',event=>{
    event.preventDefault();try{const next=copy();applyTaskForm(next);if(commit(next))$('task-dialog').close();else{$('form-error').textContent=$('storage-error').textContent;$('form-error').hidden=false;}}
    catch(e){$('form-error').textContent=e.message;$('form-error').hidden=false;}
  });
  function setStatus(status){const next=copy();let reason='';if(status==='cancelled'){reason=prompt('Почему задача больше не актуальна? Причина сохранится в истории.');if(reason===null)return;}try{applyTaskForm(next);L.changeStatus(next,editing,status,reason);if(commit(next))$('task-dialog').close();else{$('form-error').textContent=$('storage-error').textContent;$('form-error').hidden=false;}}catch(e){$('form-error').textContent=e.message;$('form-error').hidden=false;}}
  $('mark-done').onclick=()=>setStatus('done');$('reopen').onclick=()=>setStatus('open');$('cancel-task').onclick=()=>setStatus('cancelled');
  function saveNotes(){
    if(!notesDirty)return true;
    const next=copy();next.notes=$('notes').value;notesDirty=false;
    if(commit(next,false,false)){$('note-status').textContent='Сохранено в этом браузере ✓';return true;}
    notesDirty=true;$('note-status').textContent='Не удалось сохранить заметку.';return false;
  }
  $('save-notes').onclick=saveNotes;
  function exampleSuggestions(){return {format:'personal-planner-suggestions-v1',suggestions:[
    {id:'sample-proposal-fence',title:'Пример · Второй этап покраски забора',date:L.addDays(today(),3),time:'',reason:'В примере пользователя забор запланирован на два дня. Дата условная, занятость не проверялась.'},
    {id:'sample-proposal-reels',title:'Пример · Выбрать тему для короткого ролика',date:'',time:'',reason:'Идея для демонстрации, срок пока не известен.'}
  ]};}
  $('sample-proposals').onclick=()=>{
    const next=copy();
    try{const added=L.mergeSuggestions(next,exampleSuggestions());if(added){if(commit(next)){$('proposal-feedback').textContent='Это демонстрация, а не результат анализа текста. Ни одна задача ещё не добавлена.';$('proposal-feedback').hidden=false;}}else{$('proposal-feedback').textContent='Примеры уже добавлены или находятся в списке «Убранные».';$('proposal-feedback').hidden=false;}}catch(e){error(e.message);}
  };
  let speaking=false;
  function voiceStopped(message){speaking=false;$('voice-today').textContent='♪ Озвучить день';$('voice-status').textContent=message;}
  $('voice-today').onclick=()=>{
    if(speaking){window.speechSynthesis.cancel();voiceStopped('Озвучивание остановлено.');return;}
    const message=L.briefing(state,today());
    if(!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) { $('voice-status').textContent='Озвучивание недоступно в этом браузере. '+message;return; }
    try {
      const AudioCtx=window.AudioContext || window.webkitAudioContext;
      if(AudioCtx){const audio=new AudioCtx(),osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=660;gain.gain.setValueAtTime(0.0001,audio.currentTime);gain.gain.exponentialRampToValueAtTime(0.10,audio.currentTime+0.025);gain.gain.exponentialRampToValueAtTime(0.0001,audio.currentTime+0.16);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+0.17);osc.onended=()=>audio.close().catch(()=>{});if(audio.state==='suspended')audio.resume().catch(()=>{});}
    } catch(e) { /* Голос может работать и без звукового сигнала. */ }
    try {
      const utterance=new SpeechSynthesisUtterance(message);utterance.lang='ru-RU';
      const russian=window.speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith('ru'));if(russian)utterance.voice=russian;
      speaking=true;$('voice-today').textContent='■ Остановить';$('voice-status').textContent='Озвучивание запрошено. '+message;
      utterance.onend=()=>voiceStopped('Готово. '+message);
      utterance.onerror=event=>voiceStopped(event.error==='interrupted' || event.error==='canceled' ? 'Озвучивание остановлено.' : 'Не удалось озвучить. Проверь звук и доступность русского голоса. '+message);
      window.speechSynthesis.speak(utterance);
    }catch(e){voiceStopped('Не удалось озвучить. '+message);}
  };
  function download(filename, content, type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportAllowed(){
    if(!canWrite){error('Сохранённые данные не удалось прочитать. Экспорт недоступен, чтобы не выдать пустую копию за рабочую.');return false;}
    if(!saveDraft() || !saveNotes())return false;
    return true;
  }
  $('backup').onclick=()=>{if(exportAllowed())download('moya-nedelya-backup.json',JSON.stringify(state,null,2),'application/json');};
  $('export-report').onclick=()=>{if(exportAllowed())download('moya-nedelya-otchet.md',L.report(state),'text/markdown;charset=utf-8');};
  $('download-chat').onclick=()=>$('export-report').click();$('intake-export').onclick=()=>$('export-report').click();
  $('import-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('Файл больше 5 МБ.');const incoming=L.validateBackup(JSON.parse(await file.text()));if(confirm('Загрузка заменит все текущие задачи, заметки, текст, предложения и историю в этом браузере, включая несохранённые изменения. Сначала сохраните резервную копию. Продолжить?')){const hadDirtyNotes=notesDirty,hadDirtyDraft=draftDirty;clearTimeout(draftTimer);notesDirty=false;draftDirty=false;if(!commit(incoming,true)){notesDirty=hadDirtyNotes;draftDirty=hadDirtyDraft;}else{$('draft-status').textContent='Загружено из резервной копии.';$('note-status').textContent='Загружено из резервной копии.';}}}catch(e){error('Не удалось загрузить копию: '+e.message);}finally{event.target.value='';}});
  $('batch-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw Error('Пакет больше 1 МБ.');const raw=JSON.parse(await file.text()),next=copy(),added=L.mergeSuggestions(next,raw);if(!added){$('proposal-feedback').textContent='Все предложения из этого пакета уже были загружены.';$('proposal-feedback').hidden=false;return;}if(confirm(`Загрузить предложений: ${added}? В календарь они попадут только после твоего подтверждения.`) && commit(next)){$('proposal-feedback').textContent=`Загружено предложений: ${added}. Проверь их перед добавлением.`;$('proposal-feedback').hidden=false;}}catch(e){error('Не удалось загрузить предложения: '+e.message);}finally{event.target.value='';}});
  $('remove-example').onclick=()=>{if(!confirm('Убрать все задачи с пометкой «Пример», включая сделанные в них изменения? Остальные задачи останутся.'))return;const next=copy();next.tasks=next.tasks.filter(t=>!t.id.startsWith('demo-20261120-'));L.record(next,'Демонстрационные задачи убраны');commit(next);};
  let syncInFlight=false;
  async function syncChat(){
    if(syncInFlight)return;
    if(!canWrite){$('chat-sync-status').textContent='Рекомендации не загружены: нет доступа к сохранённым данным.';return;}
    if(document.activeElement && document.activeElement.classList.contains('proposal-date'))return;
    syncInFlight=true;
    try{
      let response=await fetch('local-inbox/latest.json',{cache:'no-store',credentials:'same-origin'}),usingDemo=false;
      if(response.status===404){response=await fetch('demo-suggestions.json',{cache:'no-store',credentials:'same-origin'});usingDemo=true;}
      if(response.status===404){$('chat-sync-status').textContent='Пока нет новых рекомендаций или примеров.';return;}
      if(!response.ok)throw Error('сервер недоступен');
      const text=await response.text();if(text.length>1024*1024)throw Error('слишком большой пакет');
      const raw=JSON.parse(text);
      if(document.activeElement && document.activeElement.classList.contains('proposal-date'))return;
      const next=copy(),added=L.mergeSuggestions(next,raw);
      if(added && !commit(next)){ $('chat-sync-status').textContent='Не удалось сохранить рекомендации. Проверь предупреждение.';return; }
      $('chat-sync-status').textContent=usingDemo ? (added ? `Показаны примеры рекомендаций: ${added}. Проверь их перед добавлением.` : 'Примеры рекомендаций проверены.') : (added ? `Из чата получено рекомендаций: ${added}. Проверь их перед добавлением.` : 'Рекомендации из чата проверены.');
    }catch(e){$('chat-sync-status').textContent='Не удалось проверить рекомендации. Можно нажать «Обновить» или загрузить файл.';}
    finally{syncInFlight=false;}
  }
  $('sync-chat').onclick=syncChat;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncChat();});
  // В старых браузерных данных обновляем только известные исходные тексты, не меняя решения пользователя.
  if(canWrite){const next=copy();if(improveKnownReasons(next))commit(next,false,false);}
  const exampleMarker='Демонстрационный план 2026-11-20 загружен', proposalMarker='Демонстрационные предложения загружены';
  if(canWrite && (!state.history.some(h=>h.text===exampleMarker) || !state.history.some(h=>h.text===proposalMarker))) {
    const next=copy();
    if(!next.history.some(h=>h.text===exampleMarker)){L.mergeBatch(next,window.PLANNER_EXAMPLE);L.record(next,exampleMarker);}
    if(!next.history.some(h=>h.text===proposalMarker)){L.mergeSuggestions(next,exampleSuggestions());L.record(next,proposalMarker);}
    commit(next);
  } else render();
  syncChat();
  window.setInterval(()=>{if(!document.hidden)syncChat();},15000);
})();
