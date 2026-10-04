// Мелкие утилиты: файлы, аргументы командной строки, даты, .env.
// Внешних зависимостей нет — только стандартная библиотека Node.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Корень проекта vk-agent.
 * VK_AGENT_ROOT позволяет тестам работать в отдельной временной папке,
 * чтобы не трогать настоящие факты и очередь.
 */
export const ROOT = process.env.VK_AGENT_ROOT
  ? path.resolve(process.env.VK_AGENT_ROOT)
  : path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export function resolvePath(...parts) {
  return path.join(ROOT, ...parts);
}

export function exists(file) {
  return fs.existsSync(file);
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readText(file, fallback = null) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}

export function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, 'utf8');
}

export function readJson(file, fallback = null) {
  const text = readText(file);
  if (text === null) return fallback;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Не разобрать JSON в ${file}: ${error.message}`);
  }
}

export function writeJson(file, data) {
  writeText(file, JSON.stringify(data, null, 2) + '\n');
}

/** Разбор аргументов: --key value, --flag, positionals */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item.startsWith('--')) {
      const key = item.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(item);
    }
  }
  return args;
}

/** Локальная дата в формате ГГГГ-ММ-ДД */
export function todayISO(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function nowISO() {
  return new Date().toISOString();
}

/** '15.09.2026' или '2026-09-15' -> '2026-09-15' */
export function toISODate(raw) {
  if (!raw) return null;
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw.trim());
  if (dotted) {
    const [, d, m, y] = dotted;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** Сколько дней прошло с даты (ISO) до сегодняшнего дня */
export function daysSince(isoDate, from = new Date()) {
  if (!isoDate) return null;
  const then = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((start - then) / 86400000);
}

/** Свежий ли факт: не старше ttlDays дней */
export function isFresh(isoDate, ttlDays = 30, from = new Date()) {
  const days = daysSince(isoDate, from);
  if (days === null) return false;
  return days <= ttlDays;
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function unique(values) {
  return [...new Set(values)];
}

/**
 * Подхватывает .env из корня проекта. Уже заданные переменные окружения не перетираются.
 */
export function loadEnvFile(file = resolvePath('.env')) {
  const text = readText(file);
  if (!text) return {};
  const parsed = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return parsed;
}

export function env(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

export function envInt(name, fallback) {
  const value = Number.parseInt(env(name, ''), 10);
  return Number.isFinite(value) ? value : fallback;
}

/** Печать в консоль без лишнего шума */
export function log(...args) {
  console.log(...args);
}

/** Текст без HTML-тегов, сущности раскодированы, пробелы сжаты по строкам */
export function plainTextFromHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h1|h2|h3|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[\u00A0\u2009\u202F]/g, ' ')
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}
