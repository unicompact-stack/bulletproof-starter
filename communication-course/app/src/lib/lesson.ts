import type { Lesson } from '../types'

const SELF_CHECK = 'Самопроверка'
const ANSWER = 'Поле для ответа'

/** Разбирает markdown-файл урока на части, которые показывает приложение. */
export function parseLesson(raw: string, id: number): Lesson {
  const text = raw.replace(/\r\n/g, '\n')

  const title = text.match(/^#\s+(.+)$/m)?.[1].trim() ?? `Урок ${id}`
  const goal = text.match(/\*\*Цель:\*\*\s*(.+)/)?.[1].trim() ?? ''
  const time = text.match(/\*\*Время:\*\*\s*(.+)/)?.[1].trim() ?? ''

  // Секции второго уровня: заголовок + содержимое до следующего "## "
  const sections: { heading: string; content: string }[] = []
  const re = /^##\s+(.+)$/gm
  let match: RegExpExecArray | null
  const marks: { heading: string; start: number; end: number }[] = []

  while ((match = re.exec(text)) !== null) {
    marks.push({ heading: match[1].trim(), start: match.index, end: text.length })
  }
  marks.forEach((m, i) => {
    if (i + 1 < marks.length) m.end = marks[i + 1].start
    sections.push({ heading: m.heading, content: text.slice(m.start, m.end).trim() })
  })

  const bodySections = sections.filter(
    (s) => s.heading !== SELF_CHECK && s.heading !== ANSWER,
  )
  const body = bodySections.map((s) => s.content).join('\n\n').trim()

  const selfCheckSection = sections.find((s) => s.heading === SELF_CHECK)
  const selfCheck = selfCheckSection
    ? [...selfCheckSection.content.matchAll(/^- \[[ x]\]\s*(.+)$/gm)].map((m) => m[1].trim())
    : []

  const answerSection = sections.find((s) => s.heading === ANSWER)
  const answerPrompt = answerSection
    ? answerSection.content.replace(/^##\s+.+$/m, '').trim()
    : ''

  return { id, title, goal, time, body, selfCheck, answerPrompt }
}
