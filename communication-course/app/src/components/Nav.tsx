export type View = 'lessons' | 'articles' | 'library'

const TABS: { id: View; label: string; hint: string }[] = [
  { id: 'articles', label: 'Читальня', hint: 'статьи для чтения' },
  { id: 'lessons', label: 'Уроки', hint: 'курс с упражнениями' },
  { id: 'library', label: 'Библиотека', hint: 'реестр источников' },
]

type Props = {
  view: View
  onChange: (view: View) => void
}

export function Nav({ view, onChange }: Props) {
  return (
    <nav className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 px-5 py-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={view === tab.id ? 'page' : undefined}
            title={tab.hint}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              view === tab.id
                ? 'bg-ink text-white'
                : 'text-muted hover:bg-card hover:text-accent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
