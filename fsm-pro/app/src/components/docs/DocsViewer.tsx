import React, { useState } from 'react';
import { 
  BookOpen, 
  Database, 
  Server, 
  Smartphone, 
  Shield, 
  CheckCircle2, 
  Code, 
  Copy, 
  Download, 
  FileText,
  Workflow
} from 'lucide-react';

export const DocsViewer: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'architecture' | 'database' | 'api' | 'offline' | 'acceptance'>('architecture');
  const [copied, setCopied] = useState(false);

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const postgresDDL = `-- PostgreSQL DDL Схема для FSM системы
CREATE TYPE user_role AS ENUM ('dispatcher', 'technician', 'admin');
CREATE TYPE task_status AS ENUM (
  'new', 'assigned', 'in_progress', 'under_review', 'completed'
);
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'urgent');

-- 1. Таблица пользователей
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  role user_role NOT NULL DEFAULT 'technician',
  avatar_url TEXT,
  specializations TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Таблица рабочих заданий
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(32) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  work_type VARCHAR(128) NOT NULL,
  status task_status NOT NULL DEFAULT 'new',
  priority priority_level NOT NULL DEFAULT 'medium',
  
  -- Адрес и геопозиция
  address_full TEXT NOT NULL,
  city VARCHAR(100),
  street VARCHAR(150),
  building VARCHAR(50),
  entrance VARCHAR(20),
  floor VARCHAR(20),
  apartment VARCHAR(50),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  
  -- Контакты клиента
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(32) NOT NULL,
  customer_comment TEXT,
  
  -- Временные рамки
  planned_start TIMESTAMPTZ NOT NULL,
  planned_end TIMESTAMPTZ NOT NULL,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  duration_minutes INT,
  
  -- Назначение
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  dispatcher_comment TEXT,
  technician_comment TEXT,
  
  -- Завершение
  customer_signature TEXT,
  customer_signature_date TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Пункты чек-листа
CREATE TABLE checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  is_required BOOLEAN DEFAULT TRUE,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id)
);

-- 4. Фотоотчёт
CREATE TABLE task_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  category VARCHAR(64) NOT NULL, -- 'before', 'process', 'result', 'defects', 'materials', 'documents'
  comment TEXT,
  created_by UUID REFERENCES users(id),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  file_size_kb INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Материалы
CREATE TABLE task_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  planned_quantity NUMERIC(10,2) NOT NULL,
  actual_quantity NUMERIC(10,2) DEFAULT 0,
  unit VARCHAR(32) NOT NULL,
  warehouse_status VARCHAR(64) DEFAULT 'issued'
);

-- 6. Журнал истории статусов (Audit Log)
CREATE TABLE status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  old_status task_status,
  new_status task_status NOT NULL,
  comment TEXT,
  changed_by UUID REFERENCES users(id),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned_user ON tasks(assigned_user_id);
CREATE INDEX idx_task_photos_task_id ON task_photos(task_id);
`;

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">
      
      {/* Header */}
      <div className="p-6 border-b border-slate-200 bg-slate-50/70">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
              Документация и Архитектура
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            Технический проект FSM-системы выездных работ
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Архитектурный стек, структуры реляционных и локальных БД, протокол автономной синхронизации (Offline-First), REST/WebSocket API и критерии приёмки.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 px-6 bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex gap-4 overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveSection('architecture')}
            className={`py-3.5 border-b-2 transition-all flex items-center gap-1.5 ${
              activeSection === 'architecture' ? 'border-[#168BEA] text-[#168BEA]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Server className="w-4 h-4" />
            1. Архитектура и Стек
          </button>
          <button
            onClick={() => setActiveSection('database')}
            className={`py-3.5 border-b-2 transition-all flex items-center gap-1.5 ${
              activeSection === 'database' ? 'border-[#168BEA] text-[#168BEA]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            2. Схема БД (PostgreSQL / SQLite)
          </button>
          <button
            onClick={() => setActiveSection('offline')}
            className={`py-3.5 border-b-2 transition-all flex items-center gap-1.5 ${
              activeSection === 'offline' ? 'border-[#168BEA] text-[#168BEA]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Workflow className="w-4 h-4" />
            3. Offline-First и Синхронизация
          </button>
          <button
            onClick={() => setActiveSection('api')}
            className={`py-3.5 border-b-2 transition-all flex items-center gap-1.5 ${
              activeSection === 'api' ? 'border-[#168BEA] text-[#168BEA]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Code className="w-4 h-4" />
            4. Спецификация REST / WS API
          </button>
          <button
            onClick={() => setActiveSection('acceptance')}
            className={`py-3.5 border-b-2 transition-all flex items-center gap-1.5 ${
              activeSection === 'acceptance' ? 'border-[#168BEA] text-[#168BEA]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            5. Чек-лист приёмки (QA)
          </button>
        </div>
      </div>

      {/* Content Body */}
      <div className="p-6 flex-1">
        <div className="max-w-5xl mx-auto space-y-6 text-slate-800">
          
          {/* Section 1: Architecture */}
          {activeSection === 'architecture' && (
            <div className="space-y-6 text-xs sm:text-sm leading-relaxed">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                    <Smartphone className="w-5 h-5 text-[#168BEA]" />
                    Мобильное приложение (Исполнитель)
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-600 list-disc list-inside">
                    <li><strong>Фреймворк:</strong> React Native + Expo (SDK 52+) / TypeScript</li>
                    <li><strong>Навигация:</strong> Expo Router (File-based routing)</li>
                    <li><strong>State & Server Cache:</strong> Zustand + TanStack Query v5</li>
                    <li><strong>Автономное хранилище:</strong> WatermelonDB / SQLite</li>
                    <li><strong>Формы и валидация:</strong> React Hook Form + Zod</li>
                    <li><strong>Камера & Фото:</strong> Expo Camera + expo-image-manipulator (сжатие WebP до 400-600 КБ перед отправкой)</li>
                    <li><strong>Геолокация:</strong> expo-location с фиксацией координат при смене статусов</li>
                  </ul>
                </div>

                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                    <Server className="w-5 h-5 text-[#9546D8]" />
                    Серверная часть и Backend API
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-600 list-disc list-inside">
                    <li><strong>Фреймворк:</strong> NestJS (Node.js / TypeScript) / FastAPI</li>
                    <li><strong>База данных:</strong> PostgreSQL 16 с расширением PostGIS для геопоиска</li>
                    <li><strong>ORM:</strong> Prisma ORM / TypeORM</li>
                    <li><strong>Хранилище фото и актов:</strong> S3-совместимое объектное хранилище (MinIO / Yandex Cloud Object Storage)</li>
                    <li><strong>Реалтайм диспетчеризация:</strong> WebSockets (Socket.io) для мгновенного обновления статусов у диспетчера</li>
                    <li><strong>Push-уведомления:</strong> Firebase Cloud Messaging (FCM) + Apple Push Notifications (APNs)</li>
                  </ul>
                </div>
              </div>

              {/* Security & Auth */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-2">
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  Безопасность и разграничение доступа (RBAC)
                </h4>
                <p className="text-xs text-slate-600">
                  Аутентификация строится на JWT Access (15 мин) + Refresh токенах (30 дней) с возможностью авторизации по номеру телефона и SMS-коду. Ролевая модель строго изолирует права: исполнитель видит исключительно назначенные на него задания и не может менять чужие данные, диспетчер управляет распределением заданий и согласованием отчётов, администратор настраивает справочники и пользователей.
                </p>
              </div>
            </div>
          )}

          {/* Section 2: Database Schema */}
          {activeSection === 'database' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">PostgreSQL DDL (production ready):</span>
                <button
                  onClick={() => handleCopyCode(postgresDDL)}
                  className="flex items-center gap-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl transition-all"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? 'Скопировано!' : 'Копировать SQL'}
                </button>
              </div>

              <pre className="p-4 bg-slate-900 text-slate-100 rounded-2xl text-xs font-mono overflow-x-auto leading-relaxed max-h-[500px]">
                {postgresDDL}
              </pre>
            </div>
          )}

          {/* Section 3: Offline-first */}
          {activeSection === 'offline' && (
            <div className="space-y-4 text-xs sm:text-sm leading-relaxed">
              <div className="bg-blue-50/70 border border-blue-200 p-4 rounded-2xl">
                <h4 className="font-bold text-[#168BEA] text-sm mb-1">
                  Архитектура Offline-First и механизм синхронизации
                </h4>
                <p className="text-xs text-slate-700">
                  Монтажники часто работают в цокольных этажах, подвалах или загородных объектах с полным отсутствием связи. Приложение спроектировано по принципу <strong>Local-First</strong>:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1.5">
                  <span className="font-bold text-slate-900 text-xs block">1. Оптимистичные мутации</span>
                  <p className="text-xs text-slate-600">
                    Любое действие (отметка чек-листа, смена статуса, фото) сразу обновляет локальный UI и записывается в локальную SQLite БД.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1.5">
                  <span className="font-bold text-slate-900 text-xs block">2. Очередь транзакций (Sync Queue)</span>
                  <p className="text-xs text-slate-600">
                    Каждая мутация снабжается UUID, временной меткой ISO-8601 и координатами GPS, помещаясь в очередь исходящих пакетов.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1.5">
                  <span className="font-bold text-slate-900 text-xs block">3. Replay и разрешение конфликтов</span>
                  <p className="text-xs text-slate-600">
                    При появлении сети NetInfo активирует фоновый фоллбэк: события воспроизводятся пакетами. При конфликтах применяется стратегия <i>Last-Write-Wins</i> с сохранением полной истории в аудит-логе.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Section 4: API Specification */}
          {activeSection === 'api' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-2xl border text-xs space-y-2">
                <span className="font-bold text-slate-900 text-sm block">Основные REST / WebSocket API Эндпоинты:</span>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="p-2 bg-white rounded-lg border flex items-center gap-2">
                    <span className="bg-blue-500 text-white px-2 py-0.5 rounded font-bold">GET</span>
                    <span>/api/v1/tasks/my</span> — Список назначенных задач мастера с фильтрами
                  </div>
                  <div className="p-2 bg-white rounded-lg border flex items-center gap-2">
                    <span className="bg-blue-500 text-white px-2 py-0.5 rounded font-bold">GET</span>
                    <span>/api/v1/tasks/:id</span> — Детальная карточка задания (материалы, чек-лист, фото)
                  </div>
                  <div className="p-2 bg-white rounded-lg border flex items-center gap-2">
                    <span className="bg-amber-500 text-white px-2 py-0.5 rounded font-bold">PATCH</span>
                    <span>/api/v1/tasks/:id/status</span> — Смена статуса (lat, lng, comment)
                  </div>
                  <div className="p-2 bg-white rounded-lg border flex items-center gap-2">
                    <span className="bg-emerald-500 text-white px-2 py-0.5 rounded font-bold">POST</span>
                    <span>/api/v1/tasks/:id/photos</span> — Загрузка фотоотчёта (multipart/form-data в S3)
                  </div>
                  <div className="p-2 bg-white rounded-lg border flex items-center gap-2">
                    <span className="bg-emerald-500 text-white px-2 py-0.5 rounded font-bold">POST</span>
                    <span>/api/v1/tasks/:id/complete</span> — Закрытие отчёта с подписью заказчика и генерацией PDF
                  </div>
                  <div className="p-2 bg-white rounded-lg border flex items-center gap-2">
                    <span className="bg-purple-600 text-white px-2 py-0.5 rounded font-bold">POST</span>
                    <span>/api/v1/sync/batch</span> — Пакетная синхронизация офлайн-очереди
                  </div>
                  <div className="p-2 bg-white rounded-lg border flex items-center gap-2">
                    <span className="bg-indigo-600 text-white px-2 py-0.5 rounded font-bold">WS</span>
                    <span>/ws/dispatcher/live</span> — Real-time подписка на координаты мастеров и смену статусов
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 5: Acceptance Criteria */}
          {activeSection === 'acceptance' && (
            <div className="space-y-3">
              <span className="font-bold text-slate-900 text-sm block">
                Чек-лист проверки и критериев приёмки (Раздел 17 ТЗ):
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {[
                  'Интерфейс списка задач визуально и функционально соответствует дизайну (#F4F7FA, карточки, цветные индикаторы)',
                  'Исполнитель проходит сквозной путь: получение -> адрес на карте -> начало работы -> чек-лист -> фото -> закрытие',
                  'Блокировка завершения: невозможно закрыть работу без обязательного чек-листа и минимального количества фото',
                  'Электронная подпись заказчика на сенсорном экране (Canvas) с фиксацией в итоговом Акте приёмки',
                  'Автономный режим (Offline): приложение сохраняет все действия в отсутствие интернета и синхронизирует их при подключении',
                  'Диспетчерская панель: отображение KPI, интерактивная карта объектов, канбан-доска и согласование фотоотчётов',
                  'Экспорт реестра заданий в Excel (CSV) и формирование официального печатного Акта (PDF)',
                  'Журналирование статусов с фиксацией автора, времени и GPS-координат объекта',
                ].map((item, i) => (
                  <div key={i} className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-2xl flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="text-slate-700 font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  );
};
