import { Markdown } from './Markdown'
import { topicTitle } from '../data/articles'
import type { Article } from '../types'

type Props = {
  article: Article
  onBack: () => void
}

export function ArticleView({ article, onBack }: Props) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 text-sm text-muted transition hover:text-accent"
      >
        ← Все статьи
      </button>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded-full bg-card px-2 py-0.5">{topicTitle(article.topic)}</span>
        <span>{article.readingTime}</span>
        <span>· обновлено {article.updated}</span>
      </div>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {article.title}
      </h1>

      <p className="mt-3 text-sm text-muted">
        Источников в основе: {article.sources.length} ({article.sources.join(', ')})
      </p>

      <article className="mt-8">
        <Markdown>{article.body}</Markdown>
      </article>

      <footer className="mt-10 border-t border-line pt-6 text-sm text-muted">
        <p>
          Статья живая: если найдётся источник, который спорит с выводами, текст
          дополняется, а правка записывается в историю внизу статьи.
        </p>
      </footer>
    </div>
  )
}
