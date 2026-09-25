/**
 * seed.js — наполнение базы демо-данными.
 *
 * Запуск:      npm run seed     (дозаполняет, если пусто)
 * Пересоздать: npm run reset    (полностью стирает и создаёт заново)
 */

const { getDb, DB_PATH } = require('./db');

const TEAMS = [
  { id: 'team-1', name: 'Бригада №1 — монтаж' },
  { id: 'team-2', name: 'Бригада №2 — сервис' },
];

const USERS = [
  { id: 'u-mgr',  full_name: 'Иванов Пётр',   phone: '+7 900 000-00-01', role: 'manager',    code: '9999', team_id: null },
  { id: 'u-tech1', full_name: 'Сидоров Алексей', phone: '+7 900 111-11-11', role: 'technician', code: '1111', team_id: 'team-1' },
  { id: 'u-tech2', full_name: 'Кузнецов Дмитрий', phone: '+7 900 222-22-22', role: 'technician', code: '2222', team_id: 'team-1' },
  { id: 'u-tech3', full_name: 'Морозова Ольга', phone: '+7 900 333-33-33', role: 'technician', code: '3333', team_id: 'team-2' },
];

const iso = (days, hours = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12 + hours, 0, 0, 0);
  return d.toISOString();
};

const TASKS = [
  {
    id: 'task-101', title: 'Замена оконного блока', address: 'г. Казань, ул. Баумана, 12',
    customer_name: 'ООО «Восток»', customer_phone: '+7 917 100-20-30',
    description: 'Замена двухкамерного стеклопакета, демонтаж старого блока, вывоз мусора.',
    status: 'in_progress', assigned_to: 'u-tech1', created_by: 'u-mgr',
    due_at: iso(0, 2), lat: 55.7887, lng: 49.1221,
  },
  {
    id: 'task-102', title: 'Ремонт кондиционера', address: 'г. Казань, ул. Пушкина, 45',
    customer_name: 'ИП Гареев', customer_phone: '+7 917 200-30-40',
    description: 'Не холодит внешний блок. Проверить фреон, при необходимости дозаправить.',
    status: 'under_review', assigned_to: 'u-tech1', created_by: 'u-mgr',
    due_at: iso(-1), lat: 55.7963, lng: 49.1088,
  },
  {
    id: 'task-103', title: 'Установка счётчика воды', address: 'г. Казань, пр. Победы, 8',
    customer_name: 'УК «Комфорт»', customer_phone: '+7 917 300-40-50',
    description: 'Установка и опломбировка двух счётчиков, передача показаний в УК.',
    status: 'assigned', assigned_to: 'u-tech2', created_by: 'u-mgr',
    due_at: iso(1), lat: 55.7520, lng: 49.1670,
  },
  {
    id: 'task-104', title: 'Чистка вентиляции', address: 'г. Казань, ул. Гагарина, 30',
    customer_name: 'Кафе «Тюбетей»', customer_phone: '+7 917 400-50-60',
    description: 'Прочистка вытяжки и воздуховодов, фото до и после.',
    status: 'new', assigned_to: null, created_by: 'u-mgr',
    due_at: iso(2), lat: 55.7450, lng: 49.2050,
  },
  {
    id: 'task-105', title: 'Замена розеточной группы', address: 'г. Казань, ул. Чистопольская, 5',
    customer_name: 'Ковалёва М.А.', customer_phone: '+7 917 500-60-70',
    description: 'Замена 4 розеток и автомата в щитке, проверка заземления.',
    status: 'completed', assigned_to: 'u-tech3', created_by: 'u-mgr',
    due_at: iso(-3), lat: 55.8160, lng: 49.1060,
  },
  {
    id: 'task-106', title: 'Диагностика котла', address: 'г. Казань, ул. Адоратского, 12',
    customer_name: 'Смирнов И.В.', customer_phone: '+7 917 600-70-80',
    description: 'Котёл уходит в ошибку E4. Проверить датчик тяги и дымоход.',
    status: 'new', assigned_to: null, created_by: 'u-mgr',
    due_at: iso(-2), lat: 55.8360, lng: 49.1560,
  },
  {
    id: 'task-107', title: 'Монтаж видеонаблюдения', address: 'г. Казань, ул. Королёва, 21',
    customer_name: 'ООО «Склад-Плюс»', customer_phone: '+7 917 700-80-90',
    description: 'Монтаж 4 камер, настройка регистратора, обучение охраны.',
    status: 'in_progress', assigned_to: 'u-tech3', created_by: 'u-mgr',
    due_at: iso(3), lat: 55.8280, lng: 49.2380,
  },
];

const HISTORY_SEED = [
  { task_id: 'task-101', from_status: null, to_status: 'new', actor_id: 'u-mgr', comment: 'Заявка создана' },
  { task_id: 'task-101', from_status: 'new', to_status: 'assigned', actor_id: 'u-mgr', comment: 'Назначен Сидоров А.' },
  { task_id: 'task-101', from_status: 'assigned', to_status: 'in_progress', actor_id: 'u-tech1', comment: 'Взято в работу' },
  { task_id: 'task-102', from_status: 'in_progress', to_status: 'under_review', actor_id: 'u-tech1', comment: 'Фреон дозаправлен' },
  { task_id: 'task-105', from_status: 'under_review', to_status: 'completed', actor_id: 'u-mgr', comment: 'Принято, акт подписан' },
];

const COMMENTS_SEED = [
  { task_id: 'task-101', author_id: 'u-tech1', body: 'Старый блок снят, проём подготовлен.' },
  { task_id: 'task-102', author_id: 'u-mgr', body: 'Жду фото до и после.' },
];

function reset() {
  const db = getDb();
  db.exec(`
    DELETE FROM task_status_history;
    DELETE FROM comments;
    DELETE FROM task_photos;
    DELETE FROM tasks;
    DELETE FROM users;
    DELETE FROM teams;
  `);
}

function seed() {
  const db = getDb();

  const insTeam = db.prepare('INSERT OR IGNORE INTO teams (id, name) VALUES (?, ?)');
  const insUser = db.prepare(
    'INSERT OR IGNORE INTO users (id, full_name, phone, role, code, team_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insTask = db.prepare(`
    INSERT OR IGNORE INTO tasks
      (id, title, description, address, customer_name, customer_phone,
       status, assigned_to, created_by, due_at, lat, lng)
    VALUES
      (@id, @title, @description, @address, @customer_name, @customer_phone,
       @status, @assigned_to, @created_by, @due_at, @lat, @lng)
  `);
  const insHist = db.prepare(`
    INSERT INTO task_status_history (id, task_id, from_status, to_status, actor_id, comment)
    VALUES (@id, @task_id, @from_status, @to_status, @actor_id, @comment)
  `);
  const insComment = db.prepare(`
    INSERT INTO comments (id, task_id, author_id, body) VALUES (@id, @task_id, @author_id, @body)
  `);

  const run = db.transaction(() => {
    for (const t of TEAMS) insTeam.run(t.id, t.name);
    for (const u of USERS) insUser.run(u.id, u.full_name, u.phone, u.role, u.code, u.team_id);
    for (const t of TASKS) insTask.run(t);

    const histCount = db.prepare('SELECT COUNT(*) AS n FROM task_status_history').get().n;
    if (histCount === 0) {
      HISTORY_SEED.forEach((h, i) =>
        insHist.run({ id: `h-seed-${i}`, ...h })
      );
    }
    const comCount = db.prepare('SELECT COUNT(*) AS n FROM comments').get().n;
    if (comCount === 0) {
      COMMENTS_SEED.forEach((c, i) =>
        insComment.run({ id: `c-seed-${i}`, ...c })
      );
    }
  });

  run();

  return {
    teams: db.prepare('SELECT COUNT(*) AS n FROM teams').get().n,
    users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    tasks: db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n,
    history: db.prepare('SELECT COUNT(*) AS n FROM task_status_history').get().n,
  };
}

if (require.main === module) {
  if (process.argv.includes('--reset')) {
    reset();
    console.log('База очищена.');
  }
  const counts = seed();
  console.log(`База готова: ${DB_PATH}`);
  console.log(`  бригад:   ${counts.teams}`);
  console.log(`  людей:    ${counts.users}`);
  console.log(`  задач:    ${counts.tasks}`);
  console.log(`  истории:  ${counts.history}`);
}

module.exports = { seed, reset };
