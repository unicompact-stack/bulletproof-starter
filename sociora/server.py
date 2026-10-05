#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sociora — локальный бэкенд копии (для личного использования).

Содержит:
  * SQLite-базу (пользователи, проекты, темы, посты, соцсети, платежи)
  * REST API личного кабинета (/api/*)
  * Мок-IИ: анализ ниши, генерация тем и постов, перегенерация по правке
  * Раздачу статики (лендинг + кабинет + страницы входа/регистрации)

Запуск:  python3 server.py [порт]     (по умолчанию 8080)
Без внешних зависимостей — только стандартная библиотека Python 3.
"""

import hashlib
import json
import random
import re
import secrets
import sqlite3
import sys
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "app.db"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

# ---------------------------------------------------------------- база

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'trial',
  plan_until TEXT,
  posts_balance INTEGER NOT NULL DEFAULT 15,
  posts_total INTEGER NOT NULL DEFAULT 0,
  tone TEXT NOT NULL DEFAULT 'дружелюбный',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  niche TEXT NOT NULL,
  website TEXT,
  tone TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  analysis TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  rubric TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS socials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  network TEXT NOT NULL,
  token TEXT NOT NULL,
  channel TEXT,
  channel_id TEXT,
  status TEXT NOT NULL DEFAULT 'connected',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_prompt TEXT,
  rubric TEXT,
  networks TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  published_at TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  reposts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  item TEXT NOT NULL,
  amount INTEGER NOT NULL,
  period TEXT,
  status TEXT NOT NULL DEFAULT 'paid',
  created_at TEXT NOT NULL
);
"""


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DATA_DIR.mkdir(exist_ok=True)
    conn = db()
    conn.executescript(SCHEMA)
    # миграции для существующих баз
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
    if "is_admin" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
    if "blocked" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0")
    conn.commit()
    seed_demo(conn)
    conn.close()


DEMO_EMAIL = "demo@sociora.ru"
DEMO_PASSWORD = "demo1234"
ADMIN_EMAIL = "admin@sociora.ru"
ADMIN_PASSWORD = "admin1234"


def ensure_user(conn, email, name, password, plan="trial", posts=15, is_admin=0):
    u = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if u:
        return u
    ph, salt = hash_password(password)
    until = (datetime.now() + timedelta(days=PLANS[plan]["days"])).isoformat(timespec="seconds")
    cur = conn.execute(
        "INSERT INTO users (email, name, pass_hash, salt, plan, plan_until, posts_balance, is_admin, created_at) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (email, name, ph, salt, plan, until, PLANS[plan]["posts"], is_admin, now_iso()))
    return conn.execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone()


def seed_demo(conn):
    """Демо- и админ-аккаунты с образцами данных — чтобы можно было войти без регистрации."""
    demo = ensure_user(conn, DEMO_EMAIL, "Демо Пользователь", DEMO_PASSWORD, plan="business")
    ensure_user(conn, ADMIN_EMAIL, "Администратор", ADMIN_PASSWORD, plan="business", is_admin=1)
    has_data = conn.execute("SELECT COUNT(*) c FROM projects WHERE user_id=?", (demo["id"],)).fetchone()["c"]
    if has_data:
        return
    # два демо-проекта с анализом, темами, постами и соцсетями
    for name, niche, website in [
        ("Салон Лилия", "салон красоты", "https://liliya.example"),
        ("Кофейня Тёпло", "кофейня", "https://teplo.example"),
    ]:
        analysis = analyze_business(name, niche, website)
        cur = conn.execute(
            "INSERT INTO projects (user_id, name, niche, website, tone, status, analysis, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (demo["id"], name, niche, website, "дружелюбный", "analyzed",
             json.dumps(analysis, ensure_ascii=False),
             (datetime.now() - timedelta(days=3)).isoformat(timespec="seconds")))
        pid = cur.lastrowid
        for t in analysis["themes"][:10]:
            conn.execute("INSERT INTO themes (project_id, title, rubric) VALUES (?,?,?)",
                         (pid, t["title"], t["rubric"]))
        nets = ["telegram", "vk"]
        for net, channel in (("telegram", "@" + niche.split()[0] + "_demo"), ("vk", "vk.com/demo")):
            conn.execute(
                "INSERT INTO socials (user_id, project_id, network, token, channel, channel_id, created_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (demo["id"], pid, net, "demo-token", channel, "ch_" + secrets.token_hex(3),
                 (datetime.now() - timedelta(days=2)).isoformat(timespec="seconds")))
        # генерируем посты разных статусов
        for i in range(6):
            gen = generate_post(niche, tone="дружелюбный")
            status = ["draft", "approved", "scheduled", "published", "published", "draft"][i]
            when = (datetime.now() + timedelta(days=i)).isoformat(timespec="minutes")
            views = random.randint(120, 1400) if status == "published" else 0
            conn.execute(
                "INSERT INTO posts (user_id, project_id, title, body, image_prompt, rubric, networks, status, "
                "scheduled_at, published_at, views, likes, comments, reposts, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (demo["id"], pid, gen["title"], gen["body"], gen["image_prompt"], gen["rubric"],
                 json.dumps(nets if i % 2 == 0 else nets[:1]), status,
                 when if status == "scheduled" else None,
                 now_iso() if status == "published" else None,
                 views,
                 int(views * random.uniform(0.02, 0.06)) if views else 0,
                 int(views * random.uniform(0.004, 0.012)) if views else 0,
                 int(views * random.uniform(0.002, 0.008)) if views else 0,
                 (datetime.now() - timedelta(days=5 - i)).isoformat(timespec="seconds")))
    conn.execute("INSERT INTO payments (user_id, kind, item, amount, period, status, created_at) VALUES (?,?,?,?,?,?,?)",
                 (demo["id"], "plan", "pro", 4200, "month", "paid",
                  (datetime.now() - timedelta(days=3)).isoformat(timespec="seconds")))
    conn.commit()


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 60000)
    return h.hex(), salt


def check_password(password, salt, expected):
    h, _ = hash_password(password, salt)
    return secrets.compare_digest(h, expected)


# ---------------------------------------------------------------- тарифы

PLANS = {
    "trial": {
        "name": "Trial", "price": 0, "year": 0, "posts": 15, "days": 7,
        "socials": 1, "projects": 1, "themes": 10,
        "desc": "7 дней бесплатно · 15 постов · 1 соцсеть · без карты",
    },
    "start": {
        "name": "Start", "price": 1290, "year": 12900, "posts": 50, "days": 30,
        "socials": 1, "projects": 1, "themes": 10,
        "desc": "50 постов/мес · 1 проект · 1 соцсеть · картинки от ИИ",
    },
    "pro": {
        "name": "Pro", "price": 4200, "year": 41900, "posts": 150, "days": 30,
        "socials": 3, "projects": 1, "themes": 30,
        "desc": "150 постов/мес · 3 соцсети · аналитика · приоритетная поддержка",
    },
    "business": {
        "name": "Business", "price": 11900, "year": 118900, "posts": 300, "days": 30,
        "socials": 3, "projects": 3, "themes": 100,
        "desc": "300 постов/мес · 3 проекта · Premium-картинки · менеджер",
    },
}

PACKS = {
    "10": {"posts": 10, "price": 290},
    "20": {"posts": 20, "price": 490},
    "30": {"posts": 30, "price": 590},
    "100": {"posts": 100, "price": 1590},
    "500": {"posts": 500, "price": 6990},
}

NETWORKS = {
    "telegram": "Telegram",
    "vk": "ВКонтакте",
    "max": "MAX",
}

# ---------------------------------------------------------------- мок-ИИ

NICHES = {
    "beauty": {
        "match": ["салон", "красот", "ногт", "волос", "барбер", "бров", "космет", "массаж", "стилист", "визаж"],
        "label": "салон красоты",
        "audience": "Женщины 25-45, которые следят за собой и ценят своё время",
        "pains": ["недоверие к новым мастерам", "страх испортить волосы/ногти", "нехватка времени на уход"],
        "tone": "тёплый, заботливый, экспертный",
        "themes": [
            ("Экспертный", "3 ошибки домашнего ухода, из-за которых волосы тускнеют к обеду"),
            ("Экспертный", "Как выбрать мастера: 5 признаков, на которые стоит смотреть"),
            ("Продающий", "Акция недели: -20% на окрашивание по технологии X"),
            ("История", "История преображения клиентки за 3 часа работы"),
            ("Вовлекающий", "Опрос: какой уход вы используете каждый день?"),
            ("Полезный", "Чек-лист: чем проверить салон перед первым визитом"),
            ("Продающий", "Ответ на возражение «дорого»: из чего складывается цена услуги"),
            ("Экспертный", "Тренды сезона, которые действительно подходят вашим волосам"),
            ("Закулисье", "Как мы стерилизуем инструменты — показываем процесс"),
            ("Полезный", "Подборка средств для домашнего ухода по типу волос"),
            ("Вовлекающий", "Угадайте цену услуги по фото — конкурс в комментариях"),
            ("История", "Почему клиентка вернулась к нам через 2 года"),
        ],
        "posts": [
            ("Знакомо: утром укладка как из салона, а уже после обеда — «каша»?",
             "Разберём три ошибки, которые делают почти все 👇\n\n1️⃣ Моем шампунем длинные кончики. Его задача — кожа головы, кончикам достаточно пены, которая стекает.\n\n2️⃣ Полотенце + фен на максимальном. Мокрые чешуйки раскрыты — трение ломает их. Только легкое промакивание и средний нагрев.\n\n3️⃣ Никакой термозащиты перед укладкой. Это как загар без солнцезащитного — эффект есть, но счёт потом предъявит длина.\n\nПопробуйте убрать одну ошибку на этой неделе — и напишите, что изменилось 💬"),
            ("«Дорого» — фраза, после которой обычно закрывают сайт. Давайте честно разберём цену.",
             "Из чего складывается стоимость окрашивания:\n\n💊 Краска и уход — профессиональные материалы, а не масс-маркет;\n⏱ Время — 3-4 часа работы мастера;\n🎓 Опыт — чтобы не переделать дважды;\n🔧 Расходники — всё одноразовое.\n\nДешёвый салон экономит на одном из пунктов. Угадайте, на каком.\n\nЗапишитесь на бесплатную консультацию — подберём уход и посчитаем точную цену без сюрпризов."),
        ],
    },
    "coffee": {
        "match": ["кофе", "кофейн", "кафе", "пекар", "ресторан", "бар", "столов", "пицц", "суши", "доставк ед"],
        "label": "кофейня",
        "audience": "Гости 22-40, которые приходят за кофе и атмосферой",
        "pains": ["дома кофе не получается как в кофейне", "хочется новинок меню", "важно время ожидания"],
        "tone": "тёплый, живой, с любовью к продукту",
        "themes": [
            ("Экспертный", "Почему один и тот же кофе дома вкуснее не получается"),
            ("Полезный", "Гид по зёрнам: как выбрать кофе под свой способ"),
            ("Вовлекающий", "Опрос: какой кофе вы пьёте утром?"),
            ("Продающий", "Анонс сезонного меню: новинка недели"),
            ("История", "История одного напитка: от зерна до чашки"),
            ("Закулисье", "Рассказ о команде: кто варит ваш кофе"),
            ("Полезный", "3 ошибки при заваривании в турке"),
            ("Продающий", "Спецпредложение на утро: кофе + круассан"),
            ("Вовлекающий", "Угадайте сорт кофе по описанию вкуса"),
            ("Экспертный", "Молочные альтернативы: что выбрать, если не молоко"),
            ("История", "Как мы выбирали зерно для нашей основной смеси"),
            ("Полезный", "Сколько кофе безопасно пить в день — короткий разбор"),
        ],
        "posts": [
            ("Загадка, которую нам задают каждую неделю: «Рецепт тот же, зёрна те же — а вкус не тот».",
             "Обычно дело в трёх мелочах 👇\n\n☕ Вода. Кофе на 98% вода. Слишком твёрдая — вкус «плоский», слишком мягкая — кислый. Золотая середина — 75–150 ppm.\n\n⚖️ Пропорции. Слегка переборщили с массой — и напиток стал горьким. Весы решают больше, чем способ.\n\n⏱️ Время. Перемололи заранее? Через 15 минут аромат уже ушёл. Мелем перед каждым проливом.\n\nПроверьте эти три пункта — и напишите, получилось ли ❤️"),
            ("Сезонное меню уже на баре — и одно из новинок стоит попробовать первым.",
             "Новый напиток месяца — с тёплыми пряными нотами и карамельной сладостью. Готовим на нашей базовой смеси, которую обжариваем небольшими партиями.\n\n🎃 Идеально для прохладного утра и долгих разговоров.\n\nПервая чашка новинкам — по цене обычного капучино до воскресенья. Заходите, пока не разобрали ☕"),
        ],
    },
    "fitness": {
        "match": ["фитнес", "спорт", "тренир", "зал", "йога", "танц", "бег", "плаван", "единобор"],
        "label": "фитнес-клуб",
        "audience": "Мужчины и женщины 25-45, которые хотят результата без травм",
        "pains": ["страх заболеть на тренировке", "нет времени", "не видит прогресса"],
        "tone": "энергичный, мотивирующий, экспертный",
        "themes": [
            ("Экспертный", "5 минут разминки, которые спасут спину на тренировке"),
            ("Полезный", "Чек-лист первой тренировки: что взять с собой"),
            ("Вовлекающий", "Опрос: утренние или вечерние тренировки?"),
            ("Продающий", "Бесплатная пробная тренировка на этой неделе"),
            ("История", "Как клиент с нуля пробежал первые 5 км за 8 недель"),
            ("Экспертный", "3 мифа о жиросжигании, в которые пора перестать верить"),
            ("Полезный", "Комплекс на 10 минут дома, когда нет сил на зал"),
            ("Закулисье", "Как мы составляем программу под цель клиента"),
            ("Продающий", "Приведи друга — месяц в подарок"),
            ("Вовлекающий", "Угадайте упражнение по описанию — конкурс"),
            ("Экспертный", "Восстановление: почему сон важнее тренировки"),
            ("История", "Отзыв клиентки: минус 8 кг за 4 месяца без диет"),
        ],
        "posts": [
            ("«У меня нет времени разминаться» — знакомая фраза? Именно она приводит к первым травмам.",
             "Вот комплекс на 5 минут, который делаем перед каждой тренировкой 👇\n\n1️⃣ Круговые вращения суставами — 1 минута. Шея, плечи, таз, колени.\n\n2️⃣ Кошка-корова — 10 повторов. Разогреваем позвоночник в двух плоскостях.\n\n3️⃣ Мост с удержанием — 3 подхода по 20 секунд. Включаем ягодицы и заднюю цепь.\n\n4️⃣ Лёгкий скакалка или stepping — 2 минуты. Пульс до 110–120, не больше.\n\n5️⃣ Глубокий присед с удержанием — 30 секунд. Проверяем мобильность.\n\nПять минут — и тренировка идёт вдвое продуктивнее. Сохраняйте, чтобы не потерять 📌"),
            ("Результат приходит не на тренировке, а между тренировками — в восстановлении.",
             "Три правила, без которых прогресс встаёт:\n\n😴 Сон 7-8 часов. Недосып = кортизол = медленное восстановление.\n\n🥩 Белок 1.6-2 г на кг веса. Мышцы строятся из него, а не из желания.\n\n🚶 Дни отдыха. 7 тренировок в неделю без пауз ведут не к результату, а к перетренированности.\n\nНапишите в комментариях, сколько спите в среднем — разберём ваше восстановление 💬"),
        ],
    },
    "generic": {
        "match": [],
        "label": "малый бизнес",
        "audience": "Ваши клиенты: те, кто ищет решение своей задачи",
        "pains": ["недоверие к новым исполнителям", "страх переплатить", "нехватка времени"],
        "tone": "спокойный экспертный",
        "themes": [
            ("Экспертный", "Разбор: как мы решаем главную задачу клиентов в нише «{niche}»"),
            ("Экспертный", "3 ошибки, которые совершают почти все в сфере «{niche}»"),
            ("Полезный", "Чек-лист: на что обратить внимание перед покупкой/заказом"),
            ("Продающий", "Наша услуга X: что входит и сколько стоит"),
            ("История", "Кейс: как клиент решил задачу с нашей помощью"),
            ("Вовлекающий", "Опрос: что для вас важнее при выборе — цена или качество?"),
            ("Полезный", "Ответы на 5 частых вопросов новых клиентов"),
            ("Продающий", "Спецпредложение месяца: условия и сроки"),
            ("Закулисье", "Как устроена наша работа изнутри — коротко"),
            ("Экспертный", "Мифы о сфере «{niche}», в которые пора перестать верить"),
            ("История", "Почему клиент выбрал нас после сравнения с тремя конкурентами"),
            ("Вовлекающий", "Вопрос аудитории: что бы вы изменили в нашем сервисе?"),
        ],
        "posts": [
            ("Сегодня разберём типичную ситуацию в нише «{niche}» — с ней к нам приходят почти каждый день.",
             "В чём проблема 👇\n\nКлиенты приходят с одним и тем же запросом, но объясняют его по-разному. И пока разбираешься, что именно нужно, время уходит.\n\nКак мы это решаем:\n\n1️⃣ Сначала диагностика — 10 минут, чтобы понять задачу, а не угадать.\n\n2️⃣ Показываем вариант решения с ценой и сроками заранее. Без сюрпризов.\n\n3️⃣ Держим связь на каждом этапе — вы всегда знаете, что происходит.\n\nРезультат: меньше хаоса, больше предсказуемости. Если узнали свою ситуацию — напишите нам 💬"),
            ("Вопрос, который нам задают чаще всего: «Чем вы отличаетесь от конкурентов?»",
             "Честный ответ — тремя вещами:\n\n📐 Подход. Мы не продаём «как у всех», а подбираем решение под задачу.\n\n⏱ Сроки. Фиксируем их в договоре и держим слово.\n\n💬 Поддержка. После сделки не исчезаем — отвечаем и помогаем.\n\nВсё остальное — детали. А если вам нужен только低价 — увы, мы не про это.\n\nНапишите свою задачу — скажем, сможем ли помочь, ещё до встречи."),
        ],
    },
}

TONE_MODIFIERS = {
    "дружелюбный": "Пишу тепло и по-человечески, с лёгким юмором.",
    "экспертный": "Пишу уверенно и по делу, с фактами и цифрами.",
    "дерзкий": "Пишу смело, с провокационными первыми строками.",
    "спокойный": "Пишу ровно и уважительно, без давления.",
    "мотивирующий": "Пишу энергично, с призывами к действию.",
}


def niche_category(niche):
    n = (niche or "").lower()
    for key, data in NICHES.items():
        for kw in data["match"]:
            if kw and kw in n:
                return key
    return "generic"


def analyze_business(name, niche, website):
    cat = niche_category(niche)
    data = NICHES[cat]
    label = data["label"] if cat != "generic" else (niche or "малый бизнес")
    themes = []
    for rubric, title in data["themes"]:
        themes.append({"rubric": rubric, "title": title.replace("{niche}", label)})
    random.shuffle(themes)
    return {
        "category": cat,
        "niche_label": label,
        "audience": data["audience"],
        "pains": data["pains"],
        "tone": data["tone"],
        "summary": (
            "ИИ проанализировал %s%s и определил нишу «%s». Основная аудитория: %s. "
            "Ключевые боли: %s. Рекомендуемый тон: %s."
            % (name, (" и сайт " + website) if website else "", label,
               data["audience"].lower(), ", ".join(data["pains"]), data["tone"])
        ),
        "recommendation": "Начинайте с 2 экспертных и 1 полезного поста в неделю — это быстрее всего даёт доверие и охваты.",
        "themes": themes,
    }


def generate_post(niche, rubric=None, tone=None, comment=None):
    cat = niche_category(niche)
    data = NICHES[cat]
    templates = data["posts"]
    if comment:
        t = templates[(random.randint(0, len(templates) - 1))]
        title, body = t
        body += "\n\n✏️ Учтена правка: «%s» — переписал с учётом замечания." % comment
    else:
        t = random.choice(templates)
        title, body = t
    if tone and tone in TONE_MODIFIERS:
        body += "\n\n🎙 " + TONE_MODIFIERS[tone]
    label = data["label"] if cat != "generic" else (niche or "бизнес")
    title = title.replace("{niche}", label)
    body = body.replace("{niche}", label)
    body = body.replace("низкой ценой", "низкой ценой").replace("низкой", "доступной")
    image_prompt = "Иллюстрация к посту про %s, современный стиль, тёплые цвета, без текста" % label
    return {"title": title, "body": body, "image_prompt": image_prompt, "rubric": rubric or "ИИ"}

# ---------------------------------------------------------------- API-утилиты


def json_bytes(obj, status=200):
    return json.dumps(obj, ensure_ascii=False).encode("utf-8"), status


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def current_user(handler):
    """Текущий пользователь по cookie или заголовку Authorization: Bearer <token>.

    Bearer нужен потому, что preview-прокси не пробрасывает Set-Cookie браузеру:
    без токена сессия терялась между загрузками страниц кабинета.
    """
    token = None
    cookie = handler.headers.get("Cookie", "")
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith("session_token="):
            token = part[len("session_token="):]
            break
    if not token:
        auth = handler.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[len("Bearer "):].strip()
    if not token:
        return None
    conn = db()
    row = conn.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?", (token,)
    ).fetchone()
    conn.close()
    return row


def require_admin(user):
    if not user or not user["is_admin"]:
        raise ApiError("Доступно только администратору", 403)
    return user


def user_dict(u):
    plan = PLANS.get(u["plan"], PLANS["trial"])
    active = True
    days_left = None
    if u["plan"] != "trial" and u["plan_until"]:
        try:
            active = datetime.fromisoformat(u["plan_until"]) > datetime.now()
            days_left = max(0, (datetime.fromisoformat(u["plan_until"]) - datetime.now()).days)
        except ValueError:
            pass
    return {
        "id": u["id"], "email": u["email"], "name": u["name"],
        "plan": u["plan"], "plan_name": plan["name"], "plan_desc": plan["desc"],
        "plan_active": active, "days_left": days_left,
        "is_admin": bool(u["is_admin"]), "blocked": bool(u["blocked"]),
        "posts_balance": u["posts_balance"], "posts_total": u["posts_total"],
        "tone": u["tone"], "created_at": u["created_at"],
        "limits": {k: plan[k] for k in ("posts", "socials", "projects", "themes")},
    }


def spend_post(conn, user_id):
    u = conn.execute("SELECT posts_balance FROM users WHERE id = ?", (user_id,)).fetchone()
    if not u or u["posts_balance"] <= 0:
        raise ApiError("Закончились посты на балансе. Выберите тариф или купите пакет.", 402)
    conn.execute(
        "UPDATE users SET posts_balance = posts_balance - 1, posts_total = posts_total + 1 WHERE id = ?",
        (user_id,),
    )


def post_dict(p):
    return dict(p)


# ---------------------------------------------------------------- API-обработчики

def api_register(handler, body):
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()
    password = body.get("password") or ""
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise ApiError("Некорректный email")
    if len(name) < 2:
        raise ApiError("Укажите имя (минимум 2 символа)")
    if len(password) < 6:
        raise ApiError("Пароль минимум 6 символов")
    conn = db()
    if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        conn.close()
        raise ApiError("Такой email уже зарегистрирован — войдите", 409)
    ph, salt = hash_password(password)
    trial_until = (datetime.now() + timedelta(days=PLANS["trial"]["days"])).isoformat(timespec="seconds")
    cur = conn.execute(
        "INSERT INTO users (email, name, pass_hash, salt, plan, plan_until, posts_balance, created_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (email, name, ph, salt, "trial", trial_until, PLANS["trial"]["posts"], now_iso()),
    )
    token = secrets.token_urlsafe(32)
    conn.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)",
                 (token, cur.lastrowid, now_iso()))
    conn.commit()
    u = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return 200, {"ok": True, "token": token, "user": user_dict(u)}, {"Set-Cookie": "session_token=%s; Path=/; HttpOnly; SameSite=Lax" % token}


def api_login(handler, body):
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    conn = db()
    u = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not u or not check_password(password, u["salt"], u["pass_hash"]):
        conn.close()
        raise ApiError("Неверный email или пароль", 401)
    if u["blocked"]:
        conn.close()
        raise ApiError("Аккаунт заблокирован. Напишите в поддержку: support@sociora.ru", 403)
    token = secrets.token_urlsafe(32)
    conn.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)",
                 (token, u["id"], now_iso()))
    conn.commit()
    conn.close()
    return 200, {"ok": True, "token": token, "user": user_dict(u)}, {"Set-Cookie": "session_token=%s; Path=/; HttpOnly; SameSite=Lax" % token}


def api_logout(handler, body, user):
    token = None
    auth = handler.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[len("Bearer "):].strip()
    for part in handler.headers.get("Cookie", "").split(";"):
        part = part.strip()
        if part.startswith("session_token="):
            token = part[len("session_token="):]
            break
    if token:
        conn = db()
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        conn.close()
    return 200, {"ok": True}, {"Set-Cookie": "session_token=; Path=/; HttpOnly; Max-Age=0"}


def api_me(handler, body, user):
    conn = db()
    stats = {
        "projects": conn.execute("SELECT COUNT(*) c FROM projects WHERE user_id=?", (user["id"],)).fetchone()["c"],
        "posts_draft": conn.execute("SELECT COUNT(*) c FROM posts WHERE user_id=? AND status='draft'", (user["id"],)).fetchone()["c"],
        "posts_scheduled": conn.execute("SELECT COUNT(*) c FROM posts WHERE user_id=? AND status='scheduled'", (user["id"],)).fetchone()["c"],
        "posts_published": conn.execute("SELECT COUNT(*) c FROM posts WHERE user_id=? AND status='published'", (user["id"],)).fetchone()["c"],
        "socials": conn.execute("SELECT COUNT(*) c FROM socials WHERE user_id=?", (user["id"],)).fetchone()["c"],
        "views": conn.execute("SELECT COALESCE(SUM(views),0) s FROM posts WHERE user_id=?", (user["id"],)).fetchone()["s"],
    }
    conn.close()
    return 200, {"ok": True, "user": user_dict(user), "stats": stats}


def api_projects_list(handler, body, user):
    conn = db()
    rows = conn.execute("SELECT * FROM projects WHERE user_id=? ORDER BY id DESC", (user["id"],)).fetchall()
    projects = []
    for r in rows:
        d = dict(r)
        d["posts_count"] = conn.execute("SELECT COUNT(*) c FROM posts WHERE project_id=?", (r["id"],)).fetchone()["c"]
        d["socials_count"] = conn.execute("SELECT COUNT(*) c FROM socials WHERE project_id=?", (r["id"],)).fetchone()["c"]
        d["analysis"] = json.loads(r["analysis"]) if r["analysis"] else None
        projects.append(d)
    conn.close()
    return 200, {"ok": True, "projects": projects}


def api_project_create(handler, body, user):
    name = (body.get("name") or "").strip()
    niche = (body.get("niche") or "").strip()
    website = (body.get("website") or "").strip()
    tone = (body.get("tone") or user["tone"]).strip()
    if not name or not niche:
        raise ApiError("Укажите название проекта и нишу")
    conn = db()
    limit = PLANS[user["plan"]]["projects"]
    count = conn.execute("SELECT COUNT(*) c FROM projects WHERE user_id=?", (user["id"],)).fetchone()["c"]
    if count >= limit:
        conn.close()
        raise ApiError("По вашему тарифу доступно проектов: %d. Перейдите на Pro или Business." % limit, 402)
    cur = conn.execute(
        "INSERT INTO projects (user_id, name, niche, website, tone, created_at) VALUES (?,?,?,?,?,?)",
        (user["id"], name, niche, website, tone, now_iso()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM projects WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return 200, {"ok": True, "project": dict(row)}


def api_project_get(handler, body, user, project_id):
    conn = db()
    p = conn.execute("SELECT * FROM projects WHERE id=? AND user_id=?", (project_id, user["id"])).fetchone()
    if not p:
        conn.close()
        raise ApiError("Проект не найден", 404)
    themes = [dict(t) for t in conn.execute("SELECT * FROM themes WHERE project_id=? ORDER BY id", (project_id,)).fetchall()]
    posts = [dict(x) for x in conn.execute("SELECT * FROM posts WHERE project_id=? ORDER BY id DESC LIMIT 30", (project_id,)).fetchall()]
    socials = [dict(s) for s in conn.execute("SELECT * FROM socials WHERE project_id=?", (project_id,)).fetchall()]
    conn.close()
    d = dict(p)
    d["analysis"] = json.loads(p["analysis"]) if p["analysis"] else None
    return 200, {"ok": True, "project": d, "themes": themes, "posts": posts, "socials": socials}


def api_project_delete(handler, body, user, project_id):
    conn = db()
    p = conn.execute("SELECT * FROM projects WHERE id=? AND user_id=?", (project_id, user["id"])).fetchone()
    if not p:
        conn.close()
        raise ApiError("Проект не найден", 404)
    conn.execute("DELETE FROM themes WHERE project_id=?", (project_id,))
    conn.execute("DELETE FROM posts WHERE project_id=?", (project_id,))
    conn.execute("DELETE FROM socials WHERE project_id=?", (project_id,))
    conn.execute("DELETE FROM projects WHERE id=?", (project_id,))
    conn.commit()
    conn.close()
    return 200, {"ok": True}


def api_project_analyze(handler, body, user, project_id):
    conn = db()
    p = conn.execute("SELECT * FROM projects WHERE id=? AND user_id=?", (project_id, user["id"])).fetchone()
    if not p:
        conn.close()
        raise ApiError("Проект не найден", 404)
    analysis = analyze_business(p["name"], p["niche"], p["website"])
    conn.execute("DELETE FROM themes WHERE project_id=?", (project_id,))
    limit = PLANS[user["plan"]]["themes"]
    for t in analysis["themes"][:limit]:
        conn.execute("INSERT INTO themes (project_id, title, rubric) VALUES (?,?,?)",
                     (project_id, t["title"], t["rubric"]))
    conn.execute("UPDATE projects SET status='analyzed', analysis=? WHERE id=?",
                 (json.dumps(analysis, ensure_ascii=False), project_id))
    conn.commit()
    themes = [dict(t) for t in conn.execute("SELECT * FROM themes WHERE project_id=? ORDER BY id", (project_id,)).fetchall()]
    conn.close()
    return 200, {"ok": True, "analysis": analysis, "themes": themes}


def api_posts_list(handler, body, user, query):
    status = (query.get("status") or [""])[0]
    conn = db()
    sql = "SELECT p.*, pr.name AS project_name FROM posts p JOIN projects pr ON pr.id = p.project_id WHERE p.user_id=?"
    params = [user["id"]]
    if status:
        sql += " AND p.status=?"
        params.append(status)
    sql += " ORDER BY p.id DESC LIMIT 100"
    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    conn.close()
    return 200, {"ok": True, "posts": rows}


def api_post_generate(handler, body, user):
    project_id = int(body.get("project_id") or 0)
    theme_id = body.get("theme_id")
    rubric = (body.get("rubric") or "").strip() or None
    conn = db()
    p = conn.execute("SELECT * FROM projects WHERE id=? AND user_id=?", (project_id, user["id"])).fetchone()
    if not p:
        conn.close()
        raise ApiError("Проект не найден", 404)
    if theme_id:
        t = conn.execute("SELECT * FROM themes WHERE id=? AND project_id=?", (theme_id, project_id)).fetchone()
        if t:
            rubric = t["rubric"]
            conn.execute("UPDATE themes SET used=1 WHERE id=?", (theme_id,))
    spend_post(conn, user["id"])
    gen = generate_post(p["niche"], rubric=rubric, tone=p["tone"])
    cur = conn.execute(
        "INSERT INTO posts (user_id, project_id, title, body, image_prompt, rubric, status, created_at) "
        "VALUES (?,?,?,?,?,?,'draft',?)",
        (user["id"], project_id, gen["title"], gen["body"], gen["image_prompt"], gen["rubric"], now_iso()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM posts WHERE id=?", (cur.lastrowid,)).fetchone()
    u = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    conn.close()
    return 200, {"ok": True, "post": post_dict(row), "user": user_dict(u)}


def api_post_update(handler, body, user, post_id):
    conn = db()
    p = conn.execute("SELECT * FROM posts WHERE id=? AND user_id=?", (post_id, user["id"])).fetchone()
    if not p:
        conn.close()
        raise ApiError("Пост не найден", 404)
    title = (body.get("title") or p["title"]).strip()
    post_body = body.get("body") or p["body"]
    conn.execute("UPDATE posts SET title=?, body=? WHERE id=?", (title, post_body, post_id))
    conn.commit()
    row = conn.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone()
    conn.close()
    return 200, {"ok": True, "post": post_dict(row)}


def api_post_regenerate(handler, body, user, post_id):
    comment = (body.get("comment") or "").strip()
    conn = db()
    p = conn.execute("SELECT * FROM posts WHERE id=? AND user_id=?", (post_id, user["id"])).fetchone()
    if not p:
        conn.close()
        raise ApiError("Пост не найден", 404)
    spend_post(conn, user["id"])
    pr = conn.execute("SELECT * FROM projects WHERE id=?", (p["project_id"],)).fetchone()
    gen = generate_post(pr["niche"], rubric=p["rubric"], tone=pr["tone"], comment=comment or None)
    conn.execute("UPDATE posts SET title=?, body=?, image_prompt=? WHERE id=?",
                 (gen["title"], gen["body"], gen["image_prompt"], post_id))
    conn.commit()
    row = conn.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone()
    u = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    conn.close()
    return 200, {"ok": True, "post": post_dict(row), "user": user_dict(u)}


def api_post_status(handler, body, user, post_id):
    action = (body.get("action") or "").strip()
    conn = db()
    p = conn.execute("SELECT * FROM posts WHERE id=? AND user_id=?", (post_id, user["id"])).fetchone()
    if not p:
        conn.close()
        raise ApiError("Пост не найден", 404)
    if action == "approve":
        conn.execute("UPDATE posts SET status='approved' WHERE id=?", (post_id,))
    elif action == "draft":
        conn.execute("UPDATE posts SET status='draft' WHERE id=?", (post_id,))
    elif action == "schedule":
        when = (body.get("scheduled_at") or "").strip()
        if not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", when):
            conn.close()
            raise ApiError("Укажите дату и время в формате ГГГГ-ММ-ДДTЧЧ:ММ")
        networks = body.get("networks") or []
        conn.execute("UPDATE posts SET status='scheduled', scheduled_at=?, networks=? WHERE id=?",
                     (when, json.dumps(networks), post_id))
    elif action == "publish":
        views = random.randint(120, 1400)
        conn.execute(
            "UPDATE posts SET status='published', published_at=?, views=?, likes=?, comments=?, reposts=? WHERE id=?",
            (now_iso(), views, int(views * random.uniform(0.02, 0.06)),
             int(views * random.uniform(0.004, 0.012)), int(views * random.uniform(0.002, 0.008)), post_id),
        )
    else:
        conn.close()
        raise ApiError("Неизвестное действие")
    conn.commit()
    row = conn.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone()
    conn.close()
    return 200, {"ok": True, "post": post_dict(row)}


def api_post_delete(handler, body, user, post_id):
    conn = db()
    p = conn.execute("SELECT * FROM posts WHERE id=? AND user_id=?", (post_id, user["id"])).fetchone()
    if not p:
        conn.close()
        raise ApiError("Пост не найден", 404)
    conn.execute("DELETE FROM posts WHERE id=?", (post_id,))
    conn.commit()
    conn.close()
    return 200, {"ok": True}


def api_socials_list(handler, body, user):
    conn = db()
    rows = [dict(r) for r in conn.execute(
        "SELECT s.*, p.name AS project_name FROM socials s JOIN projects p ON p.id=s.project_id "
        "WHERE s.user_id=? ORDER BY s.id DESC", (user["id"],)).fetchall()]
    projects = [dict(r) for r in conn.execute("SELECT id, name FROM projects WHERE user_id=?", (user["id"],)).fetchall()]
    conn.close()
    return 200, {"ok": True, "socials": rows, "projects": projects}


def api_social_connect(handler, body, user):
    network = (body.get("network") or "").strip().lower()
    token = (body.get("token") or "").strip()
    channel = (body.get("channel") or "").strip()
    project_id = int(body.get("project_id") or 0)
    if network not in NETWORKS:
        raise ApiError("Поддерживаются Telegram, ВКонтакте и MAX")
    if not token:
        raise ApiError("Укажите токен доступа")
    if not channel:
        raise ApiError("Укажите канал/сообщество")
    conn = db()
    p = conn.execute("SELECT * FROM projects WHERE id=? AND user_id=?", (project_id, user["id"])).fetchone()
    if not p:
        conn.close()
        raise ApiError("Проект не найден", 404)
    limit = PLANS[user["plan"]]["socials"]
    count = conn.execute("SELECT COUNT(*) c FROM socials WHERE user_id=?", (user["id"],)).fetchone()["c"]
    if count >= limit:
        conn.close()
        raise ApiError("По вашему тарифу доступно соцсетей: %d." % limit, 402)
    # мок-проверка подключения
    channel_id = "ch_" + secrets.token_hex(4)
    cur = conn.execute(
        "INSERT INTO socials (user_id, project_id, network, token, channel, channel_id, created_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (user["id"], project_id, network, token, channel, channel_id, now_iso()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM socials WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return 200, {"ok": True, "social": dict(row), "message": "%s подключен: %s (проверка связи пройдена)" % (NETWORKS[network], channel)}


def api_social_delete(handler, body, user, social_id):
    conn = db()
    s = conn.execute("SELECT * FROM socials WHERE id=? AND user_id=?", (social_id, user["id"])).fetchone()
    if not s:
        conn.close()
        raise ApiError("Подключение не найдено", 404)
    conn.execute("DELETE FROM socials WHERE id=?", (social_id,))
    conn.commit()
    conn.close()
    return 200, {"ok": True}


def api_analytics(handler, body, user, query):
    network = (query.get("network") or ["all"])[0]
    conn = db()
    sql = "SELECT * FROM posts WHERE user_id=? AND status='published'"
    params = [user["id"]]
    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    conn.close()

    def stats_of(items):
        views = sum(i["views"] for i in items)
        likes = sum(i["likes"] for i in items)
        comments = sum(i["comments"] for i in items)
        reposts = sum(i["reposts"] for i in items)
        subs = int(views * 0.28) if views else 0
        er = round((likes + comments + reposts) / views * 100, 2) if views else 0
        return {"views": views, "likes": likes, "comments": comments,
                "reposts": reposts, "subscribers": subs, "er": er}

    if network == "all":
        items = rows
    else:
        items = [r for r in rows if r.get("networks") and network in json.loads(r["networks"])] or rows
    overall = stats_of(items)

    days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    series = []
    base = max(40, overall["views"] // 8)
    for i, d in enumerate(days):
        series.append({"day": d, "views": int(base * (0.6 + 0.5 * random.random()) + i * base * 0.05)})

    top = sorted(items, key=lambda r: r["views"], reverse=True)[:5]
    rubrics = {}
    for r in items:
        rubrics[r["rubric"] or "ИИ"] = rubrics.get(r["rubric"] or "ИИ", 0) + r["views"]
    voice = sorted(({"name": k, "views": v} for k, v in rubrics.items()), key=lambda x: -x["views"])[:4]
    mx = voice[0]["views"] if voice else 1
    for v in voice:
        v["pct"] = max(8, int(v["views"] / mx * 100))

    if overall["views"]:
        best_day = max(series, key=lambda s: s["views"])["day"]
        insight = ("Охваты растут. Лучший день недели — %s. %s"
                   % (best_day, "Добавьте ещё один слот в это время." if overall["er"] < 5
                      else "Вовлечённость выше нормы — масштабируйте удачный формат."))
    else:
        insight = "Пока нет опубликованных постов. Одобрите и опубликуйте первый пост — аналитика появится автоматически."
    return 200, {"ok": True, "network": network, "overall": overall,
                 "series": series, "top_posts": top, "voice": voice, "insight": insight}


def api_tariffs(handler, body, user):
    return 200, {"ok": True, "plans": PLANS, "packs": PACKS, "current": user["plan"]}


def api_tariff_choose(handler, body, user):
    plan = (body.get("plan") or "").strip().lower()
    period = (body.get("period") or "month").strip()
    if plan not in PLANS or plan == "trial":
        raise ApiError("Неизвестный тариф")
    p = PLANS[plan]
    amount = p["year"] if period == "year" else p["price"]
    days = 365 if period == "year" else 30
    until = (datetime.now() + timedelta(days=days)).isoformat(timespec="seconds")
    conn = db()
    conn.execute("UPDATE users SET plan=?, plan_until=?, posts_balance=? WHERE id=?",
                 (plan, until, p["posts"], user["id"]))
    conn.execute("INSERT INTO payments (user_id, kind, item, amount, period, created_at) VALUES (?,?,?,?,?,?)",
                 (user["id"], "plan", plan, amount, period, now_iso()))
    conn.commit()
    u = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    conn.close()
    return 200, {"ok": True, "user": user_dict(u),
                 "message": "Тариф %s активирован (демо-оплата %d ₽ — реальное списание не производится)" % (p["name"], amount)}


def api_pack_buy(handler, body, user):
    pack = (body.get("pack") or "").strip()
    if pack not in PACKS:
        raise ApiError("Неизвестный пакет")
    pk = PACKS[pack]
    conn = db()
    conn.execute("UPDATE users SET posts_balance = posts_balance + ? WHERE id=?", (pk["posts"], user["id"]))
    conn.execute("INSERT INTO payments (user_id, kind, item, amount, period, created_at) VALUES (?,?,?,?,?,?)",
                 (user["id"], "pack", pack, pk["price"], None, now_iso()))
    conn.commit()
    u = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    conn.close()
    return 200, {"ok": True, "user": user_dict(u),
                 "message": "Пакет +%d постов добавлен (демо-оплата %d ₽)" % (pk["posts"], pk["price"])}


def api_payments(handler, body, user):
    conn = db()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 50", (user["id"],)).fetchall()]
    conn.close()
    return 200, {"ok": True, "payments": rows}


def api_settings_update(handler, body, user):
    name = (body.get("name") or user["name"]).strip() or user["name"]
    tone = (body.get("tone") or user["tone"]).strip()
    conn = db()
    conn.execute("UPDATE users SET name=?, tone=? WHERE id=?", (name, tone, user["id"]))
    conn.commit()
    u = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    conn.close()
    return 200, {"ok": True, "user": user_dict(u), "message": "Настройки сохранены"}


def api_change_password(handler, body, user):
    old = body.get("old_password") or ""
    new = body.get("new_password") or ""
    if len(new) < 6:
        raise ApiError("Новый пароль минимум 6 символов")
    if not check_password(old, user["salt"], user["pass_hash"]):
        raise ApiError("Текущий пароль неверный", 401)
    ph, salt = hash_password(new)
    conn = db()
    conn.execute("UPDATE users SET pass_hash=?, salt=? WHERE id=?", (ph, salt, user["id"]))
    conn.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
    conn.commit()
    conn.close()
    return 200, {"ok": True, "message": "Пароль изменён — войдите заново"}, {"Set-Cookie": "session_token=; Path=/; HttpOnly; Max-Age=0"}


def api_week_plan(handler, body, user):
    """Составить контент-план на неделю: 7 постов в статусе scheduled."""
    project_id = int(body.get("project_id") or 0)
    start = (body.get("start_date") or datetime.now().date().isoformat()).strip()
    conn = db()
    p = conn.execute("SELECT * FROM projects WHERE id=? AND user_id=?", (project_id, user["id"])).fetchone()
    if not p:
        conn.close()
        raise ApiError("Проект не найден", 404)
    rubrics = ["Экспертный", "Полезный", "История", "Вовлекающий", "Продающий", "Развлекательный", "Экспертный"]
    created = []
    try:
        for i, rubric in enumerate(rubrics):
            spend_post(conn, user["id"])
            gen = generate_post(p["niche"], rubric=rubric, tone=p["tone"])
            when = "%sT%02d:00" % ((datetime.fromisoformat(start) + timedelta(days=i)).date().isoformat(),
                                   9 + (i % 3) * 5)
            cur = conn.execute(
                "INSERT INTO posts (user_id, project_id, title, body, image_prompt, rubric, status, scheduled_at, networks, created_at) "
                "VALUES (?,?,?,?,?,?, 'scheduled', ?, '[]', ?)",
                (user["id"], project_id, gen["title"], gen["body"], gen["image_prompt"], gen["rubric"], when, now_iso()),
            )
            created.append(cur.lastrowid)
    except ApiError:
        pass
    conn.commit()
    u = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    conn.close()
    return 200, {"ok": True, "created": created, "user": user_dict(u),
                 "message": "Контент-план на неделю составлен: %d постов в расписании" % len(created)}

# ---------------------------------------------------------------- маршрутизация


# ---------------------------------------------------------------- Админ-панель

def api_admin_stats(handler, body, user):
    require_admin(user)
    conn = db()
    def one(sql):
        return conn.execute(sql).fetchone()[0]
    stats = {
        "users": one("SELECT COUNT(*) FROM users"),
        "blocked": one("SELECT COUNT(*) FROM users WHERE blocked = 1"),
        "projects": one("SELECT COUNT(*) FROM projects"),
        "posts": one("SELECT COUNT(*) FROM posts"),
        "published": one("SELECT COUNT(*) FROM posts WHERE status = 'published'"),
        "socials": one("SELECT COUNT(*) FROM socials"),
        "views": one("SELECT COALESCE(SUM(views),0) FROM posts"),
        "revenue": one("SELECT COALESCE(SUM(amount),0) FROM payments"),
    }
    stats["by_plan"] = {}
    for p in PLANS:
        stats["by_plan"][p] = one("SELECT COUNT(*) FROM users WHERE plan = '%s'" % p)
    stats["recent_users"] = [dict(r) for r in conn.execute(
        "SELECT id, email, name, plan, created_at FROM users ORDER BY id DESC LIMIT 10")]
    conn.close()
    return 200, {"ok": True, "stats": stats}


def api_admin_users(handler, body, user):
    require_admin(user)
    conn = db()
    rows = [dict(r) for r in conn.execute(
        "SELECT u.*, (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects, "
        "(SELECT COUNT(*) FROM posts t WHERE t.user_id = u.id) AS posts "
        "FROM users u ORDER BY u.id DESC")]
    conn.close()
    return 200, {"ok": True, "users": rows}


def api_admin_user_action(handler, body, user, user_id):
    require_admin(user)
    action = body.get("action")
    conn = db()
    target = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not target:
        conn.close()
        raise ApiError("Пользователь не найден", 404)
    message = ""
    if action == "block":
        conn.execute("UPDATE users SET blocked = ? WHERE id = ?", (1 if body.get("blocked") else 0, user_id))
        message = "Аккаунт %s %s" % (target["email"], "заблокирован" if body.get("blocked") else "разблокирован")
        # закрываем все сессии заблокированного
        if body.get("blocked"):
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    elif action == "plan":
        plan = body.get("plan")
        if plan not in PLANS:
            conn.close()
            raise ApiError("Неизвестный тариф", 400)
        until = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S") if plan != "trial" else None
        conn.execute("UPDATE users SET plan = ?, plan_until = ?, posts_balance = posts_balance + ? WHERE id = ?",
                     (plan, until, PLANS[plan]["posts"], user_id))
        message = "Тариф для %s изменён на %s (+%d постов)" % (target["email"], plan, PLANS[plan]["posts"])
    elif action == "balance":
        delta = int(body.get("posts", 0))
        conn.execute("UPDATE users SET posts_balance = MAX(0, posts_balance + ?) WHERE id = ?", (delta, user_id))
        message = "Баланс %s изменён на %+d постов" % (target["email"], delta)
    elif action == "admin":
        new_val = 0 if target["is_admin"] else 1
        if target["id"] == user["id"] and new_val == 0:
            conn.close()
            raise ApiError("Нельзя снять права администратора с самого себя", 400)
        conn.execute("UPDATE users SET is_admin = ? WHERE id = ?", (new_val, user_id))
        message = "Права администратора для %s: %s" % (target["email"], "выданы" if new_val else "сняты")
    else:
        conn.close()
        raise ApiError("Неизвестное действие", 400)
    conn.commit()
    conn.close()
    return 200, {"ok": True, "message": message}


def api_admin_posts(handler, body, user):
    require_admin(user)
    conn = db()
    rows = [dict(r) for r in conn.execute(
        "SELECT t.*, u.email AS user_email, p.name AS project_name FROM posts t "
        "LEFT JOIN users u ON u.id = t.user_id LEFT JOIN projects p ON p.id = t.project_id "
        "ORDER BY t.id DESC LIMIT 200")]
    conn.close()
    return 200, {"ok": True, "posts": rows}


def api_admin_payments(handler, body, user):
    require_admin(user)
    conn = db()
    rows = [dict(r) for r in conn.execute(
        "SELECT pay.*, u.email AS user_email FROM payments pay "
        "LEFT JOIN users u ON u.id = pay.user_id ORDER BY pay.id DESC LIMIT 200")]
    conn.close()
    return 200, {"ok": True, "payments": rows}


API_ROUTES = [
    ("POST", r"^/api/register$", api_register, False),
    ("POST", r"^/api/login$", api_login, False),
    ("POST", r"^/api/logout$", api_logout, False),
    ("GET", r"^/api/me$", api_me, True),
    ("GET", r"^/api/projects$", api_projects_list, True),
    ("POST", r"^/api/projects$", api_project_create, True),
    ("GET", r"^/api/projects/(\d+)$", api_project_get, True),
    ("DELETE", r"^/api/projects/(\d+)$", api_project_delete, True),
    ("POST", r"^/api/projects/(\d+)/analyze$", api_project_analyze, True),
    ("GET", r"^/api/posts$", api_posts_list, True),
    ("POST", r"^/api/posts/generate$", api_post_generate, True),
    ("POST", r"^/api/posts/(\d+)$", api_post_update, True),
    ("POST", r"^/api/posts/(\d+)/regenerate$", api_post_regenerate, True),
    ("POST", r"^/api/posts/(\d+)/status$", api_post_status, True),
    ("DELETE", r"^/api/posts/(\d+)$", api_post_delete, True),
    ("GET", r"^/api/socials$", api_socials_list, True),
    ("POST", r"^/api/socials$", api_social_connect, True),
    ("DELETE", r"^/api/socials/(\d+)$", api_social_delete, True),
    ("GET", r"^/api/analytics$", api_analytics, True),
    ("GET", r"^/api/tariffs$", api_tariffs, True),
    ("POST", r"^/api/tariffs/choose$", api_tariff_choose, True),
    ("POST", r"^/api/packs/buy$", api_pack_buy, True),
    ("GET", r"^/api/payments$", api_payments, True),
    ("POST", r"^/api/settings$", api_settings_update, True),
    ("POST", r"^/api/settings/password$", api_change_password, True),
    ("POST", r"^/api/plan/week$", api_week_plan, True),
    ("GET", r"^/api/admin/stats$", api_admin_stats, True),
    ("GET", r"^/api/admin/users$", api_admin_users, True),
    ("POST", r"^/api/admin/users/(\d+)$", api_admin_user_action, True),
    ("GET", r"^/api/admin/posts$", api_admin_posts, True),
    ("GET", r"^/api/admin/payments$", api_admin_payments, True),
]


class Handler(SimpleHTTPRequestHandler):
    server_version = "SocioraCopy/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # ---- служебное
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send_json(self, payload, status=200, headers=None):
        data, _ = json_bytes(payload, status)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        if headers:
            for k, v in headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 1_000_000:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    # ---- API
    def _handle_api(self, method):
        path = urlparse(self.path).path.rstrip("/") or "/"
        query = parse_qs(urlparse(self.path).query)
        body = self._read_body() if method in ("POST", "DELETE", "PATCH", "PUT") else {}
        user = current_user(self)
        for route_method, pattern, fn, need_auth in API_ROUTES:
            if route_method != method:
                continue
            m = re.match(pattern, path)
            if not m:
                continue
            try:
                if need_auth and user is None:
                    raise ApiError("Требуется вход", 401)
                args = []
                import inspect
                sig = inspect.signature(fn)
                params = list(sig.parameters)
                for name in params:
                    if name == "handler":
                        args.append(self)
                    elif name == "body":
                        args.append(body)
                    elif name == "user":
                        args.append(user)
                    elif name == "query":
                        args.append(query)
                    elif name in ("project_id", "post_id", "social_id", "user_id"):
                        args.append(int(m.group(1)))
                result = fn(*args)
                if isinstance(result, tuple):
                    status, payload = result[0], result[1]
                    headers = result[2] if len(result) > 2 else None
                else:
                    status, payload, headers = 200, result, None
                self._send_json(payload, status, headers)
            except ApiError as e:
                self._send_json({"ok": False, "error": e.message}, e.status)
            except Exception as e:  # noqa: BLE001
                self._send_json({"ok": False, "error": "Внутренняя ошибка: %s" % e}, 500)
            return True
        return False

    def do_GET(self):
        if self.path.startswith("/api/"):
            if not self._handle_api("GET"):
                self._send_json({"ok": False, "error": "Неизвестный endpoint"}, 404)
            return
        self._serve_static()

    def do_POST(self):
        if self.path.startswith("/api/"):
            if not self._handle_api("POST"):
                self._send_json({"ok": False, "error": "Неизвестный endpoint"}, 404)
            return
        self._send_json({"ok": False, "error": "Метод не поддерживается"}, 405)

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            if not self._handle_api("DELETE"):
                self._send_json({"ok": False, "error": "Неизвестный endpoint"}, 404)
            return
        self._send_json({"ok": False, "error": "Метод не поддерживается"}, 405)

    # ---- статика
    def _serve_static(self):
        path = urlparse(self.path).path
        if path in ("/", ""):
            self.path = "/index.html"
        elif path == "/app":
            # канонический URL кабинета — со слешом (иначе относительные пути ломаются)
            self.send_response(301)
            self.send_header("Location", "/app/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        elif path in ("/app/", "/app/index.html"):
            self.path = "/app/index.html"
        elif path == "/admin":
            self.send_response(301)
            self.send_header("Location", "/admin/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        elif path in ("/admin/", "/admin/index.html"):
            self.path = "/admin/index.html"
        elif not Path(path).suffix:
            candidate = ROOT / (path.lstrip("/") + ".html")
            if candidate.exists():
                self.path = path + ".html"
        try:
            super().do_GET()
        except BrokenPipeError:
            pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    init_db()
    print("Sociora — локальный бэкенд копии")
    print("База данных: %s" % DB_PATH)
    print("Лендинг:      http://127.0.0.1:%d/" % PORT)
    print("Личный кабинет: http://127.0.0.1:%d/app" % PORT)
    print("Регистрация:  http://127.0.0.1:%d/register" % PORT)
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановлен.")


if __name__ == "__main__":
    main()
