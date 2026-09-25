/**
 * statusMachine.js — правила переходов статусов.
 *
 * Это ядро продукта, вынесенное из React-компонентов на сервер.
 * Раньше эти правила жили в UI конкретного клиента; теперь они общие для всех,
 * и нарушить их нельзя ни из админки, ни из мобильной части.
 *
 * Инварианты (см. PRODUCT-CORE.md):
 *  - статусов ровно пять;
 *  - просрочка — это НЕ статус, а вычисляемое свойство;
 *  - возврат на доработку — это НЕ статус, а переход under_review → in_progress.
 */

const STATUSES = ['new', 'assigned', 'in_progress', 'under_review', 'completed'];

const LABELS = {
  new: 'Новая',
  assigned: 'Назначена',
  in_progress: 'В работе',
  under_review: 'На проверке',
  completed: 'Завершена',
};

/** Разрешённые переходы. Ключ — из какого статуса, значение — в какие можно. */
const TRANSITIONS = {
  new:          ['assigned'],
  assigned:     ['in_progress', 'new'],
  in_progress:  ['under_review'],
  under_review: ['completed', 'in_progress'],
  completed:    [],
};

/**
 * Проверить переход.
 * @returns {{ok: true} | {ok: false, error: string}}
 */
function canTransition(from, to) {
  if (!STATUSES.includes(to)) {
    return { ok: false, error: `Неизвестный статус: «${to}». Допустимые: ${STATUSES.join(', ')}.` };
  }
  if (from === to) {
    return { ok: false, error: `Задача уже в статусе «${LABELS[to]}».` };
  }
  const allowed = TRANSITIONS[from];
  if (!allowed) {
    return { ok: false, error: `Недопустимый исходный статус: «${from}».` };
  }
  if (!allowed.includes(to)) {
    const variants = allowed.length
      ? allowed.map((s) => `«${LABELS[s]}»`).join(' или ')
      : 'ничего — это конечный статус';
    return {
      ok: false,
      error: `Нельзя перевести из «${LABELS[from]}» в «${LABELS[to]}». Разрешено: ${variants}.`,
    };
  }
  return { ok: true };
}

/** Человекочитаемое название действия для кнопки и истории. */
function actionLabel(from, to) {
  if (to === 'in_progress' && from === 'under_review') return 'Возврат на доработку';
  if (to === 'completed') return 'Принято';
  if (to === 'under_review') return 'Отправлено на проверку';
  if (to === 'in_progress') return 'Взято в работу';
  if (to === 'assigned') return 'Назначено';
  return `Статус: ${LABELS[to]}`;
}

/**
 * Просрочена ли задача. Это НЕ статус — это вычисляемое свойство.
 * Завершённые задачи просроченными не считаются.
 */
function isOverdue(task, now = new Date()) {
  if (!task.due_at) return false;
  if (task.status === 'completed') return false;
  return new Date(task.due_at) < now;
}

module.exports = { STATUSES, LABELS, TRANSITIONS, canTransition, actionLabel, isOverdue };
