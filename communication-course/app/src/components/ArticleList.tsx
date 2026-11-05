import { useMemo, useState } from 'react'
import { articles, topicTitle, topics } from '../data/articles'

type Props = {
  onOpen: (id: string) => void
}

export function ArticleList({ onOpen }: Props) {
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState('все')

  // Темы, по которым статьи уже написаны
  const usedTopics = useMemo(() => {
    const ids = new Set(articles.map((a) => a.topic))
    return topics.filter((t) => ids.has(t.id))
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return articles.filter((a) => {
      const matchesQuery =
        q.length === 0 ||
        a.title.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q)
      const matchesTopic = topic === 'все' || a.topic === topic
      return matchesQuery && matchesTopic
    })
  }, [query, topic])

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Читальня
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Статьи по теме, собранные из нескольких источников. Каждая отвечает на
        один вопрос и показывает, где авторы спорят друг с другом.
      </p>
      <p className="mt-2 text-sm text-muted">
        Статей: {articles.length} · тем раскрыто: {usedTopics.length} из {topics.length}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по статьям"
          aria-label="Поиск по статьям"
          className="w-full rounded-lg border border-line bg-card px-4 py-2 text-ink outline-none transition focus:border-accent"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтр по теме">
          <button
            type="button"
            onClick={() => setTopic('все')}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              topic === 'все'
                ? 'border-accent bg-accent text-white'
                : 'border-line bg-card text-muted hover:border-accent hover:text-accent'
            }`}
          >
            Все темы
          </button>
          {usedTopics.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTopic(t.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                topic === t.id
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-card text-muted hover:border-accent hover:text-accent'
              }`}
            >
              {t.title}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-6 flex flex-col gap-3">
        {visible.map((article) => (
          <li key={article.id}>
            <button
              type="button"
              onClick={() => onOpen(article.id)}
              className="w-full rounded-xl border border-line bg-card p-5 text-left transition hover:border-accent"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="rounded-full bg-paper px-2 py-0.5">
                  {topicTitle(article.topic)}
                </span>
                <span>{article.readingTime}</span>
                <span>· источников: {article.sources.length}</span>
                {article.status !== 'готово' && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">
                    {article.status}
                  </span>
                )}
              </div>
              <h2 className="mt-2 text-lg font-medium text-ink">{article.title}</h2>
              <p className="mt-1 text-sm text-muted">Читать →</p>
            </button>
          </li>
        ))}
      </ul>

      {visible.length === 0 && (
        <p className="mt-6 rounded-xl border border-line bg-card p-5 text-muted">
          Ничего не найдено. Попробуй другой запрос или сними фильтр по теме.
        </p>
      )}

      <footer className="mt-10 border-t border-line pt-6 text-sm text-muted">
        <p>
          Статьи пишутся по мере того, как набираются источники: минимум три на
          статью. Темы без статей ждут своей очереди — список в разделе
          «Библиотека».
        </p>
      </footer>
    </div>
  )
}
