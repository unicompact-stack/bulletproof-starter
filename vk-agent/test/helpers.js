// Общая обвязка тестов: временная рабочая папка на каждый файл тестов.
// Настоящие факты, очередь и история публикаций при тестах не трогаются.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Настоящий корень проекта (не временный) */
export const REPO = fileURLToPath(new URL('..', import.meta.url));

/**
 * Создать временную копию профилей, панели и фикстур.
 * ВАЖНО: вызывать до импорта модулей из src/ — они читают process.env.VK_AGENT_ROOT
 * в момент загрузки модуля.
 */
export async function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-agent-test-'));
  for (const sub of ['profiles', 'channels', 'panel']) {
    fs.cpSync(path.join(REPO, sub), path.join(dir, sub), { recursive: true });
  }
  fs.cpSync(path.join(REPO, 'test', 'fixtures'), path.join(dir, 'test', 'fixtures'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'queue'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  // факты, собранные в настоящем репозитории, тестам не нужны: база должна быть пустой
  const factsDir = path.join(dir, 'data', 'banks', 'facts');
  if (fs.existsSync(factsDir)) {
    for (const file of fs.readdirSync(factsDir)) {
      if (file.endsWith('.json')) fs.rmSync(path.join(factsDir, file));
    }
  }
  process.env.VK_AGENT_ROOT = dir;
  return dir;
}

export async function loadSrc(name) {
  return import(`../src/${name}.js`);
}

export function fixture(name, root = process.env.VK_AGENT_ROOT, profile = 'banks') {
  return fs.readFileSync(path.join(root, 'test', 'fixtures', profile, name), 'utf8');
}

export function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}
