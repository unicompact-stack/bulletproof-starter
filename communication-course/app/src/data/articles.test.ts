import { describe, expect, it } from 'vitest'
import { articles, topics, topicTitle } from './articles'
import { sources } from './library'

describe('articles', () => {
  it('статьи загружены и разобраны', () => {
    expect(articles.length).toBeGreaterThanOrEqual(3)
    for (const a of articles) {
      expect(a.id).toMatch(/^A-\d{3}$/)
      expect(a.title.length).toBeGreaterThan(5)
      expect(a.body.length).toBeGreaterThan(1000)
      expect(a.topic).toMatch(/^T-\d{2}$/)
    }
  })

  it('каждая статья опирается минимум на три источника из реестра', () => {
    const known = new Set(sources.map((s) => s.id))
    for (const a of articles) {
      expect(a.sources.length).toBeGreaterThanOrEqual(3)
      for (const id of a.sources) expect(known.has(id)).toBe(true)
    }
  })

  it('в каждой статье есть раздел про противоречия и пробелы', () => {
    for (const a of articles) {
      expect(a.body).toContain('Противоречия и пробелы')
    }
  })

  it('любой источник, упомянутый в тексте, объявлен в шапке статьи', () => {
    // ловит рассинхрон: сослались в тексте, а в шапку добавить забыли
    for (const a of articles) {
      const declared = new Set(a.sources)
      const mentioned = new Set(a.body.match(/S-\d{3}/g) ?? [])
      const undeclared = [...mentioned].filter((id) => !declared.has(id))
      expect(undeclared, `${a.id}: в тексте есть, в шапке нет`).toEqual([])
    }
  })

  it('время чтения соответствует объёму статьи', () => {
    // 140 слов в минуту; допуск ±2 минуты, чтобы не ломаться на мелких правках
    for (const a of articles) {
      const words = a.body.replace(/```[\s\S]*?```/g, '').split(/\s+/).filter(Boolean).length
      const expected = Math.max(2, Math.round(words / 140))
      const stated = Number.parseInt(a.readingTime, 10)
      expect(Number.isNaN(stated), `${a.id}: время чтения не распознано`).toBe(false)
      expect(Math.abs(stated - expected), `${a.id}: заявлено ${stated}, расчёт ${expected}`).toBeLessThanOrEqual(2)
    }
  })

  it('рубрикатор тем загружен, у каждой статьи тема из рубрикатора', () => {
    expect(topics.length).toBeGreaterThanOrEqual(10)
    const known = new Set(topics.map((t) => t.id))
    for (const a of articles) expect(known.has(a.topic)).toBe(true)
    expect(topicTitle('T-01')).toContain('Психология')
  })
})
