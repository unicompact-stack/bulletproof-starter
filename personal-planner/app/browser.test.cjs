/* Optional integration test: requires puppeteer-core and a Chromium executable.
   Set CHROME_PATH, and NODE_PATH if puppeteer-core is installed outside this project.
   Run with the app served at http://127.0.0.1:4173/ (or set PLANNER_URL).
   Uses an isolated browser profile; never touches a user's browser data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const puppeteer = require('puppeteer-core');
const url=process.env.PLANNER_URL || 'http://127.0.0.1:4173/';
const chrome=process.env.CHROME_PATH;
if(!chrome) throw Error('Set CHROME_PATH to a Chromium executable');
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(), errors=[], requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 // Keep this regression suite independent of the user's temporary inbox.
 await page.setRequestInterception(true);
 page.on('request',r=>r.url().includes('/local-inbox/') ? r.respond({status:200,contentType:'application/json',body:'{"format":"personal-planner-suggestions-v1","suggestions":[]}'}) : r.continue());
 page.on('dialog',dialog=>dialog.accept('Причина для теста'));
 await page.setViewport({width:1440,height:900});
 await page.emulateTimezone('UTC');
 await page.evaluateOnNewDocument(()=>{
   const OriginalDate=Date, fixed=OriginalDate.parse('2026-11-20T12:00:00Z');
   window.Date=class extends OriginalDate { constructor(...args){super(...(args.length?args:[fixed]));} static now(){return fixed;} };
   window.__spoken=[];
   Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'ru-RU'}],speak:u=>{window.__spoken.push(u.text);window.__lastUtterance=u;},cancel:()=>{}}});
   window.SpeechSynthesisUtterance=function(text){this.text=text};
 });
 await page.goto(url,{waitUntil:'networkidle0'});
 assert.equal(await page.$$eval('.task-card',a=>a.length),18,'пример недели на текущую дату');
 assert.equal(await page.$$eval('.day-body',a=>a.length),7);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.length),20);
 const assets=requests.filter(x=>/\/(app|logic|example)\.js/.test(x));assert.equal(assets.length,3);assert.ok(assets.every(x=>x.includes('?v=')),'адреса скриптов версионированы');
 console.log('1. Новые ресурсы и пример на неделе — OK');
 await page.click('[data-view="month"]');assert.equal(await page.$eval('#week-grid',e=>e.className),'month-grid');assert.ok(await page.$$eval('.month-cell',a=>a.length)>=28);assert.match(await page.$eval('#week-label',e=>e.textContent),/ноябр/i);
 await page.click('[data-view="year"]');assert.equal(await page.$$eval('.year-card',a=>a.length),12);assert.equal(await page.$eval('#week-label',e=>e.textContent),'2026');await page.click('#next-week');assert.equal(await page.$eval('#week-label',e=>e.textContent),'2027');await page.click('.year-card');assert.equal(await page.$eval('#week-grid',e=>e.className),'month-grid');assert.match(await page.$eval('#week-label',e=>e.textContent),/январ/i);
 console.log('2. Месяц, год и переход через границу года — OK');
 await page.click('#show-example');assert.equal(await page.$eval('#week-grid',e=>e.className),'week-grid');assert.equal(await page.$$eval('.task-card',a=>a.length),18);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.length),20);
 await page.click('#add-inbox');await page.type('#task-title','Моя задача');await page.click('#task-form button[type=submit]');assert.match(await page.$eval('#inbox',e=>e.textContent),/Моя задача/);await page.click('#inbox .mini-task');await page.click('#mark-done');assert.match(await page.$eval('#inbox',e=>e.textContent),/Выполнено/);await page.click('#inbox .mini-task');await page.click('#reopen');await page.click('#inbox .mini-task');await page.click('#cancel-task');assert.match(await page.$eval('#history-list',e=>e.textContent),/Причина для теста/);
 console.log('3. Без даты, выполнение, возврат и отмена с причиной — OK');
 await page.click('#remove-example');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.length),1);await page.reload({waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.length),1);await page.click('#show-example');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.length),21);await page.click('#show-example');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.length),21);
 console.log('4. Удаление и восстановление примера без потери и дублирования задач — OK');
 assert.equal(await page.evaluate(()=>window.__spoken.length),0,'при открытии нет навязанного звука');await page.click('#voice-today');assert.equal(await page.evaluate(()=>window.__spoken.length),1);assert.match(await page.evaluate(()=>window.__spoken[0]),/На сегодня/i);assert.match(await page.evaluate(()=>window.__spoken[0]),/просроченн/i);await page.click('#voice-today');assert.match(await page.$eval('#voice-status',e=>e.textContent),/остановлено/i);
 console.log('5. Голос по нажатию, текст сводки, остановка (синтезатор замокирован) — OK');
 await page.click('.notes-details summary');await page.type('#notes','Моя сохранённая цель');await page.click('#save-notes');await page.type('#source-text','Большой текст для разбора');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).draft==='Большой текст для разбора');await page.reload({waitUntil:'networkidle0'});assert.equal(await page.$eval('#notes',e=>e.value),'Моя сохранённая цель');assert.equal(await page.$eval('#source-text',e=>e.value),'Большой текст для разбора');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.length),21);
 console.log('6. Сохранение и перезагрузка — OK');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'planner-backup-'));const client=await page.createCDPSession();await client.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:dir});await page.click('.notes-details summary');await page.type('#notes',' и новое уточнение');await page.click('#download-chat');const report=path.join(dir,'moya-nedelya-otchet.md');for(let i=0;i<100&&!fs.existsSync(report);i++)await new Promise(r=>setTimeout(r,30));assert.ok(fs.existsSync(report));const reportContent=fs.readFileSync(report,'utf8');assert.match(reportContent,/Большой текст для разбора/);assert.match(reportContent,/Моя сохранённая цель и новое уточнение/);assert.match(reportContent,/Предложения/);await page.click('#backup');const backup=path.join(dir,'moya-nedelya-backup.json');for(let i=0;i<100&&!fs.existsSync(backup);i++)await new Promise(r=>setTimeout(r,30));assert.ok(fs.existsSync(backup));const data=JSON.parse(fs.readFileSync(backup,'utf8'));assert.equal(data.tasks.length,21);await page.click('#add-inbox');await page.type('#task-title','После копии');await page.click('#task-form button[type=submit]');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.length),22);await (await page.$('#import-file')).uploadFile(backup);await page.waitForFunction(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.length===21);
 console.log('7. Скачивание и восстановление резервной копии — OK');
 await page.setViewport({width:390,height:844,isMobile:true,deviceScaleFactor:1});await page.click('[data-view="month"]');assert.equal(await page.$eval('#week-grid',e=>e.className),'month-grid');await page.click('[data-view="year"]');assert.equal(await page.$$eval('.year-card',a=>a.length),12);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'страница влезает по ширине');
 console.log('8. Переключение на узком экране — OK');
 await page.click('#show-example');assert.match(await page.$eval('#week-label',e=>e.textContent),/16/);assert.ok(await page.$$eval('#overdue .mini-task',a=>a.length)>0);
 console.log('9. Просроченные задачи и переход к примеру — OK');
 assert.deepEqual(errors,[]);console.log('10. Ошибки JavaScript в браузере отсутствуют — OK');
 await page.click('#sample-proposals');assert.equal(await page.$$eval('#proposal-list .proposal-card',a=>a.length),2);
 await page.click('#proposal-list .proposal-card:first-child .proposal-later');assert.equal(await page.$$eval('#later-list .proposal-card',a=>a.length),1);
 await page.click('#proposal-list .proposal-card .proposal-accept');assert.match(await page.$eval('#inbox',e=>e.textContent),/Выбрать тему/);
 await page.click('#later-list .proposal-card .proposal-accept');assert.match(await page.$eval('#proposal-feedback',e=>e.textContent),/Добавлено в календарь/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.filter(t=>t.id.startsWith('suggestion:')).length),2);
 await page.reload({waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.filter(t=>t.id.startsWith('suggestion:')).length),2);
 assert.equal(await page.$eval('#source-text',e=>e.value),'Большой текст для разбора');assert.deepEqual(errors,[]);console.log('11. Предложения: отложить, принять с датой и без, повторная загрузка — OK');
 const batchPath=path.join(dir,'suggestions.json');fs.writeFileSync(batchPath,JSON.stringify({format:'personal-planner-suggestions-v1',suggestions:[{id:'chat-1',title:'План из чата',date:'2026-11-25',time:'',reason:'Тест'}]}));
 await (await page.$('#batch-file')).uploadFile(batchPath);await page.waitForFunction(()=>document.querySelector('#proposal-list').textContent.includes('План из чата'));
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.filter(t=>t.title==='План из чата').length),0);
 await page.click('#proposal-list .proposal-card .proposal-remove');await page.click('#rejected-section summary');assert.match(await page.$eval('#rejected-list',e=>e.textContent),/План из чата/);await page.click('#rejected-list .proposal-card .proposal-later');await page.click('#proposal-list .proposal-card .proposal-accept');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.filter(t=>t.title==='План из чата').length),1);await page.reload({waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.filter(t=>t.title==='План из чата').length),1);assert.deepEqual(errors,[]);console.log('12. Импорт файла: проверка до календаря, удаление, возврат и принятие — OK');
 if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH,fullPage:true});
 await page.evaluate(()=>localStorage.setItem('personal-planner-v1',JSON.stringify({version:1,tasks:[{id:'legacy',title:'Старая задача',date:'',time:'',status:'open'}],notes:'Старая заметка',history:[{at:'2026-11-20T12:00:00Z',text:'Демонстрационный план 2026-11-20 загружен'}]})));await page.reload({waitUntil:'networkidle0'});assert.equal(await page.$eval('#notes',e=>e.value),'Старая заметка');assert.match(await page.$eval('#inbox',e=>e.textContent),/Старая задача/);assert.equal(await page.$$eval('#proposal-list .proposal-card',a=>a.length),2);assert.deepEqual(errors,[]);console.log('13. Обновление старого состояния не потеряло задачи и заметки — OK');
 // Exercise automatic delivery using synthetic data in a separate browser context.
 const context=await browser.createBrowserContext(),syncPage=await context.newPage(),syncErrors=[];let failInbox=false;
 syncPage.on('pageerror',e=>syncErrors.push(e.message));await syncPage.setRequestInterception(true);
 const simulated={format:'personal-planner-suggestions-v1',suggestions:Array.from({length:9},(_,i)=>({id:'synthetic-'+i,title:'Проверочная задача '+i,date:'2026-11-25',time:'',reason:'Тест'}))};
 syncPage.on('request',r=>r.url().includes('/local-inbox/') ? r.respond(failInbox?{status:500,body:'error'}:{status:200,contentType:'application/json',body:JSON.stringify(simulated)}) : r.continue());
 await syncPage.goto(url,{waitUntil:'networkidle0'});await syncPage.waitForFunction(()=>document.querySelector('#proposal-count').textContent==='9');
 assert.equal(await syncPage.$$eval('#proposal-list .proposal-card',a=>a.length),9);assert.equal(await syncPage.$eval('#sample-section',e=>e.hidden),false);
 const originalTasks=await syncPage.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.length);
 await syncPage.click('#proposal-list .proposal-card .proposal-accept');await syncPage.click('#proposal-list .proposal-card .proposal-later');await syncPage.click('#proposal-list .proposal-card .proposal-remove');
 await syncPage.reload({waitUntil:'networkidle0'});await syncPage.click('#sync-chat');await syncPage.waitForFunction(()=>document.querySelector('#chat-sync-status').textContent.includes('проверены'));
 assert.equal(await syncPage.$eval('#proposal-count',e=>e.textContent),'6');assert.equal(await syncPage.$eval('#later-count',e=>e.textContent),'1');assert.equal(await syncPage.$eval('#rejected-count',e=>e.textContent),'1');assert.equal(await syncPage.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.length),originalTasks+1);
 const before=await syncPage.evaluate(()=>localStorage.getItem('personal-planner-v1'));failInbox=true;await syncPage.click('#sync-chat');await syncPage.waitForFunction(()=>document.querySelector('#chat-sync-status').textContent.includes('Не удалось'));assert.equal(await syncPage.evaluate(()=>localStorage.getItem('personal-planner-v1')),before);assert.deepEqual(syncErrors,[]);await context.close();console.log('14. Автодоставка, отсутствие дублей и ошибка канала без потери данных — OK');
 const demoContext=await browser.createBrowserContext(),demoPage=await demoContext.newPage();await demoPage.setRequestInterception(true);
 demoPage.on('request',r=>r.url().includes('/local-inbox/') ? r.respond({status:404,body:'not found'}) : r.url().includes('/demo-suggestions.json') ? r.respond({status:200,contentType:'application/json',body:JSON.stringify(simulated)}) : r.continue());
 await demoPage.goto(url,{waitUntil:'networkidle0'});await demoPage.waitForFunction(()=>document.querySelector('#proposal-count').textContent==='9');assert.match(await demoPage.$eval('#chat-sync-status',e=>e.textContent),/пример/i);
 await demoPage.click('#proposal-list .proposal-card .proposal-accept');await demoPage.reload({waitUntil:'networkidle0'});await demoPage.waitForFunction(()=>document.querySelector('#proposal-count').textContent==='8');assert.equal(await demoPage.evaluate(()=>JSON.parse(localStorage.getItem('personal-planner-v1')).tasks.filter(t=>t.id.startsWith('suggestion:synthetic-')).length),1);await demoContext.close();console.log('15. Публичные примеры без временного канала; статусы сохраняются — OK');
 await browser.close();fs.rmSync(dir,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exitCode=1;});
