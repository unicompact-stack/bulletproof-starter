import { useEffect, useState } from 'react'

let counter = 0

/**
 * Рисует схему из блока ```mermaid.
 * Библиотека грузится лениво: в тестах и при ошибке показываем исходный текст.
 */
export function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${++counter}`

    import('mermaid')
      .then(async (module) => {
        const mermaid = module.default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          themeVariables: {
            primaryColor: '#ffffff',
            primaryTextColor: '#1c1b19',
            primaryBorderColor: '#e4e1d9',
            lineColor: '#6b675e',
            secondaryColor: '#f6f5f2',
            tertiaryColor: '#f6f5f2',
          },
        })
        const result = await mermaid.render(id, chart)
        if (!cancelled) setSvg(result.svg)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [chart])

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-xl border border-line bg-paper p-4 text-xs text-muted">
        {chart}
      </pre>
    )
  }

  if (!svg) {
    return (
      <div className="rounded-xl border border-line bg-paper p-6 text-center text-sm text-muted">
        Схема загружается…
      </div>
    )
  }

  return (
    <figure
      className="mermaid-figure overflow-x-auto rounded-xl border border-line bg-card p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
