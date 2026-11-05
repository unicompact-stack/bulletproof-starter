// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  completedCount,
  emptyProgress,
  isComplete,
  isStarted,
  loadProgress,
  saveProgress,
} from './progress'
import { STORAGE_KEY } from '../types'
import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 1,
  title: 'Урок 1. Тест',
  goal: 'цель',
  time: '10 минут',
  body: 'тело',
  selfCheck: ['раз', 'два'],
  answerPrompt: 'подсказка',
}

const other: Lesson = { ...lesson, id: 2, selfCheck: ['раз'] }

describe('progress', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('emptyProgress создаёт пустой прогресс по числу пунктов', () => {
    const p = emptyProgress(lesson)
    expect(p.answer).toBe('')
    expect(p.checks).toEqual([false, false])
    expect(p.updatedAt).toBe('')
  })

  it('isComplete: false без прогресса', () => {
    expect(isComplete(undefined, lesson)).toBe(false)
  })

  it('isComplete: false при пустом ответе', () => {
    expect(isComplete({ answer: '   ', checks: [true, true], updatedAt: '' }, lesson)).toBe(false)
  })

  it('isComplete: false если отмечены не все пункты', () => {
    expect(isComplete({ answer: 'текст', checks: [true, false], updatedAt: '' }, lesson)).toBe(false)
  })

  it('isComplete: true при ответе и всех отметках', () => {
    expect(isComplete({ answer: 'текст', checks: [true, true], updatedAt: '' }, lesson)).toBe(true)
  })

  it('isStarted: true если есть ответ или хотя бы одна отметка', () => {
    expect(isStarted(undefined)).toBe(false)
    expect(isStarted({ answer: '', checks: [false, false], updatedAt: '' })).toBe(false)
    expect(isStarted({ answer: 'а', checks: [false, false], updatedAt: '' })).toBe(true)
    expect(isStarted({ answer: '', checks: [true, false], updatedAt: '' })).toBe(true)
  })

  it('saveProgress и loadProgress сохраняют данные', () => {
    const data = { 1: { answer: 'мой ответ', checks: [true, false], updatedAt: '2026-11-05' } }
    saveProgress(data)
    expect(localStorage.getItem(STORAGE_KEY)).toContain('мой ответ')
    expect(loadProgress()).toEqual(data)
  })

  it('loadProgress возвращает пустой объект, если хранилище пустое', () => {
    expect(loadProgress()).toEqual({})
  })

  it('loadProgress не падает на битом JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{не json')
    expect(loadProgress()).toEqual({})
  })

  it('completedCount считает только полностью пройденные уроки', () => {
    const data = {
      1: { answer: 'есть', checks: [true, true], updatedAt: '' },
      2: { answer: 'есть', checks: [false], updatedAt: '' },
    }
    expect(completedCount(data, [lesson, other])).toBe(1)
  })
})
