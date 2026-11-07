import { describe, expect, it } from 'vitest'
import { lessons } from './lessons'

describe('lessons', () => {
  it('содержит 6 уроков по порядку', () => {
    expect(lessons).toHaveLength(6)
    expect(lessons.map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('каждый урок полностью разобран', () => {
    for (const lesson of lessons) {
      expect(lesson.title).toMatch(/^Урок \d/)
      expect(lesson.goal.length).toBeGreaterThan(10)
      expect(lesson.time.length).toBeGreaterThan(0)
      expect(lesson.body.length).toBeGreaterThan(500)
      expect(lesson.selfCheck.length).toBeGreaterThanOrEqual(3)
      expect(lesson.answerPrompt.length).toBeGreaterThan(10)
      expect(lesson.body).not.toContain('## Самопроверка')
    }
  })
})
