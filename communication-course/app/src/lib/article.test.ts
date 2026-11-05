import { describe, expect, it } from 'vitest'
import { parseArticle, parseTopics } from './article'

const RAW = `---
id: A-009
title: Тестовая статья
topic: T-03
status: готово
sources: [S-001, S-002, S-013]
reading_time: 7 мин
created: 2026-11-05
updated: 2026-11-06
---

# Тестовая статья

## Вопрос

Текст вопроса.

## Короткий ответ

Короткий ответ здесь.
`

const TOPICS = `# Рубрикатор тем

Вступление, которое не должно попасть в темы.

## T-01. Психология общения и тревога

Что происходит с человеком до и во время разговора.

**Статус:** 12 источников.

## T-02. Разговор: начало, поддержание, выход

Small talk и открытые вопросы.
`

describe('parseArticle', () => {
  it('разбирает YAML-шапку', () => {
    const a = parseArticle(RAW, 'A-009-test.md')

    expect(a.id).toBe('A-009')
    expect(a.title).toBe('Тестовая статья')
    expect(a.topic).toBe('T-03')
    expect(a.status).toBe('готово')
    expect(a.sources).toEqual(['S-001', 'S-002', 'S-013'])
    expect(a.readingTime).toBe('7 мин')
    expect(a.updated).toBe('2026-11-06')
  })

  it('убирает из тела заголовок H1, но сохраняет разделы', () => {
    const a = parseArticle(RAW, 'A-009-test.md')

    expect(a.body.startsWith('## Вопрос')).toBe(true)
    expect(a.body).toContain('Короткий ответ здесь.')
    expect(a.body).not.toContain('# Тестовая статья')
  })

  it('не падает на статье без шапки', () => {
    const a = parseArticle('# Без шапки\n\nТекст.', 'A-010-bez.md')

    expect(a.title).toBe('Без шапки')
    expect(a.sources).toEqual([])
    expect(a.status).toBe('черновик')
  })
})

describe('parseTopics', () => {
  it('извлекает темы с описанием', () => {
    const topics = parseTopics(TOPICS)

    expect(topics).toHaveLength(2)
    expect(topics[0].id).toBe('T-01')
    expect(topics[0].title).toBe('Психология общения и тревога')
    expect(topics[0].summary).toContain('до и во время разговора')
    expect(topics[1].id).toBe('T-02')
  })
})
