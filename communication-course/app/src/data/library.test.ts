import { describe, expect, it } from 'vitest'
import { sources } from './library'
import { sourceLessons } from '../lib/library'

describe('library', () => {
  // Библиотека растёт постоянно, поэтому проверяем нижнюю границу, а не точное число
  it('содержит не меньше 55 источников', () => {
    expect(sources.length).toBeGreaterThanOrEqual(55)
  })

  it('все ID уникальны и идут в формате S-XXX', () => {
    const ids = sources.map((s) => s.id)
    expect(new Set(ids).size).toBe(sources.length)
    for (const id of ids) expect(id).toMatch(/^S-\d{3}$/)
  })

  it('у каждого источника заполнены название, автор, год и оценка', () => {
    for (const s of sources) {
      expect(s.title.length).toBeGreaterThan(3)
      expect(s.author.length).toBeGreaterThan(2)
      // «—» означает, что год издания не подтверждён по источнику
      expect(s.year).toMatch(/^(\d{4}|—)$/)
      expect(s.score).toMatch(/^\d{1,2}\/14$/)
    }
  })

  it('источник с неподтверждённым годом остаётся на проверке', () => {
    for (const s of sources) {
      if (s.year === '—') expect(s.status).toBe('на проверке')
    }
  })

  it('есть и проверенные источники, и источники на проверке, и у всех указан урок', () => {
    expect(sources.some((s) => s.status === 'проверено')).toBe(true)
    expect(sources.some((s) => s.status === 'на проверке')).toBe(true)
    for (const s of sources) {
      expect(sourceLessons(s).length).toBeGreaterThan(0)
    }
  })
})
