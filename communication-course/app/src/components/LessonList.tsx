import { completedCount, isComplete, isStarted } from '../lib/progress'
import type { Lesson, ProgressMap } from '../types'

type Props = {
  lessons: Lesson[]
  progress: ProgressMap
  onOpen: (id: number) => void
  onOpenLibrary: () => void
  onReset: () => void
}

function statusLabel(done: boolean, started: boolean): string {
  if (done) return 'Пройден'
  if (started) return 'В процессе'
  return 'Не начат'
}

function actionLabel(done: boolean, started: boolean): string {
  if (done) return 'Повторить'
  if (started) return 'Продолжить'
  return 'Открыть'
}

export function LessonList({ lessons, progress, onOpen, onOpenLibrary, onReset }: Props) {
  const done = completedCount(progress, lessons)
  const percent = lessons.length > 0 ? Math.round((done / lessons.length) * 100) : 0

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Душа компании
          </h1>
          <p className="mt-2 max-w-xl text-muted">
            Личный курс общения: шесть уроков с практикой. Теория короткая,
            упражнения настоящие.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
        >
          Библиотека
        </button>
      </header>

      <section
        className="mb-8 rounded-xl border border-line bg-card p-5"
        aria-label="Прогресс курса"
      >
        <div className="flex items-baseline justify-between">
          <span className="font-medium text-ink">
            Пройдено {done} из {lessons.length}
          </span>
          <span className="text-sm text-muted">{percent}%</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-paper">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        {done === lessons.length && lessons.length > 0 && (
          <p className="mt-3 text-sm text-success">
            Курс пройден целиком. Можно вернуться к любому уроку и переписать ответ.
          </p>
        )}
      </section>

      <ol className="flex flex-col gap-3">
        {lessons.map((lesson) => {
          const p = progress[lesson.id]
          const complete = isComplete(p, lesson)
          const started = isStarted(p)
          return (
            <li key={lesson.id}>
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-card p-5 transition hover:border-accent/50">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    complete ? 'bg-success text-white' : 'bg-paper text-muted'
                  }`}
                  aria-hidden="true"
                >
                  {lesson.id}
                </span>
                <div className="min-w-[12rem] flex-1">
                  <h2 className="font-medium text-ink">{lesson.title}</h2>
                  <p className="mt-1 text-sm text-muted">{lesson.goal}</p>
                  <p className="mt-1 text-xs text-muted">
                    {statusLabel(complete, started)} · {lesson.time}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(lesson.id)}
                  className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-accent"
                >
                  {actionLabel(complete, started)}
                </button>
              </div>
            </li>
          )
        })}
      </ol>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-sm text-muted">
        <p>Ответы хранятся только в этом браузере и никуда не отправляются.</p>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-line px-3 py-1.5 transition hover:border-accent hover:text-accent"
        >
          Сбросить прогресс
        </button>
      </footer>
    </div>
  )
}
