'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {build,ASSETS} = require('./build.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'render-build-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'app'));for(const name of ASSETS)fs.writeFileSync(path.join(root,'app',name),`test-${name}`);return root;}
test('только публичные файлы, личный inbox, сессии и секреты исключены',t=>{
 const root=fixture(t),app=path.join(root,'app');fs.mkdirSync(path.join(app,'local-inbox'));fs.writeFileSync(path.join(app,'local-inbox','latest.json'),'PRIVATE');fs.writeFileSync(path.join(app,'.env'),'SECRET');fs.writeFileSync(path.join(app,'session.json'),'PRIVATE');fs.mkdirSync(path.join(root,'private'));fs.writeFileSync(path.join(root,'private','my.json'),'PRIVATE');
 const result=build(root);assert.deepEqual(fs.readdirSync(result.output).sort(),[...ASSETS].sort());for(const n of ASSETS)assert.equal(fs.readFileSync(path.join(result.output,n),'utf8'),`test-${n}`);assert.ok(fs.existsSync(path.join(app,'local-inbox','latest.json')));
});
test('повторная сборка чистит устаревшие файлы, не меняя оригиналы',t=>{
 const root=fixture(t),first=build(root);fs.writeFileSync(path.join(first.output,'stale'),'PRIVATE');fs.writeFileSync(path.join(root,'app','app.js'),'NEW');build(root);assert.equal(fs.existsSync(path.join(first.output,'stale')),false);assert.equal(fs.readFileSync(path.join(first.output,'app.js'),'utf8'),'NEW');assert.equal(fs.readFileSync(path.join(root,'app','app.js'),'utf8'),'NEW');
});
test('недостающий или символьный файл останавливает сборку до очистки прежней',t=>{
 const root=fixture(t),result=build(root);fs.writeFileSync(path.join(result.output,'keep'),'keep');fs.unlinkSync(path.join(root,'app','app.js'));assert.throws(()=>build(root));assert.ok(fs.existsSync(path.join(result.output,'keep')));fs.symlinkSync(path.join(root,'app','logic.js'),path.join(root,'app','app.js'));assert.throws(()=>build(root));assert.ok(fs.existsSync(path.join(result.output,'keep')));
});
