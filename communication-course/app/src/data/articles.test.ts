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

  it('рубрикатор тем загружен, у каждой статьи тема из рубрикатора', () => {
    expect(topics.length).toBeGreaterThanOrEqual(10)
    const known = new Set(topics.map((t) => t.id))
    for (const a of articles) expect(known.has(a.topic)).toBe(true)
    expect(topicTitle('T-01')).toContain('Психология')
  })
})
