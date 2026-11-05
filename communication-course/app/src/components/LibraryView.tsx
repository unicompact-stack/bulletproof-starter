import { useMemo, useState } from 'react'
import { sources } from '../data/library'
import { sourceLessons } from '../lib/library'

type Props = { onBack: () => void }

const STATUSES = ['все', 'проверено', 'на проверке', 'отклонено']

export function LibraryView({ onBack }: Props) {
  const [query, setQuery] = useState('')
  const [lesson, setLesson] = useState(0)
  const [status, setStatus] = useState('все')

  const checked = sources.filter((s) => s.status === 'проверено').length
  const pending = sources.filter((s) => s.status === 'на проверке').length

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sources.filter((s) => {
      const matchesQuery =
        q.length === 0 ||
        s.title.toLowerCase().includes(q) ||
        s.author.toLowerCase().includes(q)
      const matchesLesson = lesson === 0 || sourceLessons(s).includes(lesson)
      const matchesStatus = status === 'все' || s.status === status
      return matchesQuery && matchesLesson && matchesStatus
    })
  }, [query, lesson, status])

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 text-sm text-muted transition hover:text-accent"
      >
        ← Все уроки
      </button>

      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Библиотека источников
      </h1>
      <p className="mt-2 text-muted">
        Всего {sources.length} · проверено {checked} · на проверке {pending}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию или автору"
          aria-label="Поиск по библиотеке"
          className="w-full rounded-lg border border-line bg-card px-4 py-2 text-ink outline-none transition focus:border-accent"
        />

        <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтр по уроку">
          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLesson(n)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                lesson === n
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-card text-muted hover:border-accent hover:text-accent'
              }`}
            >
              {n === 0 ? 'Все уроки' : `Урок ${n}`}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтр по статусу">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                status === s
                  ? 'border-ink bg-ink text-white'
                  : 'border-line bg-card text-muted hover:border-accent hover:text-accent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-6 text-sm text-muted">Показано: {visible.length}</p>

      <ul className="mt-3 flex flex-col gap-3">
        {visible.map((s) => (
          <li key={s.id}>
            <article className="rounded-xl border border-line bg-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-muted">{s.id}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    s.status === 'проверено'
                      ? 'bg-success/10 text-success'
                      : s.status === 'отклонено'
                        ? 'bg-accent/10 text-accent'
                        : 'bg-paper text-muted'
                  }`}
                >
                  {s.status} · {s.score}
                </span>
              </div>
              <h2 className="mt-1 font-medium text-ink">{s.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {s.author} · {s.year} · {s.type}
              </p>
              <p className="mt-2 text-xs text-muted">
                Уроки: {s.lessons} · доступ: {s.access}
              </p>
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm text-accent underline underline-offset-4"
                >
                  Открыть
                </a>
              )}
            </article>
          </li>
        ))}
      </ul>

      {visible.length === 0 && (
        <p className="mt-6 rounded-xl border border-line bg-card p-5 text-muted">
          Ничего не найдено. Попробуй изменить запрос или снять фильтры.
        </p>
      )}

      <footer className="mt-10 border-t border-line pt-6 text-sm text-muted">
        <p>
          Конспект каждого источника — в <code>library/notes/</code>, реестр —{' '}
          <code>library/sources.md</code>. Полные тексты не хранятся: только
          ссылки и выжимки.
        </p>
      </footer>
    </div>
  )
}
