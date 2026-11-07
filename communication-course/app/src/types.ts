export type Lesson = {
  id: number
  title: string
  goal: string
  time: string
  body: string
  selfCheck: string[]
  answerPrompt: string
}

export type LessonProgress = {
  answer: string
  checks: boolean[]
  updatedAt: string
}

export type ProgressMap = Record<number, LessonProgress>

export type Article = {
  id: string
  file: string
  title: string
  topic: string
  status: string
  sources: string[]
  readingTime: string
  created: string
  updated: string
  body: string
}

export type Topic = {
  id: string
  title: string
  summary: string
}

export type Source = {
  id: string
  title: string
  author: string
  year: string
  type: string
  url: string
  access: string
  score: string
  status: string
  lessons: string
}

export const STORAGE_KEY = 'dusha-kompanii:progress:v1'
