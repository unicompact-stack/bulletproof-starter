'use strict';
// Integration test against a separately served Render build, using a temporary browser context.
const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');
const url=process.env.PLANNER_URL||'http://127.0.0.1:4178/';
if(!process.env.CHROME_PATH)throw Error('Укажите CHROME_PATH');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.createBrowserContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:390,height:844});await page.goto(url,{waitUntil:'networkidle0'});
  const result=await page.evaluate(async()=>({inbox:(await fetch('local-inbox/latest.json')).status,demo:(await fetch('demo-suggestions.json')).status}));
  assert.equal(result.inbox,404);assert.equal(result.demo,200);
  await page.waitForFunction(()=>document.querySelector('#chat-sync-status').textContent.includes('пример'));
  assert.match(await page.$eval('#chat-sync-status',e=>e.textContent),/пример/i);
  assert.ok(Number(await page.$eval('#proposal-count',e=>e.textContent))>0);
  await page.click('#add-inbox');await page.type('#task-title','Только тестовая задача');await page.click('#task-form button[type=submit]');
  await page.reload({waitUntil:'networkidle0'});assert.match(await page.$eval('#inbox',e=>e.textContent),/Только тестовая задача/);
  for(const width of [390,1440]){await page.setViewport({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  assert.deepEqual(errors,[]);await context.close();console.log('Сборка Render: 404 личного inbox, публичные примеры, сохранение, телефон и десктоп — OK');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
