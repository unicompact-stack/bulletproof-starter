import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const CONTENT_DIR = resolve(here, '../content')
const LIBRARY_FILE = resolve(here, '../library/sources.md')
const TOPICS_FILE = resolve(here, '../library/TOPICS.md')
const ARTICLES_DIR = resolve(here, '../library/articles')

const LESSON_PREFIX = 'virtual:content/'
const LIBRARY_ID = 'virtual:library/sources'
const TOPICS_ID = 'virtual:library/topics'
const ARTICLES_ID = 'virtual:library/articles'
const LESSON_NAME = /^lesson-\d{2}\.md$/
const ARTICLE_NAME = /^A-\d{3}-[a-z0-9-]+\.md$/

/**
 * Отдаёт markdown-контент курса как виртуальные модули.
 * Канонические файлы живут в ../content и ../library — приложение их не дублирует.
 */
export function contentPlugin(): Plugin {
  return {
    name: 'course-content',

    resolveId(id) {
      if (id === LIBRARY_ID) return '\0' + LIBRARY_ID
      if (id === TOPICS_ID) return '\0' + TOPICS_ID
      if (id === ARTICLES_ID) return '\0' + ARTICLES_ID
      if (id.startsWith(LESSON_PREFIX)) {
        const name = id.slice(LESSON_PREFIX.length)
        if (!LESSON_NAME.test(name)) {
          throw new Error(`Недопустимое имя урока: ${name}`)
        }
        return '\0' + id
      }
      return null
    },

    load(id) {
      if (id === '\0' + LIBRARY_ID) {
        const raw = readFileSync(LIBRARY_FILE, 'utf-8')
        return `export default ${JSON.stringify(raw)}`
      }
      if (id === '\0' + TOPICS_ID) {
        const raw = readFileSync(TOPICS_FILE, 'utf-8')
        return `export default ${JSON.stringify(raw)}`
      }
      if (id === '\0' + ARTICLES_ID) {
        const files = readdirSync(ARTICLES_DIR)
          .filter((f) => ARTICLE_NAME.test(f))
          .sort()
        const payload = files.map((file) => ({
          file,
          raw: readFileSync(resolve(ARTICLES_DIR, file), 'utf-8'),
        }))
        return `export default ${JSON.stringify(payload)}`
      }
      if (id.startsWith('\0' + LESSON_PREFIX)) {
        const name = id.slice(('\0' + LESSON_PREFIX).length)
        if (!LESSON_NAME.test(name)) {
          throw new Error(`Недопустимое имя урока: ${name}`)
        }
        const raw = readFileSync(resolve(CONTENT_DIR, name), 'utf-8')
        return `export default ${JSON.stringify(raw)}`
      }
      return null
    },
  }
}

export default contentPlugin
