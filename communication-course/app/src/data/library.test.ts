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

  // Дважды заводили одну и ту же книгу под разными ID (S-035/S-085,
  // S-028/S-072). Глазами это не ловится — пусть ловит тест.
  it('нет двух источников с одинаковым автором и названием', () => {
    const seen = new Map<string, string>()
    const key = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    for (const s of sources) {
      const k = `${key(s.author)} :: ${key(s.title)}`
      const prev = seen.get(k)
      expect(prev, `${s.id} повторяет ${prev}: «${s.title}» — ${s.author}`).toBeUndefined()
      seen.set(k, s.id)
    }
  })

  it('нет двух источников с одинаковой ссылкой', () => {
    const seen = new Map<string, string>()
    for (const s of sources) {
      const url = (s.url.match(/\((https?:[^)]+)\)/) ?? [])[1] ?? s.url
      // «—» и ссылки на каталоги-агрегаторы могут повторяться законно
      if (!url || !/doi\.org|gutenberg|pubmed|ncbi/.test(url)) continue
      const prev = seen.get(url)
      expect(prev, `${s.id} повторяет ${prev}: одна и та же ссылка ${url}`).toBeUndefined()
      seen.set(url, s.id)
    }
  })
})
