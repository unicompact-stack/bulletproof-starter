const { hashPassword, makeCode } = require('./store');

const MONTHS = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12
};

function defaultQuestions() {
  return [
    {
      q: 'Что чаще всего бросают молодым вместо риса?',
      options: ['Лепестки и конфетти', 'Монеты', 'Орехи', 'Рис всё ещё обязателен'],
      correct: 0,
      fact: 'Лепестки и конфетти почти вытеснили рис: их проще убрать, и на фото они выглядят праздничнее.'
    },
    {
      q: 'Как коротко называют распорядителя свадебного застолья?',
      options: ['Тамада', 'Сомелье', 'Режиссёр', 'Кейтеринг'],
      correct: 0,
      fact: 'Слово «тамада» пришло из грузинского застолья. Сейчас чаще говорят просто «ведущий».'
    },
    {
      q: 'Какой тост обычно звучит первым на русской свадьбе?',
      options: ['За родителей', 'За соседей по столу', 'За диджея', 'За официантов'],
      correct: 0,
      fact: 'Первый тост почти всегда за родителей: это и благодарность, и способ собрать зал.'
    },
    {
      q: 'Что такое выкуп невесты?',
      options: ['Игровые испытания для жениха', 'Отдельный счёт в ресторане', 'Налог на банкет', 'Вид букета'],
      correct: 0,
      fact: 'Выкуп — набор коротких испытаний. Смысл не в деньгах, а в том, чтобы гости включились ещё до зала.'
    },
    {
      q: 'Зачем паре оставляют «горку» из бокалов?',
      options: ['Чтобы вместе выпить шампанское', 'Чтобы хранить кольца', 'Чтобы считать гостей', 'Это подставка для торта'],
      correct: 0,
      fact: 'Башня из бокалов — красивый момент для фото и первый общий глоток уже в статусе супругов.'
    },
    {
      q: 'Какой танец обычно открывает танцпол?',
      options: ['Первый танец пары', 'Танец официантов', 'Хоровод родителей', 'Брейк-данс свидетелей'],
      correct: 0,
      fact: 'Первый танец — пауза только для двоих. После него ведущий уже поднимает весь зал.'
    },
    {
      q: 'Что гости чаще всего пишут в анкете до праздника?',
      options: ['Факт о себе и песню', 'Размер обуви', 'Любимый налог', 'PIN-код'],
      correct: 0,
      fact: 'Короткий факт и любимый трек — самый полезный материал: из него собираются угадайка и плейлист.'
    },
    {
      q: 'Почему на загородной площадке опасен только онлайн-сервис?',
      options: ['Wi-Fi может пропасть в середине конкурса', 'Проектор запрещён', 'Гости не берут телефоны', 'Шампанское глушит звук'],
      correct: 0,
      fact: 'Поэтому экранные конкурсы, таймер и тайминг должны переживать обрыв сети. Телефонам гостей сеть всё же нужна.'
    }
  ];
}

function parseContract(text) {
  const src = String(text || '');
  const result = { date: '', time: '', clientName: '', clientPhone: '', venue: '', fee: null, advance: null, notes: [] };

  const labeledDate = src.match(/дата[^0-9]{0,24}(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i);
  const wordDate = src.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/i);
  const anyDate = src.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (wordDate) {
    const month = MONTHS[wordDate[2].toLowerCase()];
    result.date = `${wordDate[3]}-${String(month).padStart(2, '0')}-${String(wordDate[1]).padStart(2, '0')}`;
  } else if (labeledDate || anyDate) {
    const m = labeledDate || anyDate;
    let year = m[3];
    if (year.length === 2) year = `20${year}`;
    result.date = `${year}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }

  const time = src.match(/(?:начало|время|в)\s*(\d{1,2})[:.](\d{2})/i) || src.match(/\b(\d{1,2}):(\d{2})\b/);
  if (time) result.time = `${String(time[1]).padStart(2, '0')}:${time[2]}`;

  const client = src.match(/(?:заказчик|клиент)\s*[:\-—]\s*([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-]+(?:\s+[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-]+){0,2})/i);
  if (client) result.clientName = client[1].trim();

  const phone = src.match(/(?:\+7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}/);
  if (phone) {
    const digits = phone[0].replace(/\D/g, '');
    const local = digits.slice(-10);
    result.clientPhone = `+7 ${local.slice(0, 3)} ${local.slice(3, 6)}-${local.slice(6, 8)}-${local.slice(8)}`;
  }

  const venue = src.match(/(?:площадка|ресторан|адрес|место)\s*[:—-]\s*([^\n]{3,90})/i);
  if (venue) result.venue = venue[1].replace(/\s+/g, ' ').trim();

  const fee = src.match(/гонорар[^0-9]{0,16}(\d[\d\s]{1,12})/i);
  const advance = src.match(/аванс[^0-9]{0,16}(\d[\d\s]{1,12})/i);
  if (fee) result.fee = Number(fee[1].replace(/\s/g, ''));
  if (advance) result.advance = Number(advance[1].replace(/\s/g, ''));

  if (!result.date) result.notes.push('Дату не нашли — впишите вручную.');
  if (!result.clientName) result.notes.push('Имя заказчика не распознано.');
  if (result.fee == null) result.notes.push('Гонорар не распознан.');
  return result;
}

function gid() {
  return Math.random().toString(16).slice(2, 10);
}

function createLive(event) {
  return {
    tool: 'splash',
    updatedAt: Date.now(),
    splash: {
      kicker: typeLabel(event.type),
      title: 'Добро пожаловать!',
      subtitle: '',
      mode: 'normal',
      template: 'gold',
      photos: [],
      video: ''
    },
    overlay: { type: '', id: 0, at: 0 },
    wheel: {
      names: (event.guests || []).map((g) => g.name).filter(Boolean),
      rotation: 0,
      spinId: 0,
      startedAt: 0,
      duration: 5400,
      winner: '',
      winnerIndex: -1
    },
    timer: {
      label: 'Конкурс',
      totalMs: 60000,
      remainingMs: 60000,
      running: false,
      endsAt: null
    },
    quiz: {
      index: 0,
      phase: 'idle',
      openedAt: null,
      questions: defaultQuestions(),
      answers: {},
      scored: {}
    },
    board: {
      announced: false,
      teams: (event.teams || []).map((t) => ({ ...t }))
    },
    timing: {
      current: 0,
      items: (event.timing || []).map((t) => ({ ...t }))
    },
    joined: []
  };
}

function typeLabel(type) {
  return {
    wedding: 'Свадьба',
    birthday: 'День рождения',
    anniversary: 'Юбилей',
    corporate: 'Корпоратив',
    prom: 'Выпускной',
    newyear: 'Новый год',
    kids: 'Детский праздник',
    quiz: 'Квиз'
  }[type] || 'Праздник';
}

function eventBase(partial) {
  return {
    id: gid() + gid(),
    code: partial.code,
    userId: partial.userId,
    title: partial.title,
    type: partial.type || 'wedding',
    date: partial.date,
    time: partial.time || '18:00',
    venue: partial.venue || '',
    address: partial.address || '',
    clientName: partial.clientName || '',
    clientPhone: partial.clientPhone || '',
    clientEmail: partial.clientEmail || '',
    fee: partial.fee || 0,
    advance: partial.advance || 0,
    status: partial.status || 'lead',
    notes: partial.notes || '',
    guests: partial.guests || [],
    teams: partial.teams || [],
    timing: partial.timing || [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function seedIfEmpty(store) {
  if (store.db.users.length) return;
  const user = {
    id: 'user-demo',
    name: 'Алина Демо',
    email: 'demo@pultevent.local',
    phone: '+7 921 000-00-00',
    country: 'Россия',
    passwordHash: hashPassword('demo1234'),
    plan: 'demo',
    accessUntil: null,
    trialEndsAt: Date.now() + 72 * 60 * 60 * 1000,
    createdAt: Date.now()
  };
  store.db.users.push(user);

  const guests = ['Анна', 'Марк', 'Ольга', 'Сергей', 'Марина', 'Игорь', 'Елена', 'Павел', 'Ксения', 'Дмитрий', 'Наталья', 'Артём']
    .map((name) => ({ id: gid(), name, note: '' }));
  const teams = [
    { id: 'team-bride', name: 'Сторона невесты', score: 0, color: '#ff5d78' },
    { id: 'team-groom', name: 'Сторона жениха', score: 0, color: '#7eb6ff' }
  ];
  const timing = [
    ['16:00', 'Сбор гостей', 'Фойе, лёгкая музыка'],
    ['16:30', 'Церемония', 'Выход пары, клятвы'],
    ['17:15', 'Фуршет', 'Фото и знакомство столов'],
    ['18:00', 'Банкет', 'Тост родителей'],
    ['18:40', 'Первый танец', 'Свет приглушить'],
    ['19:10', 'Колесо гостей', 'Три победителя'],
    ['19:40', 'Квиз о паре', 'Телефоны по QR'],
    ['20:30', 'Торт', 'Вынос и разрез'],
    ['21:00', 'Танцы', 'DJ-блок'],
    ['23:00', 'Финал', 'Титры и провожание']
  ].map(([time, title, note]) => ({ id: gid(), time, title, note }));

  const wedding = eventBase({
    userId: user.id,
    code: 'DEMO24',
    title: 'Свадьба Анны и Марка',
    type: 'wedding',
    date: '2026-10-11',
    time: '16:00',
    venue: 'Ресторан «Берёзка»',
    address: 'ул. Садовая, 12',
    clientName: 'Анна Соколова',
    clientPhone: '+7 921 555-10-20',
    clientEmail: 'anna@example.com',
    fee: 80000,
    advance: 30000,
    status: 'advance',
    notes: 'Любят живой зал и не любят долгие тосты. Колесо — после первого танца.',
    guests,
    teams,
    timing
  });

  const corporate = eventBase({
    userId: user.id,
    code: makeCode(store),
    title: 'Корпоратив «Север»',
    type: 'corporate',
    date: '2026-10-18',
    time: '18:30',
    venue: 'Лофт «Порт»',
    address: 'наб. Адмиралтейская, 4',
    clientName: 'Игорь Лебедев',
    clientPhone: '+7 812 300-11-22',
    fee: 120000,
    advance: 0,
    status: 'lead',
    notes: 'Ждут квиз отделов. Договор ещё не подписан.',
    guests: ['Игорь', 'Мария', 'Олег', 'Света'].map((name) => ({ id: gid(), name, note: '' })),
    teams: [
      { id: gid(), name: 'Отдел продаж', score: 0, color: '#e4c07a' },
      { id: gid(), name: 'Разработка', score: 0, color: '#3ddeb4' }
    ],
    timing: [
      { id: gid(), time: '18:30', title: 'Сбор', note: '' },
      { id: gid(), time: '19:00', title: 'Приветствие', note: '' },
      { id: gid(), time: '19:30', title: 'Квиз', note: '' },
      { id: gid(), time: '21:00', title: 'Дискотека', note: '' }
    ]
  });

  const birthday = eventBase({
    userId: user.id,
    code: makeCode(store),
    title: 'Юбилей Елены, 50',
    type: 'anniversary',
    date: '2026-09-20',
    time: '17:00',
    venue: 'Банкетный зал «Нева»',
    clientName: 'Елена Орлова',
    clientPhone: '+7 911 222-33-44',
    fee: 45000,
    advance: 45000,
    status: 'done',
    guests: ['Елена', 'Павел', 'Ника'].map((name) => ({ id: gid(), name, note: '' })),
    teams: [{ id: gid(), name: 'Гости', score: 0, color: '#e4c07a' }],
    timing: [{ id: gid(), time: '17:00', title: 'Встреча', note: '' }]
  });

  const next = eventBase({
    userId: user.id,
    code: makeCode(store),
    title: 'День рождения Артёма',
    type: 'birthday',
    date: '2026-11-02',
    time: '19:00',
    venue: 'Дом на Крестовском',
    clientName: 'Марина Волкова',
    clientPhone: '+7 921 777-45-45',
    fee: 60000,
    advance: 20000,
    status: 'confirmed',
    guests: ['Артём', 'Марина', 'Кирилл', 'Оля'].map((name) => ({ id: gid(), name, note: '' })),
    teams: [
      { id: gid(), name: 'Друзья', score: 0, color: '#ff5d78' },
      { id: gid(), name: 'Семья', score: 0, color: '#7eb6ff' }
    ],
    timing: [
      { id: gid(), time: '19:00', title: 'Сбор', note: '' },
      { id: gid(), time: '20:00', title: 'Конкурсы', note: '' }
    ]
  });

  store.db.events.push(wedding, corporate, birthday, next);
  store.db.lives[wedding.id] = createLive(wedding);
  store.save();
}

module.exports = { seedIfEmpty, createLive, defaultQuestions, parseContract, typeLabel };
