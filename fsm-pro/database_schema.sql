-- ==============================================================================
-- СХЕМА БАЗЫ ДАННЫХ ДЛЯ СИСТЕМЫ УПРАВЛЕНИЯ ВЫЕЗДНЫМИ РАБОТАМИ (FSM)
-- СУБД: PostgreSQL 15+ с поддержкой PostGIS и UUID-OSSP
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ------------------------------------------------------------------------------
-- 1. ТИПЫ ДАННЫХ И ПЕРЕЧИСЛЕНИЯ (ENUMS)
-- ------------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM (
    'technician',    -- Монтажник / Сервисный специалист
    'foreman',       -- Прораб бригады
    'dispatcher',    -- Диспетчер / Логист офиса
    'admin'          -- Системный администратор
);

CREATE TYPE task_status AS ENUM (
    'new',                  -- Новая заявка
    'assigned',             -- Назначена исполнителю
    'en_route',             -- В пути на объект
    'on_site',              -- Прибыл на объект
    'in_progress',          -- В работе
    'paused',               -- Приостановлена
    'needs_material',       -- Требуется допоставка материала
    'needs_approval',       -- Требуется согласование с офисом
    'under_review',         -- На проверке у диспетчера
    'completed',            -- Завершена и принята
    'returned_for_rework',  -- Возвращена на доработку
    'overdue',              -- Просрочена
    'cancelled'             -- Отменена
);

CREATE TYPE priority_level AS ENUM (
    'low',       -- Низкий
    'medium',    -- Обычный
    'high',      -- Высокий
    'urgent'     -- Срочный / Аварийный
);

CREATE TYPE photo_category AS ENUM (
    'before',       -- До начала работ (мин. 2 фото)
    'process',      -- Процесс выполнения
    'result',       -- Результат (мин. 3 фото)
    'defects',      -- Обнаруженные скрытые дефекты
    'materials',    -- Фото материалов и упаковки
    'documents'     -- Показания счетчиков, паспорта изделий, накладные
);

-- ------------------------------------------------------------------------------
-- 2. ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ И БРИГАД
-- ------------------------------------------------------------------------------

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(32) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'technician',
    avatar_url TEXT,
    specializations TEXT[] DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_latitude DOUBLE PRECISION,
    last_longitude DOUBLE PRECISION,
    last_location_updated_at TIMESTAMPTZ,
    fcm_push_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. ТАБЛИЦА СПРАВОЧНИКОВ ТИПОВ РАБОТ
-- ------------------------------------------------------------------------------

CREATE TABLE work_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(128) NOT NULL UNIQUE,
    category VARCHAR(128) NOT NULL,
    estimated_duration_minutes INT DEFAULT 180,
    min_photos_before INT DEFAULT 2,
    min_photos_result INT DEFAULT 3,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. ТАБЛИЦА ЗАКАЗОВ / ЗАДАНИЙ (TASKS)
-- ------------------------------------------------------------------------------

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    number VARCHAR(32) NOT NULL UNIQUE, -- Напр: 'ЗК-2026-0842'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    work_type_id UUID REFERENCES work_types(id) ON DELETE SET NULL,
    status task_status NOT NULL DEFAULT 'new',
    priority priority_level NOT NULL DEFAULT 'medium',
    
    -- Адресный блок
    address_full TEXT NOT NULL,
    city VARCHAR(100) NOT NULL DEFAULT 'Москва',
    street VARCHAR(150),
    building VARCHAR(50),
    entrance VARCHAR(20),
    floor VARCHAR(20),
    apartment VARCHAR(50),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geo_point GEOMETRY(Point, 4326),
    
    -- Клиентский блок
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
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    dispatcher_comment TEXT,
    technician_comment TEXT,
    
    -- Закрытие и электронная подпись
    customer_signature TEXT, -- Base64 data URL
    customer_signature_date TIMESTAMPTZ,
    act_pdf_url TEXT,
    
    -- Метаданные оптимистичной синхронизации
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. ТАБЛИЦА ЧЕК-ЛИСТОВ (ТЕХНОЛОГИЧЕСКИЕ ЭТАПЫ)
-- ------------------------------------------------------------------------------

CREATE TABLE task_checklists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION
);

-- ------------------------------------------------------------------------------
-- 6. ТАБЛИЦА МАТЕРИАЛОВ И РАСХОДА
-- ------------------------------------------------------------------------------

CREATE TABLE task_materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    planned_quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
    actual_quantity NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    unit VARCHAR(32) NOT NULL DEFAULT 'шт.',
    warehouse_status VARCHAR(64) NOT NULL DEFAULT 'issued',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 7. ТАБЛИЦА ФОТООТЧЁТОВ
-- ------------------------------------------------------------------------------

CREATE TABLE task_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    category photo_category NOT NULL DEFAULT 'process',
    comment TEXT,
    file_size_kb INT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 8. ТАБЛИЦА ИСТОРИИ ИЗМЕНЕНИЙ СТАТУСОВ (AUDIT LOG)
-- ------------------------------------------------------------------------------

CREATE TABLE task_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    old_status task_status,
    new_status task_status NOT NULL,
    comment TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- ИНДЕКСЫ ДЛЯ УСКОРЕНИЯ ВЫБОРКИ
-- ------------------------------------------------------------------------------

CREATE INDEX idx_tasks_assigned_user ON tasks(assigned_user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_planned_start ON tasks(planned_start);
CREATE INDEX idx_tasks_geo_point ON tasks USING GIST(geo_point);
CREATE INDEX idx_task_checklists_task ON task_checklists(task_id);
CREATE INDEX idx_task_photos_task ON task_photos(task_id);
CREATE INDEX idx_task_materials_task ON task_materials(task_id);
CREATE INDEX idx_status_history_task ON task_status_history(task_id);
