/**
 * index.js — сервер FSM PRO: REST API + раздача страниц админки и мастера.
 *
 * Порт 8000, слушает 0.0.0.0 (доступен извне песочницы).
 * Все SQL-запросы параметризованы — конкатенация пользовательского ввода запрещена.
 */

const path = require('path');
const express = require('express');
const { getDb } = require('./db');
const { canTransition, actionLabel, isOverdue, STATUSES, LABELS } = require('./statusMachine');
const { seed } = require('./seed');

const PORT = process.env.PORT || 8000;

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS: нужен, чтобы существующее React-приложение (порт 5173) могло дергать API.
// В этой итерации оно не интегрировано, но шлюз открыт осознанно.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const db = getDb();
seed();

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/* ---------------- Форматирование ---------------- */

function taskRow(row) {
  const assignee = row.assigned_to
    ? db.prepare('SELECT id, full_name, phone FROM users WHERE id = ?').get(row.assigned_to)
    : null;
  return {
    ...row,
    assignee,
    isOverdue: isOverdue(row),
    statusLabel: LABELS[row.status],
  };
}

/* ---------------- Служебные ---------------- */

app.get('/api/health', (req, res) => {
  try {
    const tasks = db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n;
    res.json({ status: 'ok', db: 'up', tasks, statuses: STATUSES });
  } catch (e) {
    res.status(500).json({ status: 'error', db: 'down', error: e.message });
  }
});

app.get('/api/meta', (req, res) => {
  res.json({ statuses: STATUSES, labels: LABELS });
});

/* ---------------- Авторизация (демо-уровень) ---------------- */

app.post('/api/auth/login', (req, res) => {
  const code = String(req.body?.code ?? '').trim();
  if (!code) return res.status(400).json({ error: 'Код не передан.' });

  const user = db.prepare('SELECT * FROM users WHERE code = ?').get(code);
  if (!user) return res.status(401).json({ error: 'Код не найден.' });
  if (user.blocked) return res.status(403).json({ error: 'Доступ закрыт.' });

  res.json({
    id: user.id,
    fullName: user.full_name,
    role: user.role,
    teamId: user.team_id,
  });
});

/* ---------------- Задачи ---------------- */

app.get('/api/tasks', (req, res) => {
  const { status, assignee, overdue } = req.query;

  let sql = 'SELECT * FROM tasks';
  const where = [];
  const params = [];

  // ВАЖНО: значения всегда через плейсхолдеры, никогда через конкатенацию.
  if (status) { where.push('status = ?'); params.push(String(status)); }
  if (assignee) { where.push('assigned_to = ?'); params.push(String(assignee)); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY due_at IS NULL, due_at ASC';

  let rows = db.prepare(sql).all(...params).map(taskRow);

  if (overdue === 'true') rows = rows.filter((t) => t.isOverdue);

  res.json(rows);
});

app.get('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена.' });

  const history = db.prepare(`
    SELECT h.*, u.full_name AS actor_name
    FROM task_status_history h
    LEFT JOIN users u ON u.id = h.actor_id
    WHERE h.task_id = ?
    ORDER BY h.created_at ASC, h.rowid ASC
  `).all(task.id).map((h) => ({ ...h, actionLabel: actionLabel(h.from_status, h.to_status) }));

  const comments = db.prepare(`
    SELECT c.*, u.full_name AS author_name
    FROM comments c
    LEFT JOIN users u ON u.id = c.author_id
    WHERE c.task_id = ?
    ORDER BY c.created_at ASC, c.rowid ASC
  `).all(task.id);

  res.json({ ...taskRow(task), history, comments });
});

app.post('/api/tasks', (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Не указано название задачи.' });

  const id = uid('task');
  // Статус выводится из наличия исполнителя: есть исполнитель → «Назначена», нет → «Новая».
  // Раньше статус не передавался вовсе и вставка падала на NOT NULL.
  const initialStatus = b.assigned_to ? 'assigned' : 'new';

  db.prepare(`
    INSERT INTO tasks (id, title, description, address, customer_name, customer_phone,
                       status, assigned_to, created_by, due_at, lat, lng)
    VALUES (@id, @title, @description, @address, @customer_name, @customer_phone,
            @status, @assigned_to, @created_by, @due_at, @lat, @lng)
  `).run({
    id,
    status: initialStatus,
    title: String(b.title),
    description: b.description ?? null,
    address: b.address ?? null,
    customer_name: b.customer_name ?? null,
    customer_phone: b.customer_phone ?? null,
    assigned_to: b.assigned_to ?? null,
    created_by: b.created_by ?? 'u-mgr',
    due_at: b.due_at ?? null,
    lat: b.lat ?? null,
    lng: b.lng ?? null,
  });

  db.prepare(`
    INSERT INTO task_status_history (id, task_id, from_status, to_status, actor_id, comment)
    VALUES (?, ?, NULL, ?, ?, ?)
  `).run(uid('h'), id, initialStatus, b.created_by ?? 'u-mgr', 'Заявка создана');

  res.status(201).json(taskRow(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)));
});

/**
 * Смена статуса. Единственное место, где статус меняется.
 *
 * Поле assigneeId необязательно: если передано, исполнитель назначается
 * в той же транзакции. Раньше клиент делал два запроса (status + assign),
 * и при падении второго задача оставалась «назначенной» без исполнителя.
 */
app.patch('/api/tasks/:id/status', (req, res) => {
  const { status, actorId, comment, assigneeId } = req.body || {};
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена.' });
  if (!status) return res.status(400).json({ error: 'Не указан новый статус.' });

  const check = canTransition(task.status, status);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const now = new Date().toISOString();
  const apply = db.transaction(() => {
    if (assigneeId !== undefined) {
      db.prepare('UPDATE tasks SET assigned_to = ?, updated_at = ? WHERE id = ?')
        .run(assigneeId || null, now, task.id);
    }
    db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, task.id);
    db.prepare(`
      INSERT INTO task_status_history (id, task_id, from_status, to_status, actor_id, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uid('h'), task.id, task.status, status, actorId ?? null, comment ?? actionLabel(task.status, status));
  });
  apply();

  res.json(taskRow(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)));
});

app.patch('/api/tasks/:id/assign', (req, res) => {
  const { assigneeId } = req.body || {};
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена.' });

  db.prepare('UPDATE tasks SET assigned_to = ?, updated_at = ? WHERE id = ?')
    .run(assigneeId ?? null, new Date().toISOString(), task.id);

  res.json(taskRow(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)));
});

/* ---------------- Пользователи ---------------- */

app.get('/api/users', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.full_name, u.phone, u.role, u.code, u.blocked, u.team_id, t.name AS team_name,
           (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id AND status != 'completed') AS active_tasks
    FROM users u
    LEFT JOIN teams t ON t.id = u.team_id
    ORDER BY u.role DESC, u.full_name ASC
  `).all();
  res.json(rows);
});

app.post('/api/users', (req, res) => {
  const b = req.body || {};
  if (!b.full_name) return res.status(400).json({ error: 'Не указано имя.' });
  if (!b.code) return res.status(400).json({ error: 'Не указан код доступа.' });

  const dup = db.prepare('SELECT id FROM users WHERE code = ?').get(String(b.code));
  if (dup) return res.status(409).json({ error: 'Такой код уже занят.' });

  const id = uid('u');
  db.prepare(`
    INSERT INTO users (id, full_name, phone, role, code, team_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, String(b.full_name), b.phone ?? null, b.role ?? 'technician', String(b.code), b.team_id ?? null);

  res.status(201).json(db.prepare('SELECT id, full_name, phone, role, code FROM users WHERE id = ?').get(id));
});

/* ---------------- Комментарии ---------------- */

app.get('/api/comments', (req, res) => {
  const { taskId } = req.query;
  const sql = taskId
    ? `SELECT c.*, u.full_name AS author_name FROM comments c
       LEFT JOIN users u ON u.id = c.author_id WHERE c.task_id = ?
       ORDER BY c.created_at ASC, c.rowid ASC`
    : `SELECT c.*, u.full_name AS author_name FROM comments c
       LEFT JOIN users u ON u.id = c.author_id
       ORDER BY c.created_at DESC, c.rowid DESC LIMIT 50`;
  const params = taskId ? [String(taskId)] : [];
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/comments', (req, res) => {
  const { taskId, authorId, body } = req.body || {};
  if (!taskId) return res.status(400).json({ error: 'Не указана задача.' });
  if (!body) return res.status(400).json({ error: 'Пустой комментарий.' });

  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(String(taskId));
  if (!task) return res.status(404).json({ error: 'Задача не найдена.' });

  const id = uid('c');
  db.prepare('INSERT INTO comments (id, task_id, author_id, body) VALUES (?, ?, ?, ?)')
    .run(id, String(taskId), authorId ?? null, String(body));

  res.status(201).json(
    db.prepare(`SELECT c.*, u.full_name AS author_name FROM comments c
                LEFT JOIN users u ON u.id = c.author_id WHERE c.id = ?`).get(id)
  );
});

/* ---------------- Статистика ---------------- */

app.get('/api/stats', (req, res) => {
  const row = (sql) => db.prepare(sql).get().n;

  const all = db.prepare('SELECT * FROM tasks').all().map(taskRow);

  res.json({
    total: all.length,
    byStatus: STATUSES.reduce((acc, s) => {
      acc[s] = all.filter((t) => t.status === s).length;
      return acc;
    }, {}),
    overdue: all.filter((t) => t.isOverdue).length,
    unassigned: all.filter((t) => !t.assigned_to).length,
    technicians: row("SELECT COUNT(*) AS n FROM users WHERE role = 'technician' AND blocked = 0"),
    completed: row("SELECT COUNT(*) AS n FROM tasks WHERE status = 'completed'"),
  });
});

/* ---------------- История ---------------- */

app.get('/api/status-history/:taskId', (req, res) => {
  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Задача не найдена.' });

  res.json(db.prepare(`
    SELECT h.*, u.full_name AS actor_name
    FROM task_status_history h
    LEFT JOIN users u ON u.id = h.actor_id
    WHERE h.task_id = ?
    ORDER BY h.created_at ASC, h.rowid ASC
  `).all(task.id).map((h) => ({ ...h, actionLabel: actionLabel(h.from_status, h.to_status) })));
});

/* ---------------- Страницы ---------------- */

// Без extensions: ['html'] запрос /admin не находит admin.html и уходит в 404.
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get('/', (req, res) => res.redirect('/admin'));

app.use((req, res) => res.status(404).json({ error: 'Метод не найден.' }));

// Обработчик ошибок: API обязан отвечать JSON, а не HTML-страницей фреймворка.
// Без него необработанное исключение возвращает HTML, и клиент не может
// показать внятное сообщение пользователю.
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера.', detail: err.message });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FSM PRO сервер запущен: http://0.0.0.0:${PORT}`);
    console.log(`  админка:  /admin`);
    console.log(`  мастер:   /worker`);
    console.log(`  API:      /api/health`);
  });
}

module.exports = app;
