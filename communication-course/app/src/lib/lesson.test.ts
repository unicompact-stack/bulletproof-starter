import { describe, expect, it } from 'vitest'
import { parseLesson } from './lesson'

const RAW = `# Урок 9. Тестовый урок

**Цель:** проверить парсер уроков.
**Время:** 10–20 минут.
**Понадобится:** ничего.

---

## Теория

Текст теории.

## Упражнение 1. Делай

Инструкция к упражнению.

## Самопроверка

- [ ] Первый пункт
- [ ] Второй пункт

## Поле для ответа

Напиши сюда вывод.
`

describe('parseLesson', () => {
  it('извлекает заголовок, цель, время, тело, чек-лист и подсказку', () => {
    const lesson = parseLesson(RAW, 9)

    expect(lesson.id).toBe(9)
    expect(lesson.title).toBe('Урок 9. Тестовый урок')
    expect(lesson.goal).toBe('проверить парсер уроков.')
    expect(lesson.time).toBe('10–20 минут.')
    expect(lesson.body).toContain('Текст теории.')
    expect(lesson.body).toContain('Упражнение 1')
    expect(lesson.selfCheck).toEqual(['Первый пункт', 'Второй пункт'])
    expect(lesson.answerPrompt).toBe('Напиши сюда вывод.')
  })

  it('не включает в тело секции самопроверки и ответа', () => {
    const lesson = parseLesson(RAW, 9)

    expect(lesson.body).not.toContain('Самопроверка')
    expect(lesson.body).not.toContain('Поле для ответа')
    expect(lesson.body).not.toContain('Первый пункт')
  })

  it('не падает на уроке без секций', () => {
    const lesson = parseLesson('# Урок 1. Пустой\n\nТолько текст.', 1)

    expect(lesson.title).toBe('Урок 1. Пустой')
    expect(lesson.selfCheck).toEqual([])
    expect(lesson.answerPrompt).toBe('')
    expect(lesson.goal).toBe('')
  })
})
