import type { Article } from '../types'

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/

function parseList(value: string): string[] {
  const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '')
  return inner
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

/** Разбирает статью читальни: YAML-шапка + тело markdown. */
export function parseArticle(raw: string, file: string): Article {
  const text = raw.replace(/\r\n/g, '\n')
  const match = text.match(FRONTMATTER)

  const meta: Record<string, string> = {}
  if (match) {
    for (const line of match[1].split('\n')) {
      const pair = line.match(/^([a-z_]+):\s*(.*)$/)
      if (pair) meta[pair[1]] = pair[2].trim()
    }
  }

  const withoutMeta = (match ? text.slice(match[0].length) : text).trim()
  // Заголовок H1 показываем отдельно, поэтому из тела его убираем
  const body = withoutMeta.replace(/^#\s+.+\n+/, '').trim()

  return {
    id: meta.id ?? file.slice(0, 5),
    file,
    title: meta.title ?? withoutMeta.match(/^#\s+(.+)$/m)?.[1] ?? file,
    topic: meta.topic ?? '',
    status: meta.status ?? 'черновик',
    sources: meta.sources ? parseList(meta.sources) : [],
    readingTime: meta.reading_time ?? '',
    created: meta.created ?? '',
    updated: meta.updated ?? '',
    body,
  }
}

/** Разбирает рубрикатор тем из TOPICS.md. */
export function parseTopics(raw: string): { id: string; title: string; summary: string }[] {
  const text = raw.replace(/\r\n/g, '\n')
  const topics: { id: string; title: string; summary: string }[] = []
  const re = /^##\s+(T-\d{2})\.\s+(.+)$/gm

  let match: RegExpExecArray | null
  const marks: { id: string; title: string; start: number; end: number }[] = []
  while ((match = re.exec(text)) !== null) {
    marks.push({ id: match[1], title: match[2].trim(), start: match.index, end: text.length })
  }
  marks.forEach((m, i) => {
    if (i + 1 < marks.length) m.end = marks[i + 1].start
    const section = text.slice(m.start, m.end)
    const summary =
      section
        .split('\n')
        .slice(1)
        .join('\n')
        .trim()
        .split('\n\n')[0]
        ?.replace(/\n/g, ' ')
        .trim() ?? ''
    topics.push({ id: m.id, title: m.title, summary })
  })

  return topics
}
