import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { STORAGE_KEY } from './types'

/** Приложение открывается на читальне — для уроков переключаем вкладку. */
function openLessons() {
  fireEvent.click(screen.getByRole('button', { name: 'Уроки' }))
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // globals выключены, поэтому автоочистка DOM не срабатывает — делаем руками
  afterEach(() => {
    cleanup()
  })

  it('открывается на читальне и показывает статьи', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Читальня' })).toBeDefined()
    expect(screen.getByText(/Страх публичного выступления/)).toBeDefined()
    expect(screen.getByText(/Почему в разговоре пустеет голова/)).toBeDefined()
  })

  it('открывает статью для чтения', () => {
    render(<App />)

    fireEvent.click(screen.getByText(/Почему в разговоре пустеет голова/))

    expect(screen.getByText('← Все статьи')).toBeDefined()
    expect(screen.getByText(/Источников в основе: \d+/)).toBeDefined()
    expect(screen.getByText(/Блуждание мыслей — это режим по умолчанию/)).toBeDefined()
  })

  it('показывает список из 6 уроков и нулевой прогресс', () => {
    render(<App />)
    openLessons()

    expect(screen.getByText('Душа компании')).toBeDefined()
    expect(screen.getByText('Пройдено 0 из 6')).toBeDefined()
    expect(screen.getByText(/Урок 1\./)).toBeDefined()
    expect(screen.getByText(/Урок 6\./)).toBeDefined()
  })

  it('открывает урок, сохраняет ответ и отмечает его пройденным', () => {
    render(<App />)
    openLessons()

    fireEvent.click(screen.getAllByRole('button', { name: 'Открыть' })[0])
    expect(screen.getByText('Урок 1 из 6')).toBeDefined()

    const textarea = screen.getByLabelText('Ответ на упражнение')
    fireEvent.change(textarea, { target: { value: 'Мой разбор пузыря' } })

    for (const box of screen.getAllByRole('checkbox')) {
      fireEvent.click(box)
    }

    expect(screen.getByText('Урок пройден')).toBeDefined()

    fireEvent.click(screen.getByText('← Все уроки'))
    expect(screen.getByText('Пройдено 1 из 6')).toBeDefined()
  })

  it('сохраняет ответ в localStorage', () => {
    render(<App />)
    openLessons()

    fireEvent.click(screen.getAllByRole('button', { name: 'Открыть' })[0])
    fireEvent.change(screen.getByLabelText('Ответ на упражнение'), {
      target: { value: 'Сохрани меня' },
    })

    const stored = localStorage.getItem(STORAGE_KEY)
    expect(stored).toBeTruthy()
    expect(stored).toContain('Сохрани меня')
  })

  it('открывает библиотеку со списком источников', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Библиотека' }))

    expect(screen.getByText('Библиотека источников')).toBeDefined()
    expect(screen.getByText(/Всего \d+/)).toBeDefined()
    const list = screen.getAllByRole('list')[0]
    expect(within(list).getByText('S-001')).toBeDefined()
  })
})
