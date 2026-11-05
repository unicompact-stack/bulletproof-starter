import lesson01 from 'virtual:content/lesson-01.md'
import lesson02 from 'virtual:content/lesson-02.md'
import lesson03 from 'virtual:content/lesson-03.md'
import lesson04 from 'virtual:content/lesson-04.md'
import lesson05 from 'virtual:content/lesson-05.md'
import lesson06 from 'virtual:content/lesson-06.md'
import { parseLesson } from '../lib/lesson'
import type { Lesson } from '../types'

const raw = [lesson01, lesson02, lesson03, lesson04, lesson05, lesson06]

export const lessons: Lesson[] = raw.map((text, i) => parseLesson(text, i + 1))
