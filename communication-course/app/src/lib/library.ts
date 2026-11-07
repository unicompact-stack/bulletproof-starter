import type { Source } from '../types'

const ROW = /^\| S-\d{3} \|/
const LINK = /\[([^\]]*)\]\(([^)]+)\)/

/** Парсит markdown-таблицу реестра источников. */
export function parseSources(raw: string): Source[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const sources: Source[] = []

  for (const line of lines) {
    if (!ROW.test(line)) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    if (cells.length < 10) continue

    const [id, title, author, year, type, linkCell, access, score, status, lessons] = cells
    const url = linkCell.match(LINK)?.[2] ?? ''

    sources.push({ id, title, author, year, type, url, access, score, status, lessons })
  }

  return sources
}

/** Номера уроков, к которым привязан источник. */
export function sourceLessons(source: Source): number[] {
  return source.lessons
    .split(',')
    .map((n) => Number.parseInt(n.trim(), 10))
    .filter((n) => Number.isFinite(n))
}
