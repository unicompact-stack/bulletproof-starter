import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Task, User, TaskStatus, ChecklistItem, TaskPhoto, TaskMaterial, OfflineAction, UserRole, PhotoCategory, ChatMessage } from '../types';
import { INITIAL_TASKS, INITIAL_USERS, CHECKLIST_TEMPLATES } from '../data/mockData';
import { db, isIndexedDBAvailable } from '../db';
import { getLocationSnapshot, initGeoTracking, getCurrentPosition } from '../utils/geo';
import { AuthMode, persistAuthMode, readPersistedAuthMode, getAccessCodes, saveAccessCodes } from '../auth';
import {
  loadTasks, createTask as createSupabaseTask, updateTask as updateSupabaseTask,
  loadChatMessages, sendChatMessageToSupabase,
  loadPresence, setPresenceOnSupabase,
  subscribeToChanges,
  SupabaseTask,
} from '../lib/db';

interface AppContextType {
  tasks: Task[];
  users: User[];
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  // Авторизация: режим сессии (worker / manager / demo) или null — экран входа
  authMode: AuthMode | null;
  login: (mode: 'worker' | 'manager', userId?: string) => void;
  enterDemo: () => void;
  logout: () => void;
  hasChosenRole: boolean;
  currentUser: User;
  setCurrentUser: (user: User) => void;
  // Пользователи: создание/редактирование из админ-панели
  addUser: (data: { fullName: string; phone: string; specializations: string[]; role?: UserRole }) => User;
  deactivateUser: (userId: string) => void;
  // Блокировка («заморожен» — по коду не пускает), удаление («уволен»), полный сброс персонала
  blockUser: (userId: string, blocked: boolean) => void;
  deleteUser: (userId: string) => void;
  fireEveryone: () => void;
  // Профиль мастера: редактирует сам (аватар, о себе, возраст)
  updateMyProfile: (data: { about?: string; age?: string; avatar?: string }) => void;
  activeTaskId: string | null;
  setActiveTaskId: (id: string | null) => void;
  activeTask: Task | null;
  // Offline simulation
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  offlineQueue: OfflineAction[];
  isSyncing: boolean;
  syncOfflineQueue: () => Promise<void>;
  // Task Actions
  updateTaskStatus: (taskId: string, newStatus: TaskStatus, comment?: string) => void;
  toggleChecklistItem: (taskId: string, itemId: string) => void;
  addPhoto: (taskId: string, photo: Omit<TaskPhoto, 'id' | 'createdAt' | 'createdBy' | 'syncStatus'>) => void;
  deletePhoto: (taskId: string, photoId: string) => void;
  updateMaterialQty: (taskId: string, materialId: string, actualQty: number) => void;
  addMaterial: (taskId: string, material: Omit<TaskMaterial, 'id' | 'taskId'>) => void;
  completeTask: (taskId: string, signatureDataUrl: string, technicianComment: string) => boolean;
  createNewTask: (taskData: Partial<Task>) => Task;
  reviewTaskReport: (taskId: string, approved: boolean, comment?: string) => void;
  reassignTask: (taskId: string, userId: string) => void;
  // Взятие задачи работником (с "витрины" всех задач)
  takeTask: (taskId: string) => void;
  // Фиксация прибытия на объект (кнопка «Я на объекте» — GPS + время)
  recordArrival: (taskId: string) => Promise<void>;
  // Чек-листы: добавление/удаление пунктов работником
  addChecklistItem: (taskId: string, title: string) => void;
  removeChecklistItem: (taskId: string, itemId: string) => void;
  // Присутствие бригад (онлайн/офлайн) — видно руководителю
  presence: Record<string, 'online' | 'offline'>;
  setUserPresence: (userId: string, presence: 'online' | 'offline') => void;
  // Chat with technicians
  chatMessages: ChatMessage[];
  sendChatMessage: (text: string, taskId?: string, recipientId?: string) => void;
  // UI helpers
  notificationsCount: number;
  clearNotifications: () => void;
  resetDemoState: () => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Загрузка данных: Supabase → IndexedDB → mocks
  useEffect(() => {
    const loadData = async () => {
      try {
        const supabaseTasks = await loadTasks();
        if (supabaseTasks.length > 0) {
          // Конвертируем SupabaseTask → Task (merge с моками для полей которых нет в БД)
          const merged = supabaseTasks.map((st) => {
            const mock = INITIAL_TASKS.find((m) => m.id === st.id);
            return {
              ...(mock || INITIAL_TASKS[0]),
              id: st.id,
              title: st.title,
              description: st.description || mock?.description || '',
              address: st.address ? { full: st.address } as any : mock?.address,
              customer: st.customer_name ? { name: st.customer_name, phone: st.customer_phone || '' } : mock?.customer,
              status: st.status as TaskStatus,
              assignedUserId: st.assigned_to || mock?.assignedUserId || '',
              createdAt: st.created_at,
              updatedAt: st.updated_at,
              createdBy: st.created_by || mock?.createdBy || '',
            };
          });
          setTasks(merged);
        } else if (isIndexedDBAvailable()) {
          const stored = await db.getTasks<Task>();
          if (stored && stored.length > 0) setTasks(stored);
        }
      } catch (e) {
        console.warn('Data load fallback:', e);
        if (isIndexedDBAvailable()) {
          const stored = await db.getTasks<Task>();
          if (stored && stored.length > 0) setTasks(stored);
        }
      }
      setDataLoaded(true);
    };
    loadData();
    initGeoTracking();

    // Загружаем чат и присутствие из Supabase
    loadChatMessages().then((msgs) => {
      if (msgs.length > 0) setChatMessages(msgs);
    });
    loadPresence().then((p) => {
      if (Object.keys(p).length > 0) setPresence((prev) => ({ ...prev, ...p }));
    });
  }, []);

  // Пользователи: моки + созданные в админ-панели (сохраняются в localStorage)
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem('fsm_users');
      if (saved) {
        const parsed = JSON.parse(saved) as User[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_USERS;
  });

  // Сохраняем пользователей при изменении (+ рассылка в другие вкладки)
  useEffect(() => {
    if (usersRemote.current) {
      usersRemote.current = false;
      return;
    }
    try {
      localStorage.setItem('fsm_users', JSON.stringify(users));
    } catch {
      // ignore
    }
    syncChannel.current?.postMessage({ type: 'users', users });
  }, [users]);

  // Создание пользователя из админ-панели (мастер с личным кодом входа)
  const addUser = (data: { fullName: string; phone: string; specializations: string[]; role?: UserRole }) => {
    const newUser: User = {
      id: 'user-' + Math.random().toString(36).substring(2, 8),
      fullName: data.fullName.trim(),
      phone: data.phone.trim(),
      email: '',
      role: data.role || 'technician',
      avatar: '', // пустая аватарка → цветной круг с инициалами
      specializations: data.specializations.length ? data.specializations : ['Общие работы'],
      isActive: true,
      status: 'available',
    };
    setUsers((prev) => [...prev, newUser]);
    showToast(`Сотрудник «${newUser.fullName}» добавлен`);
    return newUser;
  };

  const deactivateUser = (userId: string) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isActive: false } : u)));
    showToast('Сотрудник деактивирован');
  };

  // Блокировка: человек остаётся в списке, но по коду его не пускает
  const blockUser = (userId: string, blocked: boolean) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isBlocked: blocked } : u)));
    showToast(blocked ? 'Сотрудник заблокирован — вход по его коду закрыт' : 'Сотрудник разблокирован');
  };

  // Удаление («уволен»): убираем из списка, удаляем его личный код, снимаем с задач
  const deleteUser = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setTasks((prev) =>
      prev.map((t) =>
        t.assignedUserId === userId
          ? { ...t, assignedUserId: '', assignedUser: undefined, status: t.status === 'assigned' ? 'new' : t.status }
          : t
      )
    );
    // Удаляем личный код уволенного
    const codes = getAccessCodes();
    const personal = { ...codes.personal };
    delete personal[userId];
    saveAccessCodes({ ...codes, personal });

    showToast(target ? `«${target.fullName}» уволен — задачи освобождены` : 'Сотрудник удалён');
  };

  // Профиль мастера: обновляет свои данные (аватар, о себе, возраст)
  const updateMyProfile = (data: { about?: string; age?: string; avatar?: string }) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? { ...u, ...data } : u))
    );
    setCurrentUser((prev) => ({ ...prev, ...data }));
    showToast('Профиль обновлён');
  };

  // «Уволить всех»: остаётся только руководство, задачи освобождаются, коды мастеров стираются
  const fireEveryone = () => {
    setUsers((prev) => prev.filter((u) => u.role !== 'technician'));
    setTasks((prev) =>
      prev.map((t) =>
        t.assignedUserId
          ? { ...t, assignedUserId: '', assignedUser: undefined, status: t.status === 'assigned' ? 'new' : t.status }
          : t
      )
    );
    const codes = getAccessCodes();
    saveAccessCodes({ ...codes, personal: {} });
    showToast('Все сотрудники уволены — чистый лист');
  };


  // Realtime: подписка на изменения в Supabase (задачи, чат, присутствие)
  useEffect(() => {
    if (!dataLoaded) return;
    const unsub = subscribeToChanges((table, payload) => {
      if (table === 'fsm_tasks' && payload.eventType === 'INSERT') {
        const st = payload.new as SupabaseTask;
        setTasks((prev) => {
          if (prev.some((t) => t.id === st.id)) return prev;
          const mock = INITIAL_TASKS.find((m) => m.id === st.id);
          return [{
            ...(mock || INITIAL_TASKS[0]),
            id: st.id, title: st.title, description: st.description || '',
            status: st.status as TaskStatus, assignedUserId: st.assigned_to || '',
            createdAt: st.created_at, updatedAt: st.updated_at,
          }, ...prev];
        });
      } else if (table === 'fsm_tasks' && payload.eventType === 'UPDATE') {
        const st = payload.new as SupabaseTask;
        setTasks((prev) => prev.map((t) => t.id === st.id ? {
          ...t, status: st.status as TaskStatus, title: st.title,
          updatedAt: st.updated_at, assignedUserId: st.assigned_to || t.assignedUserId,
        } : t));
      } else if (table === 'chat_messages' && payload.eventType === 'INSERT') {
        const m = payload.new;
        setChatMessages((prev) => {
          if (prev.some((p) => p.id === m.id)) return prev;
          return [...prev, {
            id: m.id, taskId: m.task_id || undefined,
            senderId: m.sender_id, senderName: m.sender_name,
            senderRole: m.sender_role, text: m.text, timestamp: m.created_at,
          }];
        });
        if (m.sender_role === 'technician') setUnreadManager((v) => v + 1);
        else setUnreadTech((v) => v + 1);
      } else if (table === 'user_presence') {
        const p = payload.new;
        setPresence((prev) => ({ ...prev, [p.user_id]: p.status }));
      }
    });
    return unsub;
  }, [dataLoaded]);
  // Режим сессии: null — экран входа, иначе worker / manager / demo.
  const [authMode, setAuthMode] = useState<AuthMode | null>(() => readPersistedAuthMode());
  const hasChosenRole = authMode !== null;
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem('fsm_role');
    return (saved === 'dispatcher' || saved === 'admin') ? saved : 'technician';
  });
  const [currentUser, setCurrentUser] = useState<User>(INITIAL_USERS[0]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>('task-101');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [offlineQueue, setOfflineQueue] = useState<OfflineAction[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Непрочитанные сообщения: отдельно для работника (от руководителя) и руководителя (от работников).
  const [unreadTech, setUnreadTech] = useState<number>(() => Number(localStorage.getItem('fsm_unread_technician') || 0));
  const [unreadManager, setUnreadManager] = useState<number>(() => Number(localStorage.getItem('fsm_unread_manager') || 0));

  // Присутствие бригад: онлайн/офлайн. Хранится в localStorage — видно и в других вкладках.
  const [presence, setPresence] = useState<Record<string, 'online' | 'offline'>>(() => {
    try {
      const saved = localStorage.getItem('fsm_presence');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    const init: Record<string, 'online' | 'offline'> = {};
    INITIAL_USERS.forEach((u) => { init[u.id] = 'online'; });
    return init;
  });

  // Сохранение роли в localStorage
  useEffect(() => {
    localStorage.setItem('fsm_role', currentRole);
  }, [currentRole]);

  // Присутствие — сохраняем в localStorage, чтобы было видно в других вкладках
  useEffect(() => {
    localStorage.setItem('fsm_presence', JSON.stringify(presence));
  }, [presence]);

  // Непрочитанные — сохраняем
  useEffect(() => {
    localStorage.setItem('fsm_unread_technician', String(unreadTech));
  }, [unreadTech]);
  useEffect(() => {
    localStorage.setItem('fsm_unread_manager', String(unreadManager));
  }, [unreadManager]);

  // Живая синхронизация между вкладками (имитация двух устройств: мастер и руководитель).
  // Событие storage срабатывает в других вкладках того же origin при изменении localStorage.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'fsm_chat') {
        try {
          const parsed = JSON.parse(e.newValue || '[]');
          setChatMessages(parsed);
        } catch {
          // ignore
        }
      } else if (e.key === 'fsm_presence') {
        try {
          const parsed = JSON.parse(e.newValue || '{}');
          setPresence(parsed);
        } catch {
          // ignore
        }
      } else if (e.key === 'fsm_unread_technician') {
        setUnreadTech(Number(e.newValue || 0));
      } else if (e.key === 'fsm_unread_manager') {
        setUnreadManager(Number(e.newValue || 0));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Число непрочитанных для текущей роли
  const notificationsCount = currentRole === 'technician' ? unreadTech : unreadManager;

  // Чат между диспетчером и рабочими (общее хранилище в localStorage)
  const buildInitialChat = () => ([
    {
      id: 'chat-1',
      taskId: 'task-101',
      senderId: 'user-1',
      senderName: 'Алексей Смирнов',
      senderRole: 'technician' as const,
      text: 'Добрый день! На объекте по замене окон начали демонтаж, всё в порядке.',
      timestamp: '2026-08-19T09:25:00',
    },
    {
      id: 'chat-2',
      taskId: 'task-101',
      senderId: 'user-dispatcher',
      senderName: 'Елена Морозова',
      senderRole: 'dispatcher' as const,
      text: 'Принято, Алексей! Не забудьте про 2 фото «до» и аккуратно с мебелью заказчика.',
      timestamp: '2026-08-19T09:30:00',
    },
    {
      id: 'chat-3',
      senderId: 'user-dispatcher',
      senderName: 'Елена Морозова',
      senderRole: 'dispatcher' as const,
      text: 'Бригада «Север», жду от вас фотоотчёт по задаче ЗК-2026-0842 до 18:00.',
      timestamp: '2026-08-19T14:00:00',
    },
  ]);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('fsm_chat');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return buildInitialChat();
  });

  // Чат сохраняется в localStorage — переживает перезагрузку и синхронизируется между вкладками
  useEffect(() => {
    try {
      localStorage.setItem('fsm_chat', JSON.stringify(chatMessages));
    } catch {
      // ignore
    }
  }, [chatMessages]);

  // Синхронизация ТОЛЬКО в IndexedDB (localStorage не используем — данные сбрасываются при обновлении)
  // Плюс рассылка в другие вкладки того же браузера (проверка «диспетчер + мастер» в двух окнах)
  const syncChannel = useRef<BroadcastChannel | null>(null);
  const tasksRemote = useRef(false);
  const usersRemote = useRef(false);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('fsm-sync');
    syncChannel.current = ch;
    ch.onmessage = (ev) => {
      const msg = ev.data;
      if (msg?.type === 'tasks') {
        tasksRemote.current = true;
        setTasks(msg.tasks);
      } else if (msg?.type === 'users') {
        usersRemote.current = true;
        setUsers(msg.users);
      }
    };
    return () => ch.close();
  }, []);

  useEffect(() => {
    if (tasksRemote.current) {
      tasksRemote.current = false;
      return;
    }
    if (isIndexedDBAvailable()) {
      db.saveTasks(tasks).catch(() => {});
    }
    syncChannel.current?.postMessage({ type: 'tasks', tasks });
  }, [tasks]);

  useEffect(() => {
    // Offline queue — не сохраняем в localStorage
  }, [offlineQueue]);

  // When switching role, pick suitable default user
  // (не трогаем пользователя, если он уже соответствует роли — например, вошёл по личному коду)
  useEffect(() => {
    if (currentRole === 'technician') {
      setCurrentUser((prev) => (prev.role === 'technician' ? prev : users.find((u) => u.role === 'technician') || INITIAL_USERS[0]));
    } else if (currentRole === 'dispatcher') {
      setCurrentUser((prev) => (prev.role === 'dispatcher' ? prev : users.find((u) => u.role === 'dispatcher') || INITIAL_USERS[3]));
    } else {
      setCurrentUser((prev) => (prev.role === 'admin' ? prev : users.find((u) => u.role === 'admin') || INITIAL_USERS[4]));
    }
  }, [currentRole, users]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const activeTask = tasks.find((t) => t.id === activeTaskId) || null;

  // Enqueue offline action if offline
  const enqueueOfflineAction = (action: Omit<OfflineAction, 'id' | 'timestamp' | 'status' | 'retryCount'>) => {
    const newAction: OfflineAction = {
      ...action,
      id: 'act-' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
    };
    setOfflineQueue((prev) => [...prev, newAction]);
    showToast('Сохранено локально в очереди offline-синхронизации');
  };

  // Sync offline queue when connection restored
  const syncOfflineQueue = async () => {
    if (offlineQueue.length === 0) {
      showToast('Все данные актуальны, очередь синхронизации пуста');
      return;
    }
    setIsSyncing(true);
    // Simulate server synchronization delay
    await new Promise((res) => setTimeout(res, 1200));

    // Mark photos as synced
    setTasks((prev) =>
      prev.map((t) => ({
        ...t,
        syncPending: false,
        photos: t.photos.map((p) => ({ ...p, syncStatus: 'synced' })),
      }))
    );

    const count = offlineQueue.length;
    setOfflineQueue([]);
    setIsSyncing(false);
    showToast(`Синхронизировано ${count} отложенных операций с сервером!`);
  };

  // Trigger sync when switched to online
  const handleSetOnline = (online: boolean) => {
    setIsOnline(online);
    if (online && offlineQueue.length > 0) {
      syncOfflineQueue();
    } else if (!online) {
      showToast('Включён автономный режим (Offline-first)');
    }
  };

  const updateTaskStatus = (taskId: string, newStatus: TaskStatus, comment?: string) => {
    const timestamp = new Date().toISOString();
    const isNowOnline = isOnline;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;

        const newHistory = [
          ...t.statusHistory,
          {
            id: 'sh-' + Math.random().toString(36).substring(2, 9),
            taskId,
            oldStatus: t.status,
            newStatus,
            comment: comment || `Статус изменен на "${newStatus}"`,
            changedBy: currentUser.id,
            changedByName: currentUser.fullName,
            changedAt: timestamp,
            lat: getLocationSnapshot().lat,
            lng: getLocationSnapshot().lng,
          },
        ];

        let actualStart = t.actualStart;
        if (newStatus === 'in_progress' && !actualStart) {
          actualStart = timestamp;
        }

        return {
          ...t,
          status: newStatus,
          actualStart,
          updatedAt: timestamp,
          syncPending: !isNowOnline,
          // Повторная отправка на проверку снимает флаг «на доработке»
          needsRework: newStatus === 'under_review' ? false : t.needsRework,
          reworkComment: newStatus === 'under_review' ? undefined : t.reworkComment,
          statusHistory: newHistory,
        };
      })
    );

    if (!isNowOnline) {
      enqueueOfflineAction({
        type: 'STATUS_CHANGE',
        taskId,
        payload: { newStatus, comment },
      });
    } else {
      showToast(`Статус заявки обновлён`);
    }

    // Синхронизация с Supabase
    updateSupabaseTask(taskId, { status: newStatus });

    // Гео-метка мастера обновляется при каждом действии (для «Найти на Яндекс.Картах»)
    const snap = getLocationSnapshot();
    setUsers((prev) =>
      prev.map((u) =>
        u.id === currentUser.id
          ? { ...u, currentLocation: { lat: snap.lat, lng: snap.lng, updatedAt: timestamp } }
          : u
      )
    );
  };

  const toggleChecklistItem = (taskId: string, itemId: string) => {
    const timestamp = new Date().toISOString();
    const isNowOnline = isOnline;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const newChecklist = t.checklist.map((item) => {
          if (item.id !== itemId) return item;
          const nextState = !item.isCompleted;
          return {
            ...item,
            isCompleted: nextState,
            completedAt: nextState ? timestamp : undefined,
            completedBy: nextState ? currentUser.fullName : undefined,
          };
        });
        return {
          ...t,
          checklist: newChecklist,
          updatedAt: timestamp,
          syncPending: !isNowOnline,
        };
      })
    );

    if (!isNowOnline) {
      enqueueOfflineAction({
        type: 'CHECKLIST_TOGGLE',
        taskId,
        payload: { itemId },
      });
    }
  };

  const addPhoto = (
    taskId: string,
    photoData: Omit<TaskPhoto, 'id' | 'createdAt' | 'createdBy' | 'syncStatus'>
  ) => {
    const isNowOnline = isOnline;
    const newPhoto: TaskPhoto = {
      ...photoData,
      id: 'photo-' + Math.random().toString(36).substring(2, 9),
      taskId,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.fullName,
      syncStatus: isNowOnline ? 'synced' : 'pending',
      ...getLocationSnapshot(),
    };

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          photos: [newPhoto, ...t.photos],
          updatedAt: new Date().toISOString(),
          syncPending: !isNowOnline,
        };
      })
    );

    if (!isNowOnline) {
      enqueueOfflineAction({
        type: 'PHOTO_ADD',
        taskId,
        payload: newPhoto,
      });
    } else {
      showToast('Фотография успешно добавлена в отчёт');
    }
  };

  const deletePhoto = (taskId: string, photoId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          photos: t.photos.filter((p) => p.id !== photoId),
          updatedAt: new Date().toISOString(),
        };
      })
    );
    if (!isOnline) {
      enqueueOfflineAction({
        type: 'PHOTO_DELETE',
        taskId,
        payload: { photoId },
      });
    } else {
      showToast('Фотография удалена');
    }
  };

  const updateMaterialQty = (taskId: string, materialId: string, actualQty: number) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          materials: t.materials.map((m) => (m.id === materialId ? { ...m, actualQty } : m)),
          updatedAt: new Date().toISOString(),
        };
      })
    );
    if (!isOnline) {
      enqueueOfflineAction({
        type: 'MATERIAL_UPDATE',
        taskId,
        payload: { materialId, actualQty },
      });
    }
  };

  const addMaterial = (taskId: string, material: Omit<TaskMaterial, 'id' | 'taskId'>) => {
    const newMat: TaskMaterial = {
      ...material,
      id: 'm-' + Math.random().toString(36).substring(2, 9),
      taskId,
    };
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          materials: [...t.materials, newMat],
          updatedAt: new Date().toISOString(),
        };
      })
    );
    showToast(`Материал "${material.name}" добавлен`);
  };

  const completeTask = (taskId: string, signatureDataUrl: string, technicianComment: string): boolean => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return false;

    // Check mandatory checklist
    const pendingRequiredChecklist = task.checklist.filter((c) => c.isRequired && !c.isCompleted);
    if (pendingRequiredChecklist.length > 0) {
      showToast(`Ошибка: отметьте все обязательные пункты чек-листа (${pendingRequiredChecklist.length} ост.)`);
      return false;
    }

    // Check mandatory photos
    const beforePhotos = task.photos.filter((p) => p.category === 'before');
    const resultPhotos = task.photos.filter((p) => p.category === 'result');
    if (beforePhotos.length < 2) {
      showToast('Ошибка: необходимо минимум 2 фото категории "До начала работ"');
      return false;
    }
    if (resultPhotos.length < 2) {
      showToast('Ошибка: необходимо минимум 2 фото категории "Результат"');
      return false;
    }

    const now = new Date().toISOString();
    const startDate = task.actualStart ? new Date(task.actualStart).getTime() : new Date(task.plannedStart).getTime();
    const duration = Math.max(1, Math.round((new Date().getTime() - startDate) / 60000));

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          status: 'under_review', // Or 'completed'
          actualEnd: now,
          durationMinutes: duration,
          customerSignature: signatureDataUrl,
          customerSignatureDate: now,
          technicianComment,
          updatedAt: now,
          syncPending: !isOnline,
          statusHistory: [
            ...t.statusHistory,
            {
              id: 'sh-' + Math.random().toString(36).substring(2, 9),
              taskId,
              oldStatus: t.status,
              newStatus: 'under_review',
              comment: 'Задание выполнено мастером и передано на проверку диспетчеру',
              changedBy: currentUser.id,
              changedByName: currentUser.fullName,
              changedAt: now,
              ...getLocationSnapshot(),
            },
          ],
        };
      })
    );

    if (!isOnline) {
      enqueueOfflineAction({
        type: 'TASK_COMPLETE',
        taskId,
        payload: { signatureDataUrl, technicianComment, actualEnd: now },
      });
    }

    showToast('Задание успешно закрыто и отправлено на проверку!');
    return true;
  };

  const createNewTask = (taskData: Partial<Task>): Task => {
    const count = tasks.length + 845;
    const title = taskData.title || 'Новая сервисная заявка';
    const workType = taskData.workType || 'Монтажные работы';

    // Auto-populate checklist from template if available
    let checklist: ChecklistItem[] = [];
    if (CHECKLIST_TEMPLATES[title]) {
      checklist = CHECKLIST_TEMPLATES[title].map((c) => ({
        ...c,
        id: 'c-' + Math.random().toString(36).substring(2, 7),
        isCompleted: false,
      }));
    } else {
      checklist = [
        { id: 'c1', title: 'Осмотр и подготовка рабочего места', isRequired: true, isCompleted: false },
        { id: 'c2', title: 'Выполнение основных монтажных работ', isRequired: true, isCompleted: false },
        { id: 'c3', title: 'Контроль качества и проверка работоспособности', isRequired: true, isCompleted: false },
        { id: 'c4', title: 'Уборка мусора и сдача заказчику', isRequired: true, isCompleted: false },
      ];
    }

    const newTask: Task = {
      id: 'task-' + (tasks.length + 101),
      number: `ЗК-2026-0${count}`,
      title,
      description: taskData.description || 'Выполнение сервисных и монтажных работ согласно регламенту.',
      workType,
      status: taskData.assignedUserId ? 'assigned' : 'new',
      priority: taskData.priority || 'medium',
      address: taskData.address || {
        full: 'г. Москва, ул. Арбат, д. 24, кв. 15',
        city: 'Москва',
        street: 'ул. Арбат',
        building: '24',
        entrance: '1',
        floor: '3',
        apartment: '15',
        lat: 55.7505,
        lng: 37.5925,
      },
      customer: taskData.customer || {
        name: 'Соколов Артем Владимирович',
        phone: '+7 (916) 777-88-99',
      },
      plannedStart: taskData.plannedStart || new Date().toISOString(),
      plannedEnd: taskData.plannedEnd || new Date(Date.now() + 4 * 3600000).toISOString(),
      assignedUserId: taskData.assignedUserId || '',
      assignedUser: users.find((u) => u.id === taskData.assignedUserId),
      dispatcherComment: taskData.dispatcherComment || '',
      checklist,
      materials: taskData.materials || [],
      photos: [],
      statusHistory: [
        {
          id: 'sh-init',
          taskId: 'task-' + (tasks.length + 101),
          oldStatus: null,
          newStatus: taskData.assignedUserId ? 'assigned' : 'new',
          comment: 'Заявка создана через веб-панель диспетчера',
          changedBy: currentUser.id,
          changedByName: currentUser.fullName,
          changedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: currentUser.fullName,
    };

    setTasks((prev) => [newTask, ...prev]);

    // Сохраняем в Supabase
    createSupabaseTask({
      title: newTask.title,
      description: newTask.description,
      address: newTask.address?.full || null,
      customer_name: newTask.customer?.name || null,
      customer_phone: newTask.customer?.phone || null,
      status: newTask.status,
      assigned_to: newTask.assignedUserId || null,
      created_by: currentUser.fullName,
    }).then((saved) => {
      if (saved) {
        // Обновляем локальный ID на ID из базы
        setTasks((prev) => prev.map((t) => t.id === newTask.id ? { ...t, id: saved.id } : t));
      }
    });

    showToast(`Заявка №${newTask.number} успешно создана`);
    return newTask;
  };

  const reviewTaskReport = (taskId: string, approved: boolean, comment?: string) => {
    // По спецификации 5 статусов: отклонённый отчёт возвращается в «В работе»
    // + у мастера появляется пометка «На доработке» с комментарием диспетчера.
    const nextStatus: TaskStatus = approved ? 'completed' : 'in_progress';
    const now = new Date().toISOString();

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          status: nextStatus,
          needsRework: approved ? false : true,
          reworkComment: approved ? undefined : (comment || 'Доработайте отчёт и отправьте повторно'),
          updatedAt: now,
          statusHistory: [
            ...t.statusHistory,
            {
              id: 'sh-' + Math.random().toString(36).substring(2, 9),
              taskId,
              oldStatus: t.status,
              newStatus: nextStatus,
              comment: comment || (approved ? 'Отчёт согласован диспетчером' : 'Отчёт возвращён на доработку'),
              changedBy: currentUser.id,
              changedByName: currentUser.fullName,
              changedAt: now,
            },
          ],
        };
      })
    );

    showToast(approved ? 'Отчёт принят — задача переведена в «Завершена»' : 'Отчёт отправлен мастеру на доработку');
  };

  const reassignTask = (taskId: string, userId: string) => {
    const user = users.find((u) => u.id === userId);
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          assignedUserId: userId,
          assignedUser: user,
          status: t.status === 'new' ? 'assigned' : t.status,
          updatedAt: new Date().toISOString(),
          statusHistory: [
            ...t.statusHistory,
            {
              id: 'sh-' + Math.random().toString(36).substring(2, 9),
              taskId,
              oldStatus: t.status,
              newStatus: t.status === 'new' ? 'assigned' : t.status,
              comment: user ? `Назначен исполнитель: ${user.fullName}` : 'Исполнитель снят с задачи',
              changedBy: currentUser.id,
              changedByName: currentUser.fullName,
              changedAt: new Date().toISOString(),
            },
          ],
        };
      })
    );
    showToast(user ? `Исполнитель изменён на ${user.fullName}` : 'Исполнитель снят');
    updateSupabaseTask(taskId, { assigned_to: userId });
  };

  const setUserPresence = (userId: string, p: 'online' | 'offline') => {
    setPresence((prev) => ({ ...prev, [userId]: p }));
    setPresenceOnSupabase(userId, p);
    if (p === 'online') showToast('Вы в сети — руководитель видит вас онлайн');
    else showToast('Вы офлайн — руководитель видит, что вы недоступны');
  };

  // Работник берёт свободную задачу с витрины
  const takeTask = (taskId: string) => {
    const now = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const nextStatus: TaskStatus = t.status === 'new' ? 'assigned' : t.status;
        return {
          ...t,
          assignedUserId: currentUser.id,
          assignedUser: currentUser,
          status: nextStatus,
          updatedAt: now,
          statusHistory: [
            ...t.statusHistory,
            {
              id: 'sh-' + Math.random().toString(36).substring(2, 9),
              taskId,
              oldStatus: t.status,
              newStatus: nextStatus,
              comment: `${currentUser.fullName} взял задачу в работу`,
              changedBy: currentUser.id,
              changedByName: currentUser.fullName,
              changedAt: now,
            },
          ],
        };
      })
    );
    showToast('Задача добавлена в «Мои задачи»');
    updateSupabaseTask(taskId, { assigned_to: currentUser.id, status: 'assigned' });
  };

  // «Я на объекте»: фиксируем время прибытия и GPS-координаты одной кнопкой.
  // Заодно обновляем гео-метку мастера — руководитель найдёт его на Яндекс.Картах.
  const recordArrival = async (taskId: string) => {
    const loc = await getCurrentPosition();
    const now = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, arrivalAt: now, arrivalLocation: loc, updatedAt: now }
          : t
      )
    );
    setUsers((prev) =>
      prev.map((u) =>
        u.id === currentUser.id
          ? { ...u, currentLocation: { lat: loc.lat, lng: loc.lng, updatedAt: now } }
          : u
      )
    );
    const time = new Date(now).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    showToast(`Прибытие зафиксировано в ${time} — координаты приложены к задаче`);
  };

  const addChecklistItem = (taskId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const item: ChecklistItem = {
      id: 'c-' + Math.random().toString(36).substring(2, 7),
      title: trimmed,
      isRequired: false,
      isCompleted: false,
    };
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, checklist: [...t.checklist, item], updatedAt: new Date().toISOString() }
          : t
      )
    );
    showToast('Пункт чек-листа добавлен');
  };

  const removeChecklistItem = (taskId: string, itemId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, checklist: t.checklist.filter((c) => c.id !== itemId), updatedAt: new Date().toISOString() }
          : t
      )
    );
    showToast('Пункт чек-листа удалён');
  };

  const sendChatMessage = (text: string, taskId?: string, recipientId?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const optimisticMsg: ChatMessage = {
      id: 'chat-' + Math.random().toString(36).substring(2, 9),
      taskId,
      senderId: currentUser.id,
      senderName: currentUser.fullName,
      senderRole: currentRole,
      recipientId,
      text: trimmed,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, optimisticMsg]);

    // Отправляем в Supabase (Realtime доставит другим устройствам)
    sendChatMessageToSupabase({
      sender_id: currentUser.id,
      sender_name: currentUser.fullName,
      sender_role: currentRole,
      task_id: taskId,
      text: trimmed,
    }).then((saved) => {
      if (saved) {
        // Заменяем оптимистичное сообщение на реальное из БД
        setChatMessages((prev) => prev.map((m) => m.id === optimisticMsg.id ? saved : m));
      }
    });

    if (currentRole === 'technician') {
      setUnreadManager(v => v + 1);
    } else {
      setUnreadTech(v => v + 1);
    }
    showToast(recipientId ? 'Личное сообщение отправлено' : 'Сообщение отправлено в чат');
  };

  const clearNotifications = () => {
    if (currentRole === 'technician') setUnreadTech(0);
    else setUnreadManager(0);
    showToast('Уведомления прочитаны');
  };

  const resetDemoState = () => {
    setTasks(INITIAL_TASKS);
    setCurrentRole('technician');
    setCurrentUser(INITIAL_USERS[0]);
    setActiveTaskId('task-101');
    setIsOnline(true);
    setOfflineQueue([]);
    setUnreadTech(0);
    setUnreadManager(0);
    setChatMessages(buildInitialChat());
    if (isIndexedDBAvailable()) {
      db.saveTasks(INITIAL_TASKS).catch(() => {});
    }
    showToast('Демо-состояние сброшено');
  };

  // ===== Авторизация =====
  // Вход по корректному коду: открывает ТОЛЬКО нужную панель.
  // Личный код мастера → панель этого конкретного мастера (userId).
  const login = (mode: 'worker' | 'manager', userId?: string) => {
    if (mode === 'worker') {
      setCurrentRole('technician');
      const target = userId ? users.find((u) => u.id === userId) : null;
      setCurrentUser(target || users[0] || INITIAL_USERS[0]); // по умолчанию первый мастер
    } else {
      setCurrentRole('admin');
      setCurrentUser(users.find((u) => u.role === 'admin') || INITIAL_USERS[4]);
    }
    setAuthMode(mode);
    persistAuthMode(mode);
  };

  // Вход в демо-режим (обучение) — отдельный режим, не ломает обычный вход.
  const enterDemo = () => {
    resetDemoState();
    setCurrentRole('technician');
    setCurrentUser(INITIAL_USERS[0]);
    setAuthMode('demo');
    persistAuthMode('demo');
  };

  // Выход — возврат на экран входа (данные и чат сохраняются).
  const logout = () => {
    setAuthMode(null);
    persistAuthMode(null);
  };

  return (
    <AppContext.Provider
      value={{
        tasks,
        users,
        currentRole,
        setCurrentRole,
    authMode,
    login,
    enterDemo,
    logout,
    hasChosenRole,
    currentUser,
    setCurrentUser,
    addUser,
    deactivateUser,
    blockUser,
    deleteUser,
    fireEveryone,
    updateMyProfile,
        activeTaskId,
        setActiveTaskId,
        activeTask,
        isOnline,
        setIsOnline: handleSetOnline,
        offlineQueue,
        isSyncing,
        syncOfflineQueue,
        updateTaskStatus,
        toggleChecklistItem,
        addPhoto,
        deletePhoto,
        updateMaterialQty,
        addMaterial,
        completeTask,
        createNewTask,
    reviewTaskReport,
    reassignTask,
    takeTask,
    recordArrival,
    addChecklistItem,
        removeChecklistItem,
        presence,
        setUserPresence,
        chatMessages,
        sendChatMessage,
        notificationsCount,
        clearNotifications,
        resetDemoState,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
