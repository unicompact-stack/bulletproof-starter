import { STORAGE_KEY } from '../types'
import type { Lesson, LessonProgress, ProgressMap } from '../types'

export function emptyProgress(lesson: Lesson): LessonProgress {
  return {
    answer: '',
    checks: lesson.selfCheck.map(() => false),
    updatedAt: '',
  }
}

/** Урок пройден: есть непустой ответ и отмечены все пункты самопроверки. */
export function isComplete(progress: LessonProgress | undefined, lesson: Lesson): boolean {
  if (!progress) return false
  if (progress.answer.trim().length === 0) return false
  if (progress.checks.length !== lesson.selfCheck.length) return false
  return progress.checks.every(Boolean)
}

export function isStarted(progress: LessonProgress | undefined): boolean {
  if (!progress) return false
  return progress.answer.trim().length > 0 || progress.checks.some(Boolean)
}

export function loadProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as ProgressMap
  } catch {
    return {}
  }
}

export function saveProgress(progress: ProgressMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // приватный режим или переполненное хранилище — молча продолжаем
  }
}

export function completedCount(progress: ProgressMap, lessons: Lesson[]): number {
  return lessons.filter((lesson) => isComplete(progress[lesson.id], lesson)).length
}
