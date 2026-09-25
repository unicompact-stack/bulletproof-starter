import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Task, Priority, User } from '../../types';
import { STATUS_CONFIG, PRIORITY_CONFIG, formatDate, formatTime } from '../../utils/statusUtils';
import { PdfActModal } from '../shared/PdfActModal';
import { Avatar } from '../shared/Avatar';
import { getAccessCodes, saveAccessCodes, resetAccessCodes, AccessCodes } from '../../auth';
import { Plus, Search, MapPin, FileText, Download, Camera, X, ShieldCheck, Send, MessageSquare, UserPlus, Users, KeyRound, MapPinned, Ban, Trash2, RotateCcw } from 'lucide-react';

type SectionTab = 'overview' | 'tasks' | 'teams' | 'review';

const CARD = 'rounded-[22px] bg-white border border-[#E2E8F0] p-5 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_12px_30px_rgba(15,23,42,0.06)]';
const ROW = 'flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]';

// Типовые причины возврата отчёта — диспетчеру не нужно писать текст
const RETURN_REASONS = [
  'Фото нечитаемые, переделайте',
  'Не все пункты чек-листа выполнены',
  'Работа выполнена не полностью',
  'Нет фото «до» и «после»',
  'Требуется уборка после работ',
];

export const AdminDashboard: React.FC = () => {
  const {
    tasks, users, createNewTask, reviewTaskReport, showToast,
    chatMessages, sendChatMessage, currentUser, presence,
    notificationsCount, clearNotifications, addUser,
    blockUser, deleteUser, fireEveryone,
  } = useApp();

  const [section, setSection] = useState<SectionTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectingTask, setInspectingTask] = useState<Task | null>(null);
  const [actPreviewTask, setActPreviewTask] = useState<Task | null>(null);
  const [chatInput, setChatInput] = useState('');
  const chatBoxRef = useRef<HTMLDivElement>(null);

  // Чат: адресат — общий чат или конкретный мастер (личные сообщения)
  const [chatTarget, setChatTarget] = useState<string>('common'); // 'common' | userId

  // Добавление сотрудника
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserSpec, setNewUserSpec] = useState('');
  const [newUserCode, setNewUserCode] = useState('');

  // Коды доступа (настраиваются здесь, а не в коде приложения)
  const [codes, setCodes] = useState<AccessCodes>(() => getAccessCodes());
  const [codeWorker, setCodeWorker] = useState(() => getAccessCodes().worker);
  const [codeManager, setCodeManager] = useState(() => getAccessCodes().manager);

  // Возврат на доработку: показ причин-кнопок
  const [showReturnReasons, setShowReturnReasons] = useState(false);
  const [customReturnReason, setCustomReturnReason] = useState('');

  // Управление сотрудниками: подтверждения увольнения
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null);
  const [confirmFireAll, setConfirmFireAll] = useState(false);

  // Тип работ при создании задачи: универсальный список + свои варианты
  const WORK_TYPES = [
    'Доставка груза',
    'Логистика / перевозка',
    'Помощь и уход',
    'Уборка / клининг',
    'Ремонт',
    'Электромонтаж',
    'Сантехника',
    'Замена окон',
    'Укладка плитки',
    'Укладка ламината',
    'Монтаж сплит-системы',
  ];
  const [customWorkTypes, setCustomWorkTypes] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('fsm_custom_worktypes') || '[]');
    } catch {
      return [];
    }
  });
  const [useCustomType, setUseCustomType] = useState(false);
  const [customTypeText, setCustomTypeText] = useState('');

  // Ссылка на Яндекс.Карты по геометке сотрудника
  const yandexMapsUrl = (lat?: number, lng?: number) =>
    lat !== undefined && lng !== undefined
      ? `https://yandex.ru/maps/?pt=${lng},${lat}&z=16&l=map`
      : null;

  // Модалка создания задачи (полноценная форма)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('Замена окон');
  const [newWorkType, setNewWorkType] = useState('Остекление и окна');
  const [newDescription, setNewDescription] = useState('Демонтировать старые окна, установить новые стеклопакеты, выполнить герметизацию.');
  const [newAddress, setNewAddress] = useState('г. Москва, Ленинградский пр-кт, д. 36, кв. 89');
  const [newCustomerName, setNewCustomerName] = useState('Смирнов Андрей Павлович');
  const [newCustomerPhone, setNewCustomerPhone] = useState('+7 (916) 999-88-77');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newAssignedUser, setNewAssignedUser] = useState('user-1');
  const [newComment, setNewComment] = useState('Домофон 89. Позвонить за 30 минут.');

  const stats = useMemo(() => {
    const techs = users.filter(u => u.role === 'technician');
    return {
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      underReview: tasks.filter(t => t.status === 'under_review').length,
      needFix: tasks.filter(t => t.isOverdue).length,
      activeTeams: techs.filter(t => (presence[t.id] ?? 'online') === 'online').length,
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      newAssigned: tasks.filter(t => t.status === 'new' || t.status === 'assigned').length,
    };
  }, [tasks, users, presence]);

  const recentTasks = useMemo(
    () => [...tasks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 3),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(t =>
      t.title.toLowerCase().includes(q) || t.number.toLowerCase().includes(q) ||
      t.address.full.toLowerCase().includes(q) || t.customer.name.toLowerCase().includes(q) ||
      (t.assignedUser?.fullName.toLowerCase().includes(q) ?? false)
    );
  }, [tasks, searchQuery]);

  const reviewTasks = useMemo(() => tasks.filter(t => t.status === 'under_review' || t.photos.length > 0), [tasks]);

  // Реальная дата и время (вместо абстрактного «Сегодня»)
  const todayLabel = useMemo(
    () => new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    [],
  );
  const timeLabel = useMemo(
    () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    [],
  );

  // Настройки (звук уведомлений, показ офлайн-бригад)
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('fsm_sound_enabled') !== '0');
  const [showOffline, setShowOffline] = useState(() => localStorage.getItem('fsm_show_offline') !== '0');

  const toggleSound = () => {
    setSoundEnabled((v) => {
      const next = !v;
      localStorage.setItem('fsm_sound_enabled', next ? '1' : '0');
      return next;
    });
  };
  const toggleShowOffline = () => {
    setShowOffline((v) => {
      const next = !v;
      localStorage.setItem('fsm_show_offline', next ? '1' : '0');
      return next;
    });
  };

  // Звуковой сигнал при новом сообщении от работника
  const prevMsgCount = useRef(chatMessages.length);
  useEffect(() => {
    if (prevMsgCount.current < chatMessages.length) {
      const last = chatMessages[chatMessages.length - 1];
      const fromWorker = last && last.senderRole === 'technician';
      if (fromWorker && soundEnabled) playBeep();
    }
    prevMsgCount.current = chatMessages.length;
  }, [chatMessages, soundEnabled]);

  const exportCSV = () => {
    const head = ['Номер', 'Заголовок', 'Статус', 'Приоритет', 'Адрес', 'Заказчик', 'Телефон', 'Исполнитель', 'Создано'];
    const rows = tasks.map(t => [
      t.number, `"${t.title.replace(/"/g, '""')}"`, STATUS_CONFIG[t.status]?.label || t.status,
      PRIORITY_CONFIG[t.priority]?.label || t.priority, `"${t.address.full.replace(/"/g, '""')}"`,
      `"${t.customer.name.replace(/"/g, '""')}"`, t.customer.phone,
      `"${t.assignedUser?.fullName || 'Не назначен'}"`, formatDate(t.createdAt),
    ]);
    const csv = 'data:text/csv;charset=utf-8,\uFEFF' + [head.join(','), ...rows.map(e => e.join(','))].join('\n');
    const a = document.createElement('a');
    a.setAttribute('href', encodeURI(csv));
    a.setAttribute('download', `FSM_Отчет_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('Реестр заданий экспортирован в Excel (CSV)');
  };

  // Сообщения, видимые в выбранном чате (общий или личный с мастером)
  const visibleChatMessages = useMemo(() => {
    if (chatTarget === 'common') return chatMessages.filter((m) => !m.recipientId);
    return chatMessages.filter((m) => {
      if (!m.recipientId) return false;
      return (
        (m.senderId === currentUser.id && m.recipientId === chatTarget) ||
        (m.senderId === chatTarget && m.recipientId === currentUser.id)
      );
    });
  }, [chatMessages, chatTarget, currentUser.id]);

  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [visibleChatMessages]);

  const sendChat = () => {
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput, inspectingTask?.id, chatTarget === 'common' ? undefined : chatTarget);
    setChatInput('');
    clearNotifications();
  };

  // Сохранение кодов доступа (общие коды работника и руководителя)
  const handleSaveCodes = () => {
    const w = codeWorker.trim();
    const m = codeManager.trim();
    if (!/^\d{4,8}$/.test(w) || !/^\d{4,8}$/.test(m)) {
      showToast('Код — от 4 до 8 цифр');
      return;
    }
    if (w === m) {
      showToast('Коды работника и руководителя не должны совпадать');
      return;
    }
    // Личные коды не должны конфликтовать с общими
    const next: AccessCodes = { worker: w, manager: m, personal: codes.personal };
    const clash = Object.entries(next.personal).find(([, c]) => c === w || c === m);
    if (clash) {
      showToast('Этот код уже используется как личный код сотрудника');
      return;
    }
    saveAccessCodes(next);
    setCodes(next);
    showToast('Коды доступа обновлены');
  };

  const handleResetCodes = () => {
    resetAccessCodes();
    const def = getAccessCodes();
    setCodes(def);
    setCodeWorker(def.worker);
    setCodeManager(def.manager);
    showToast('Коды сброшены к значениям по умолчанию (1111 / 9999)');
  };

  // Создание сотрудника с личным кодом входа
  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newUserName.trim();
    if (!name) { showToast('Укажите ФИО сотрудника'); return; }

    const code = newUserCode.trim();
    const current = getAccessCodes();
    if (code) {
      if (!/^\d{4,8}$/.test(code)) { showToast('Личный код — от 4 до 8 цифр'); return; }
      const taken =
        code === current.worker || code === current.manager ||
        Object.values(current.personal).includes(code);
      if (taken) { showToast('Такой код уже занят — выберите другой'); return; }
    }

    const created = addUser({
      fullName: name,
      phone: newUserPhone.trim() || '—',
      specializations: newUserSpec.trim() ? newUserSpec.split(',').map((s) => s.trim()).filter(Boolean) : [],
    });

    if (code) {
      const next: AccessCodes = { ...current, personal: { ...current.personal, [created.id]: code } };
      saveAccessCodes(next);
      setCodes(next);
      showToast(`Сотрудник добавлен. Личный код: ${code}`);
    }

    setShowAddUser(false);
    setNewUserName(''); setNewUserPhone(''); setNewUserSpec(''); setNewUserCode('');
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Итоговый тип работы: из списка или свой (свой запоминаем на будущее)
    let finalTitle = newTitle;
    if (useCustomType) {
      finalTitle = customTypeText.trim();
      if (!finalTitle) {
        showToast('Впишите название работы или выберите из списка');
        return;
      }
      if (!WORK_TYPES.includes(finalTitle) && !customWorkTypes.includes(finalTitle)) {
        const updated = [...customWorkTypes, finalTitle];
        setCustomWorkTypes(updated);
        localStorage.setItem('fsm_custom_worktypes', JSON.stringify(updated));
      }
    }

    createNewTask({
      title: finalTitle,
      workType: finalTitle,
      description: newDescription,
      priority: newPriority,
      assignedUserId: newAssignedUser,
      dispatcherComment: newComment,
      address: {
        full: newAddress,
        city: 'Москва',
        street: newAddress.split(',')[1]?.trim() || newAddress,
        building: '36', entrance: '1', floor: '5', apartment: '89',
        lat: 55.79 + (Math.random() - 0.5) * 0.04,
        lng: 37.55 + (Math.random() - 0.5) * 0.04,
      },
      customer: { name: newCustomerName, phone: newCustomerPhone },
    });
    setShowCreateModal(false);
  };

  const chip = (t: Task) => {
    const c = STATUS_CONFIG[t.status] || STATUS_CONFIG.new;
    return <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold shadow-xs ${c.badgeBg} ${c.badgeText}`}>{c.label}</span>;
  };
  const chipLight = (t: Task) => {
    const c = STATUS_CONFIG[t.status] || STATUS_CONFIG.new;
    return <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${c.lightBg}`}>{c.label}</span>;
  };
  const hm = (ts: string) => { try { return formatTime(ts); } catch { return ''; } };

  // Короткий звуковой сигнал (Web Audio, без внешних файлов)
  const playBeep = () => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.12;
      osc.type = 'sine';
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8" style={{ background: 'radial-gradient(circle at top, #fff 0%, #F4F7FA 58%, #e8eef6 100%)' }}>
      <div className="max-w-[1320px] mx-auto">

        {/* Верхняя панель */}
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <div className="text-2xl font-black tracking-tight text-[#263238]">FSM PRO — руководитель</div>
            <div className="mt-1 text-xs text-[#7D8790]">4 раздела: Главная, Задачи, Бригады, Проверка</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={() => setShowSettings(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-[#CFE3F8] bg-[#E8F3FE] text-[#168BEA] text-xs font-bold hover:shadow-md transition-all">
              <ShieldCheck className="w-3.5 h-3.5" /> Настройки
            </button>
            <button onClick={exportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-[#C8F3DA] bg-[#ECFDF5] text-[#2CCB70] text-xs font-bold hover:shadow-md transition-all">
              <Download className="w-3.5 h-3.5" /> Экспорт Excel
            </button>
          </div>
        </div>

        {/* Навигация: 4 пилюли */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 mb-4 rounded-[22px] bg-white/90 border border-[#E2E8F0] shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex gap-2 flex-wrap">
            {([['overview', 'Главная'], ['tasks', 'Задачи'], ['teams', 'Сотрудники'], ['review', 'Проверка']] as [SectionTab, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setSection(k)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${section === k ? 'bg-[#168BEA] text-white border-[#168BEA] shadow-md'
                  : 'border border-[#CFE3F8] bg-gradient-to-b from-white to-[#E8F3FE] text-[#168BEA] hover:shadow-md'}`}>{l}
              </button>
            ))}
          </div>
          <span className="px-3 py-1.5 rounded-full bg-[#ECFDF5] text-[#2CCB70] border border-[#C8F3DA] text-xs font-bold">
            {timeLabel} · {todayLabel}
          </span>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-4">
          {[/* [label, value, border, gradient, color] */
            ['В работе', stats.inProgress, '#BFE1FF', '#F5FAFF', '#168BEA'],
            ['Ждут проверки', stats.underReview, '#F7D08C', '#FFF9F0', '#F59E0B'],
            ['Нужно исправить', stats.needFix, '#F7B7B7', '#FFF6F6', '#EF4444'],
            ['Активных бригад', stats.activeTeams, '#C8F3DA', '#F4FFF8', '#2CCB70'],
          ].map(([label, value, border, grad, color]) => (
            <div key={label as string}
              className="rounded-[22px] p-4 sm:p-5 bg-white border shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_12px_30px_rgba(15,23,42,0.06)]"
              style={{ borderColor: border as string, background: `linear-gradient(180deg, #fff, ${grad})` }}>
              <div className="text-xs text-[#7D8790]">{label as string}</div>
              <div className="mt-2 text-3xl font-black" style={{ color: color as string }}>{value as number}</div>
            </div>
          ))}
        </div>

        {/* Двухколоночный контент */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-3.5 items-start">
          {/* ЛЕВАЯ КОЛОНКА */}
          <div className="space-y-3.5">

            {/* ГЛАВНАЯ */}
            {section === 'overview' && (
              <>
                <div className={CARD}>
                  <div className="uppercase text-[11px] tracking-wider font-extrabold text-[#94A3B8] mb-3">Главная</div>
                  <h2 className="text-2xl font-black text-[#263238]">{todayLabel}</h2>
                  <p className="text-xs text-[#7D8790] mt-1">Короткий обзор задач, которые требуют внимания</p>
                  <button onClick={() => setShowCreateModal(true)}
                    className="mt-4 w-full py-3.5 px-4 rounded-2xl bg-[#168BEA] text-white font-extrabold text-center shadow-[0_8px_18px_rgba(22,139,234,0.15)] hover:bg-[#1277c9] transition-all active:scale-[0.98]">
                    + Создать задачу
                  </button>
                  <div className="mt-4 space-y-2.5">
                    <div className={ROW}><div><strong className="text-sm text-[#263238]">В работе:</strong> {stats.inProgress}</div><span className="px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[#2CCB70] text-[11px] font-bold">Новая</span></div>
                    <div className={ROW}><div><strong className="text-sm text-[#263238]">Ждут проверки:</strong> {stats.underReview}</div><span className="px-2.5 py-1 rounded-full bg-[#EFF6FF] text-[#168BEA] text-[11px] font-bold">На проверке</span></div>
                    <div className={ROW}><div><strong className="text-sm text-[#263238]">Нужно исправить:</strong> {stats.needFix}</div><span className="px-2.5 py-1 rounded-full bg-[#FEF2F2] text-[#EF4444] text-[11px] font-bold">Вернуть</span></div>
                  </div>
                </div>
                <div className={CARD}>
                  <div className="uppercase text-[11px] tracking-wider font-extrabold text-[#94A3B8] mb-3">Последние задачи</div>
                  <div className="space-y-2.5">
                    {recentTasks.length === 0 && <p className="text-xs text-[#94A3B8]">Задач пока нет</p>}
                    {recentTasks.map(t => (
                      <div key={t.id} onClick={() => setInspectingTask(t)}
                        className="cursor-pointer flex items-start justify-between gap-3 p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#BFE1FF] hover:shadow-md transition-all">
                        <div className="min-w-0">
                          <strong className="block text-sm text-[#263238] truncate">{t.title}</strong>
                          <div className="mt-0.5 text-xs text-[#7D8790]">{STATUS_CONFIG[t.status]?.label} · {t.assignedUser?.fullName.split(' ').slice(0, 2).join(' ') || 'Не назначен'}</div>
                        </div>
                        {chipLight(t)}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ЗАДАЧИ */}
            {section === 'tasks' && (
              <div className={CARD}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="uppercase text-[11px] tracking-wider font-extrabold text-[#94A3B8] mb-1">Задачи</div>
                    <h3 className="text-xl font-black text-[#263238]">Реестр заданий</h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                      <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Поиск..."
                        className="pl-8 pr-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs outline-none focus:ring-2 focus:ring-[#168BEA] w-52" />
                    </div>
                    <button onClick={() => setShowCreateModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#168BEA] text-white text-xs font-bold hover:bg-[#1277c9] transition-all">
                      <Plus className="w-3.5 h-3.5" /> Создать
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {filteredTasks.length === 0 && <p className="text-xs text-[#94A3B8] py-6 text-center">Задач не найдено</p>}
                  {filteredTasks.map(t => {
                    const pr = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
                    return (
                      <div key={t.id} onClick={() => setInspectingTask(t)}
                        className="cursor-pointer flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#BFE1FF] hover:shadow-md transition-all">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <strong className="text-sm text-[#263238]">{t.title}</strong>
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${pr.bg} ${pr.text}`}>{pr.label}</span>
                            {t.isOverdue && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#FEF2F2] text-[#EF4444]">Просрочена</span>}
                          </div>
                          <div className="mt-1 text-xs text-[#7D8790] flex items-center gap-1 flex-wrap">
                            <span className="font-bold text-[#168BEA]">{t.number}</span>
                            <MapPin className="w-3 h-3" /> {t.address.full}
                          </div>
                          <div className="mt-1 text-[11px] text-[#94A3B8]">{t.assignedUser?.fullName || 'Не назначен'} · Заказчик: {t.customer.name}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {chip(t)}
                          <button onClick={e => { e.stopPropagation(); setActPreviewTask(t); }}
                            className="px-2.5 py-1.5 rounded-xl bg-[#EFF6FF] text-[#168BEA] text-[11px] font-bold hover:bg-blue-100 transition-all flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Акт
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* СОТРУДНИКИ */}
            {section === 'teams' && (
              <div className={CARD}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="uppercase text-[11px] tracking-wider font-extrabold text-[#94A3B8] mb-1">Сотрудники</div>
                    <h3 className="text-xl font-black text-[#263238]">Мастера и выездные работники</h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {confirmFireAll ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-rose-700">Уволить всех и очистить коды?</span>
                        <button onClick={() => { fireEveryone(); setConfirmFireAll(false); }}
                          className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700">Да, уволить</button>
                        <button onClick={() => setConfirmFireAll(false)}
                          className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold">Нет</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmFireAll(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#F7B7B7] bg-[#FFF6F6] text-[#EF4444] text-xs font-bold hover:shadow-md transition-all">
                        <Trash2 className="w-3.5 h-3.5" /> Уволить всех
                      </button>
                    )}
                    <button onClick={() => setShowAddUser(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#168BEA] text-white text-xs font-bold hover:bg-[#1277c9] transition-all">
                      <UserPlus className="w-3.5 h-3.5" /> Добавить сотрудника
                    </button>
                  </div>
                </div>

                <div className="mt-2 space-y-2.5">
                  {users.filter(u => u.role === 'technician').length === 0 && (
                    <div className="text-center py-10 px-4 bg-[#F8FAFC] rounded-2xl border border-dashed border-[#E2E8F0]">
                      <Users className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
                      <p className="text-xs text-[#7D8790]">Сотрудников нет — чистый лист. Добавьте первого мастера.</p>
                    </div>
                  )}
                  {users.filter(u => u.role === 'technician').map(tech => {
                    const assigned = tasks.filter(t => t.assignedUserId === tech.id).length;
                    const active = tasks.filter(t => t.assignedUserId === tech.id && t.status === 'in_progress').length;
                    const online = (presence[tech.id] ?? 'online') === 'online';
                    const personalCode = codes.personal[tech.id];
                    const mapsUrl = yandexMapsUrl(tech.currentLocation?.lat, tech.currentLocation?.lng);
                    const geoTime = tech.currentLocation?.updatedAt
                      ? hm(tech.currentLocation.updatedAt)
                      : null;
                    const isBlocked = !!tech.isBlocked;
                    return (
                      <div key={tech.id} className={`p-3.5 rounded-2xl border ${isBlocked ? 'bg-slate-100 border-slate-200 opacity-70' : 'bg-[#F8FAFC] border-[#E2E8F0]'}`}>
                        <div className="flex items-center gap-3 flex-wrap">
                          <Avatar user={tech} size={40} className={`rounded-xl border ${isBlocked ? 'grayscale border-slate-300' : 'border-[#E2E8F0]'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-[#263238] truncate">
                              {tech.fullName}
                              {isBlocked && <span className="ml-2 text-[10px] font-bold text-slate-500 bg-slate-200 rounded-full px-2 py-0.5">заблокирован</span>}
                            </div>
                            <div className="text-[11px] text-[#7D8790]">{tech.specializations.join(', ')}</div>
                          </div>
                          {personalCode && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#EFF6FF] text-[#168BEA] text-[10px] font-bold border border-[#CFE3F8]">
                              <KeyRound className="w-3 h-3" /> код {personalCode}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold ${online && !isBlocked ? 'bg-[#ECFDF5] text-[#2CCB70]' : 'bg-slate-200 text-slate-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${online && !isBlocked ? 'bg-[#2CCB70]' : 'bg-slate-400'}`} />
                            {isBlocked ? 'нет доступа' : online ? 'онлайн' : 'офлайн'}
                          </span>
                        </div>

                        <div className="mt-2 text-[11px] text-[#7D8790]">
                          Сейчас задач: <b className="text-[#263238]">{assigned}</b>
                          {active > 0 && <> · В работе: <b className="text-[#168BEA]">{active}</b></>}
                          {' · '}
                          <a href={`tel:${tech.phone}`} className="text-[#168BEA] font-bold">{tech.phone}</a>
                          {tech.age && <> · {tech.age} лет</>}
                        </div>

                        {(tech.about || tech.avatar) && (
                          <div className="mt-2 p-2.5 rounded-xl bg-white border border-[#E2E8F0] flex items-start gap-2.5">
                            <Avatar user={tech} size={30} className="shrink-0" />
                            <div className="min-w-0">
                              {tech.about && <div className="text-[11px] text-[#7D8790] leading-relaxed italic">«{tech.about}»</div>}
                              {!tech.about && <div className="text-[10px] text-[#94A3B8]">Профиль оформлен (фото есть), «о себе» пока пусто</div>}
                            </div>
                          </div>
                        )}

                        {/* Действия: найти на карте, блокировка, увольнение */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          {mapsUrl ? (
                            <a href={mapsUrl} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2CCB70]/10 border border-[#C8F3DA] text-[#1B8D4C] text-[11px] font-bold hover:bg-[#2CCB70]/20 transition-all">
                              <MapPinned className="w-3.5 h-3.5" /> Найти на Яндекс.Картах{geoTime ? ` · метка ${geoTime}` : ''}
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-[11px] font-bold">
                              <MapPinned className="w-3.5 h-3.5" /> Нет геометки (появится после действий мастера)
                            </span>
                          )}

                          <button onClick={() => blockUser(tech.id, !isBlocked)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${isBlocked
                              ? 'bg-[#ECFDF5] border border-[#C8F3DA] text-[#2CCB70] hover:bg-emerald-100'
                              : 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'}`}>
                            {isBlocked ? <><RotateCcw className="w-3.5 h-3.5" /> Разблокировать</> : <><Ban className="w-3.5 h-3.5" /> Заблокировать</>}
                          </button>

                          {confirmDeleteUser === tech.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <button onClick={() => { deleteUser(tech.id); setConfirmDeleteUser(null); }}
                                className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700">Уволить</button>
                              <button onClick={() => setConfirmDeleteUser(null)}
                                className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold">Отмена</button>
                            </span>
                          ) : (
                            <button onClick={() => setConfirmDeleteUser(tech.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 border border-[#F7B7B7] text-[#EF4444] text-[11px] font-bold hover:bg-rose-100 transition-all">
                              <Trash2 className="w-3.5 h-3.5" /> Уволить
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ПРОВЕРКА */}
            {section === 'review' && (
              <div className={CARD}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="uppercase text-[11px] tracking-wider font-extrabold text-[#94A3B8] mb-1">Проверка</div>
                    <h3 className="text-xl font-black text-[#263238]">Фотоотчёты и акты</h3>
                  </div>
                  <span className="px-3 py-1.5 rounded-full bg-[#EFF6FF] text-[#168BEA] text-[11px] font-bold">На проверке: {stats.underReview}</span>
                </div>
                <div className="space-y-3">
                  {reviewTasks.length === 0 && (
                    <div className="text-center py-8">
                      <Camera className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
                      <p className="text-xs text-[#94A3B8]">Отчётов на проверке нет</p>
                    </div>
                  )}
                  {reviewTasks.map(t => (
                    <div key={t.id} className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-bold text-[#168BEA]">{t.number}</span>
                            <strong className="text-sm text-[#263238]">{t.title}</strong>
                          </div>
                          <p className="mt-1 text-xs text-[#7D8790]">{t.assignedUser?.fullName || 'Не назначен'} · {t.address.full}</p>
                        </div>
                        {chipLight(t)}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        {t.photos.slice(0, 3).map(p => (
                          <div key={p.id} className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-100"><img src={p.url} alt="" className="w-full h-full object-cover" /></div>
                        ))}
                        {t.photos.length === 0 && <div className="col-span-3 text-[11px] text-[#94A3B8] py-2 text-center">Фото не загружены</div>}
                      </div>
                      <div className="mt-1 text-[11px] text-[#94A3B8]">Фото: {t.photos.length} · Чек-лист: {t.checklist.filter(c => c.isCompleted).length}/{t.checklist.length}</div>
                      {t.status === 'under_review' && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <button onClick={() => setInspectingTask(t)} className="py-2.5 rounded-xl border border-[#CFE3F8] bg-white text-[#168BEA] text-xs font-bold hover:shadow-sm transition-all">[Посмотреть]</button>
                          <button onClick={() => reviewTaskReport(t.id, false, 'Требуется доработка материалов')} className="py-2.5 rounded-xl border border-[#F7B7B7] bg-white text-[#EF4444] text-xs font-bold hover:shadow-sm transition-all">[Вернуть]</button>
                          <button onClick={() => reviewTaskReport(t.id, true)} className="py-2.5 rounded-xl bg-[#168BEA] text-white text-xs font-bold hover:bg-[#1277c9] transition-all shadow-[0_8px_18px_rgba(22,139,234,0.15)]">[Принять]</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ПРАВАЯ КОЛОНКА */}
          <div className="space-y-3.5">
            {/* ЧАТ С РАБОЧИМИ */}
            <div className={CARD}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#168BEA]" />
                  <span className="uppercase text-[11px] tracking-wider font-extrabold text-[#94A3B8]">Чат с рабочими</span>
                </div>
                <div className="flex items-center gap-2">
                  {notificationsCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {notificationsCount}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#2CCB70] text-[10px] font-bold">{visibleChatMessages.length} сообщений</span>
                </div>
              </div>

              {/* Выбор адресата: общий чат или личная переписка с мастером */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
                <button onClick={() => setChatTarget('common')}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition-all ${chatTarget === 'common' ? 'bg-[#168BEA] text-white' : 'bg-[#F1F5F9] text-[#7D8790] hover:bg-slate-200'}`}>
                  <Users className="w-3.5 h-3.5" /> Общий чат
                </button>
                {users.filter(u => u.role === 'technician').map(tech => (
                  <button key={tech.id} onClick={() => setChatTarget(tech.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[11px] font-bold transition-all ${chatTarget === tech.id ? 'bg-[#168BEA] text-white' : 'bg-[#F1F5F9] text-[#7D8790] hover:bg-slate-200'}`}>
                    <Avatar user={tech} size={18} />
                    {tech.fullName.split(' ')[0]}
                  </button>
                ))}
              </div>

              <div ref={chatBoxRef} className="h-52 overflow-y-auto space-y-2.5 pr-1 mb-3">
                {visibleChatMessages.length === 0 && <p className="text-xs text-[#94A3B8] text-center py-8">
                  {chatTarget === 'common' ? 'Сообщений пока нет. Напишите бригаде первым.' : 'Личных сообщений пока нет.'}
                </p>}
                {visibleChatMessages.map(msg => {
                  const isMe = msg.senderId === currentUser.id;
                  const isTech = msg.senderRole === 'technician';
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl ${isMe ? 'bg-[#168BEA] text-white rounded-br-md'
                        : isTech ? 'bg-[#F1F5F9] text-[#263238] rounded-bl-md border border-[#E2E8F0]' : 'bg-[#EFF6FF] text-[#263238] rounded-bl-md border border-[#BFE1FF]'}`}>
                        <div className="text-[10px] font-bold mb-0.5 opacity-80">{isMe ? 'Вы' : msg.senderName}{msg.taskId && !isMe && <span className="ml-1 normal-case">· по задаче</span>}</div>
                        <div className="text-xs leading-relaxed break-words">{msg.text}</div>
                        <div className="text-[10px] mt-1 opacity-60">{hm(msg.timestamp)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
                  placeholder={chatTarget === 'common' ? 'Написать в общий чат...' : 'Личное сообщение...'} className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs outline-none focus:ring-2 focus:ring-[#168BEA]" />
                <button onClick={sendChat} className="px-4 py-2.5 rounded-xl bg-[#168BEA] text-white text-xs font-bold hover:bg-[#1277c9] transition-all flex items-center gap-1.5 shadow-[0_8px_18px_rgba(22,139,234,0.15)]">
                  <Send className="w-3.5 h-3.5" /> Отправить
                </button>
              </div>
            </div>

            {/* СВОДКА */}
            <div className={CARD}>
              <div className="uppercase text-[11px] tracking-wider font-extrabold text-[#94A3B8] mb-3">Сводка</div>
              <div className="space-y-2">
                <div className={ROW}><span className="text-[#7D8790]">Всего заданий</span><b className="text-[#263238]">{stats.total}</b></div>
                <div className={ROW}><span className="text-[#7D8790]">Новые / Назначены</span><b className="text-[#9546D8]">{stats.newAssigned}</b></div>
                <div className={ROW}><span className="text-[#7D8790]">Выполнено</span><b className="text-[#2CCB70]">{stats.completed}</b></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Модалка создания задачи */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900">Создание нового задания</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Тип / наименование работы:</label>
                <select
                  value={useCustomType ? '__custom__' : newTitle}
                  onChange={e => {
                    if (e.target.value === '__custom__') {
                      setUseCustomType(true);
                      setCustomTypeText('');
                    } else {
                      setUseCustomType(false);
                      setNewTitle(e.target.value);
                      setNewWorkType(e.target.value);
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  {customWorkTypes.map(t => <option key={t} value={t}>{t} (своё)</option>)}
                  <option value="__custom__">Своё… (вписать)</option>
                </select>
                {useCustomType && (
                  <input
                    type="text"
                    value={customTypeText}
                    onChange={e => setCustomTypeText(e.target.value)}
                    placeholder="Например: Встретить и сопроводить..."
                    autoFocus
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                )}
                <div className="text-[10px] text-slate-400">Свой вариант запомнится в списке для будущих задач.</div>
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Описание задачи для мастера:</label>
                <textarea rows={2} value={newDescription} onChange={e => setNewDescription(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Адрес объекта:</label>
                <input type="text" value={newAddress} onChange={e => setNewAddress(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">ФИО Клиента:</label>
                  <input type="text" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Телефон клиента:</label>
                  <input type="text" value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Приоритет:</label>
                  <select value={newPriority} onChange={e => setNewPriority(e.target.value as Priority)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <option value="low">Низкий</option>
                    <option value="medium">Обычный</option>
                    <option value="high">Высокий</option>
                    <option value="urgent">Срочно</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Назначить специалиста:</label>
                  <select value={newAssignedUser} onChange={e => setNewAssignedUser(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <option value="">Без назначения</option>
                    {users.filter(u => u.role === 'technician' && !u.isBlocked).map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Комментарий диспетчера:</label>
                <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Домофон, контакты..." className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
              </div>
              <div className="flex gap-2 pt-3">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-2xl font-semibold">Отмена</button>
                <button type="submit" className="flex-1 py-3 text-white bg-[#168BEA] hover:bg-[#1277c9] rounded-2xl font-bold shadow-md shadow-blue-500/20">Создать и назначить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка просмотра задачи */}
      {inspectingTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-xs font-bold text-[#168BEA]">{inspectingTask.number}</span>
                <h3 className="font-bold text-base text-slate-900">{inspectingTask.title}</h3>
              </div>
              <button onClick={() => setInspectingTask(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border">
                <span className="font-bold text-slate-800 block mb-1">Адрес объекта:</span>
                <div className="text-slate-600">{inspectingTask.address.full}</div>
                <div className="mt-1 text-slate-500">Клиент: {inspectingTask.customer.name} ({inspectingTask.customer.phone})</div>
                <div className="mt-1 text-slate-500">Статус: {STATUS_CONFIG[inspectingTask.status]?.label}</div>
              </div>
              {inspectingTask.status === 'under_review' && !showReturnReasons && (
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setShowReturnReasons(true)}
                    className="flex-1 py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold">Вернуть на доработку</button>
                  <button onClick={() => { reviewTaskReport(inspectingTask.id, true); setInspectingTask(null); }}
                    className="flex-1 py-2.5 px-3 bg-[#2CCB70] hover:bg-emerald-600 text-white rounded-xl font-bold shadow">Согласовать и закрыть</button>
                </div>
              )}
              {inspectingTask.status === 'under_review' && showReturnReasons && (
                <div className="pt-2 space-y-2">
                  <div className="text-[11px] font-bold text-rose-700">Причина возврата — просто нажмите:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {RETURN_REASONS.map(r => (
                      <button key={r} onClick={() => { reviewTaskReport(inspectingTask.id, false, r); setInspectingTask(null); setShowReturnReasons(false); }}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold border border-rose-200 transition-all">
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={customReturnReason} onChange={e => setCustomReturnReason(e.target.value)} placeholder="Или впишите свою причину..."
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs outline-none" />
                    <button
                      onClick={() => { reviewTaskReport(inspectingTask.id, false, customReturnReason.trim() || undefined); setInspectingTask(null); setShowReturnReasons(false); setCustomReturnReason(''); }}
                      className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold">Отправить</button>
                    <button onClick={() => setShowReturnReasons(false)}
                      className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold">Отмена</button>
                  </div>
                </div>
              )}
              <button onClick={() => setActPreviewTask(inspectingTask)}
                className="w-full py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-[#168BEA] rounded-xl font-bold flex items-center justify-center gap-1.5">
                <FileText className="w-4 h-4" /> Сформировать Акт (PDF)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Акт PDF */}
      {actPreviewTask && <PdfActModal task={actPreviewTask} onClose={() => setActPreviewTask(null)} />}

      {/* Модалка добавления сотрудника */}
      {showAddUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#168BEA]" /> Новый сотрудник
              </h3>
              <button onClick={() => setShowAddUser(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">ФИО *</label>
                <input type="text" value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Иванов Иван Иванович"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Телефон</label>
                <input type="tel" value={newUserPhone} onChange={e => setNewUserPhone(e.target.value)} placeholder="+7 (___) ___-__-__"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Специализации (через запятую)</label>
                <input type="text" value={newUserSpec} onChange={e => setNewUserSpec(e.target.value)} placeholder="Электромонтаж, Слаботочные сети"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Личный код входа (необязательно)</label>
                <input type="text" inputMode="numeric" value={newUserCode} onChange={e => setNewUserCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Например: 2222"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl tracking-widest" />
                <div className="text-[10px] text-slate-400">Мастер введёт этот код на экране входа и попадёт в свою панель.</div>
              </div>
              <div className="flex gap-2 pt-3">
                <button type="button" onClick={() => setShowAddUser(false)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-2xl font-semibold">Отмена</button>
                <button type="submit" className="flex-1 py-3 text-white bg-[#168BEA] hover:bg-[#1277c9] rounded-2xl font-bold shadow-md shadow-blue-500/20">Добавить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка настроек */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#168BEA]" />
                <h3 className="font-bold text-base text-slate-900">Настройки</h3>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-800">Звук уведомлений</div>
                  <div className="text-xs text-slate-500">Сигнал при новом сообщении от работника</div>
                </div>
                <button
                  onClick={toggleSound}
                  className={`relative w-12 h-7 rounded-full transition-colors ${soundEnabled ? 'bg-[#168BEA]' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${soundEnabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-800">Показывать офлайн-бригады</div>
                  <div className="text-xs text-slate-500">Отображать специалистов не в сети</div>
                </div>
                <button
                  onClick={toggleShowOffline}
                  className={`relative w-12 h-7 rounded-full transition-colors ${showOffline ? 'bg-[#168BEA]' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${showOffline ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <KeyRound className="w-4 h-4 text-[#168BEA]" />
                  <div className="text-sm font-bold text-slate-800">Коды доступа</div>
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  Коды задаются здесь и сохраняются локально — в коде приложения их больше нет.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">Код работника</label>
                    <input type="text" inputMode="numeric" value={codeWorker}
                      onChange={e => setCodeWorker(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm tracking-widest outline-none focus:ring-2 focus:ring-[#168BEA]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">Код руководителя</label>
                    <input type="text" inputMode="numeric" value={codeManager}
                      onChange={e => setCodeManager(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm tracking-widest outline-none focus:ring-2 focus:ring-[#168BEA]" />
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={handleSaveCodes}
                    className="flex-1 py-2 rounded-xl bg-[#168BEA] hover:bg-[#1277c9] text-white text-xs font-bold transition-all">Сохранить коды</button>
                  <button onClick={handleResetCodes}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all">Сбросить</button>
                </div>
                {Object.keys(codes.personal).length > 0 && (
                  <div className="mt-3 p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <div className="text-[11px] font-bold text-slate-500 mb-1.5">Личные коды мастеров</div>
                    {Object.entries(codes.personal).map(([uid, c]) => {
                      const u = users.find(x => x.id === uid);
                      if (!u) return null;
                      return (
                        <div key={uid} className="flex items-center justify-between text-[11px] py-1">
                          <span className="text-slate-600">{u.fullName}</span>
                          <span className="font-bold text-[#168BEA] tracking-widest">{c}</span>
                        </div>
                      );
                    })}
                    <div className="text-[10px] text-slate-400 mt-1">Личный код открывает панель этого мастера.</div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100">
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  Скоро: смена цветовой темы, тёмный режим, экспорт отчётов.
                </div>
                <div className="mt-2 text-[11px] font-bold text-slate-400">
                  Сборка: {__APP_BUILD__}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};