import { Markdown } from './Markdown'
import { isComplete } from '../lib/progress'
import type { Lesson, LessonProgress } from '../types'

type Props = {
  lesson: Lesson
  total: number
  progress: LessonProgress
  onChange: (next: LessonProgress) => void
  onBack: () => void
  onNext: () => void
}

export function LessonView({ lesson, total, progress, onChange, onBack, onNext }: Props) {
  const complete = isComplete(progress, lesson)
  const isLast = lesson.id >= total

  const toggle = (index: number) => {
    const checks = [...progress.checks]
    checks[index] = !checks[index]
    onChange({ ...progress, checks })
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 text-sm text-muted transition hover:text-accent"
      >
        ← Все уроки
      </button>

      <p className="text-sm text-muted">
        Урок {lesson.id} из {total}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {lesson.title}
      </h1>

      <dl className="mt-4 grid gap-2 rounded-xl border border-line bg-card p-5 text-sm">
        <div className="flex flex-wrap gap-2">
          <dt className="font-medium text-ink">Цель:</dt>
          <dd className="flex-1 text-muted">{lesson.goal}</dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="font-medium text-ink">Время:</dt>
          <dd className="flex-1 text-muted">{lesson.time}</dd>
        </div>
      </dl>

      <article className="mt-8">
        <Markdown>{lesson.body}</Markdown>
      </article>

      <section className="mt-10 rounded-xl border border-line bg-card p-5">
        <h2 className="text-lg font-semibold text-ink">Самопроверка</h2>
        <ul className="mt-4 flex flex-col gap-3">
          {lesson.selfCheck.map((item, i) => (
            <li key={item}>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={progress.checks[i] ?? false}
                  onChange={() => toggle(i)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-card p-5">
        <h2 className="text-lg font-semibold text-ink">Поле для ответа</h2>
        <p className="mt-2 text-sm text-muted">{lesson.answerPrompt}</p>
        <textarea
          value={progress.answer}
          onChange={(e) => onChange({ ...progress, answer: e.target.value })}
          placeholder="Пиши здесь. Сохраняется автоматически."
          aria-label="Ответ на упражнение"
          rows={10}
          className="mt-4 w-full resize-y rounded-lg border border-line bg-paper p-4 text-ink outline-none transition focus:border-accent"
        />
        <p className="mt-2 text-xs text-muted">
          {progress.answer.length} символов · сохраняется в этом браузере
        </p>
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <p className={`text-sm ${complete ? 'text-success' : 'text-muted'}`}>
          {complete
            ? 'Урок пройден'
            : 'Чтобы отметить урок пройденным: напиши ответ и закрой все пункты самопроверки'}
        </p>
        <button
          type="button"
          onClick={isLast ? onBack : onNext}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-accent"
        >
          {isLast ? 'На главную' : 'Следующий урок'}
        </button>
      </div>
    </div>
  )
}
