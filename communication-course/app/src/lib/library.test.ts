import { describe, expect, it } from 'vitest'
import { parseSources, sourceLessons } from './library'

const TABLE = `# Реестр

| ID | Название | Автор | Год | Тип | Ссылка | Доступ | Оценка | Статус | Уроки |
|---|---|---|---|---|---|---|---|---|---|
| S-001 | Первый источник | Автор А. | 2007 | исследование | [doi.org](https://doi.org/10.1/x) | реферат | 13/14 | проверено | 1, 3 |
| S-002 | Второй источник | Автор Б. | 2015 | книга | — | печатное издание | 9/14 | на проверке | 5 |
`

describe('parseSources', () => {
  it('парсит строки таблицы в объекты', () => {
    const sources = parseSources(TABLE)

    expect(sources).toHaveLength(2)
    expect(sources[0].id).toBe('S-001')
    expect(sources[0].title).toBe('Первый источник')
    expect(sources[0].author).toBe('Автор А.')
    expect(sources[0].url).toBe('https://doi.org/10.1/x')
    expect(sources[0].status).toBe('проверено')
    expect(sources[1].url).toBe('')
  })

  it('игнорирует заголовок таблицы и разделитель', () => {
    const ids = parseSources(TABLE).map((s) => s.id)
    expect(ids).toEqual(['S-001', 'S-002'])
  })

  it('sourceLessons извлекает номера уроков', () => {
    const [first, second] = parseSources(TABLE)
    expect(sourceLessons(first)).toEqual([1, 3])
    expect(sourceLessons(second)).toEqual([5])
  })
})
