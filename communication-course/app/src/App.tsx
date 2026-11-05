import { useEffect, useState } from 'react'
import { ArticleList } from './components/ArticleList'
import { ArticleView } from './components/ArticleView'
import { LessonList } from './components/LessonList'
import { LessonView } from './components/LessonView'
import { LibraryView } from './components/LibraryView'
import { Nav } from './components/Nav'
import type { View } from './components/Nav'
import { articles } from './data/articles'
import { lessons } from './data/lessons'
import { emptyProgress, loadProgress, saveProgress } from './lib/progress'
import type { LessonProgress, ProgressMap } from './types'

export default function App() {
  const [view, setView] = useState<View>('articles')
  const [currentLessonId, setCurrentLessonId] = useState<number | null>(null)
  const [currentArticleId, setCurrentArticleId] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressMap>({})
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setProgress(loadProgress())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveProgress(progress)
  }, [progress, hydrated])

  const currentLesson = lessons.find((l) => l.id === currentLessonId) ?? null
  const currentArticle = articles.find((a) => a.id === currentArticleId) ?? null

  const toTop = () => window.scrollTo({ top: 0 })

  const changeView = (next: View) => {
    setView(next)
    setCurrentLessonId(null)
    setCurrentArticleId(null)
    toTop()
  }

  const openLesson = (id: number) => {
    setCurrentLessonId(id)
    toTop()
  }

  const openArticle = (id: string) => {
    setCurrentArticleId(id)
    toTop()
  }

  const backToList = () => {
    setCurrentLessonId(null)
    setCurrentArticleId(null)
    toTop()
  }

  const nextLesson = () => {
    if (currentLessonId === null) return
    openLesson(Math.min(currentLessonId + 1, lessons.length))
  }

  const updateProgress = (id: number, value: LessonProgress) => {
    setProgress((prev) => ({
      ...prev,
      [id]: { ...value, updatedAt: new Date().toISOString() },
    }))
  }

  const reset = () => {
    const ok =
      typeof window === 'undefined' ||
      window.confirm('Удалить все ответы и отметки? Это нельзя отменить.')
    if (ok) setProgress({})
  }

  if (!hydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        Загружаем курс…
      </main>
    )
  }

  if (currentArticle) {
    return (
      <main className="min-h-screen">
        <ArticleView article={currentArticle} onBack={backToList} />
      </main>
    )
  }

  if (currentLesson) {
    return (
      <main className="min-h-screen">
        <LessonView
          lesson={currentLesson}
          total={lessons.length}
          progress={progress[currentLesson.id] ?? emptyProgress(currentLesson)}
          onChange={(value) => updateProgress(currentLesson.id, value)}
          onBack={backToList}
          onNext={nextLesson}
        />
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <Nav view={view} onChange={changeView} />
      {view === 'articles' && <ArticleList onOpen={openArticle} />}
      {view === 'lessons' && (
        <LessonList
          lessons={lessons}
          progress={progress}
          onOpen={openLesson}
          onReset={reset}
        />
      )}
      {view === 'library' && <LibraryView />}
    </main>
  )
}
