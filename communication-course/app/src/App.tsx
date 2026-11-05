import { useEffect, useState } from 'react'
import { LessonList } from './components/LessonList'
import { LessonView } from './components/LessonView'
import { LibraryView } from './components/LibraryView'
import { lessons } from './data/lessons'
import { emptyProgress, loadProgress, saveProgress } from './lib/progress'
import type { LessonProgress, ProgressMap } from './types'

type View = 'lessons' | 'library'

export default function App() {
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [progress, setProgress] = useState<ProgressMap>({})
  const [hydrated, setHydrated] = useState(false)
  const [view, setView] = useState<View>('lessons')

  useEffect(() => {
    setProgress(loadProgress())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveProgress(progress)
  }, [progress, hydrated])

  const current = lessons.find((l) => l.id === currentId) ?? null

  const openLesson = (id: number) => {
    setCurrentId(id)
    setView('lessons')
    window.scrollTo({ top: 0 })
  }

  const back = () => {
    setCurrentId(null)
    setView('lessons')
    window.scrollTo({ top: 0 })
  }

  const openLibrary = () => {
    setView('library')
    window.scrollTo({ top: 0 })
  }

  const next = () => {
    if (currentId === null) return
    const nextId = Math.min(currentId + 1, lessons.length)
    openLesson(nextId)
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

  if (view === 'library') {
    return (
      <main className="min-h-screen">
        <LibraryView onBack={back} />
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      {current ? (
        <LessonView
          lesson={current}
          total={lessons.length}
          progress={progress[current.id] ?? emptyProgress(current)}
          onChange={(value) => updateProgress(current.id, value)}
          onBack={back}
          onNext={next}
        />
      ) : (
        <LessonList
          lessons={lessons}
          progress={progress}
          onOpen={openLesson}
          onOpenLibrary={openLibrary}
          onReset={reset}
        />
      )}
    </main>
  )
}
