'use strict';
// Publish only the reviewed application assets. Never copy the app directory wholesale.
const fs = require('node:fs');
const path = require('node:path');
const ASSETS = Object.freeze(['index.html','style.css','logic.js','app.js','example.js','reason-updates.js','demo-suggestions.json']);
function build(plannerRoot) {
  const root = path.resolve(plannerRoot);
  const source = path.join(root, 'app');
  const output = path.join(root, 'render-public');
  // Validate every source before touching the generated directory.
  for (const name of ASSETS) {
    const file = path.join(source, name);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Недопустимый файл приложения: ${name}`);
  }
  // This fixed folder is generated output only; do not store personal files inside it.
  fs.rmSync(output, {recursive:true, force:true});
  fs.mkdirSync(output, {recursive:true});
  for (const name of ASSETS) fs.copyFileSync(path.join(source, name), path.join(output, name), fs.constants.COPYFILE_EXCL);
  return {output, files:[...ASSETS]};
}
if (require.main === module) {
  try { const result=build(path.resolve(__dirname,'..')); console.log(`Публичная сборка: ${result.files.length} файлов. Личные данные не копируются.`); }
  catch (_) { console.error('Не удалось собрать приложение: проверь исходные файлы.'); process.exitCode=1; }
}
module.exports={build,ASSETS};
