#!/usr/bin/env python3
"""QA-проверки статьи для агента-статейника СК «СтройЦех 12».

Проверки описаны в .claude/skills/statji-agent/references/qa.md.
Коды: S T L K F O R C H D M X

Запуск:
    python3 engine/qa.py content/articles/skolko-stoit-remont-pod-klyuch.md
    python3 engine/qa.py --corpus
    python3 engine/qa.py <file> --json

Коды выхода: 0 — все проверки пройдены, 1 — есть fail, 2 — ошибка запуска.

Важно: exit 0 НЕ значит «статья хорошая». Он значит «нет выдуманных цифр,
есть структура, оффер и нет юридических мин». Смысл проверяет человек.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARTICLES_DIR = ROOT / "content" / "articles"
FACTS_FILE = ROOT / "content" / "facts.md"

REQUIRED_FIELDS = ("slug", "title", "description", "target_query", "objection", "cta", "published")
VALID_OBJECTIONS = ("O1", "O2", "O3", "O4", "O5", "O6", "O7")

# --- пороги (менять пороги ВМЕСТО правки статьи запрещено правилами скилла) ---
TITLE_MIN, TITLE_MAX = 40, 70
DESC_MIN, DESC_MAX = 120, 180
H1_MAX = 70
WORDS_MIN, WORDS_MAX = 550, 1100
H2_MIN = 3
PARAGRAPH_MAX_WORDS = 90
SENTENCE_MAX_AVG = 25.0
LONG_WORD_LIMIT = 14
LONG_WORD_SHARE_MAX = 0.10
DUPLICATE_MAX = 0.15
CTA_LINK = "/zamer/"
INTERNAL_LINKS_MIN = 2

STOPWORDS = {
    "как", "что", "чем", "для", "или", "это", "все", "весь", "при", "без",
    "над", "под", "про", "the", "and", "если", "когда", "нужен", "нужно", "быть",
    "можно", "очень", "надо", "себя", "ваш", "ваша", "ваши", "свой", "свои",
}

STOPLIST = [
    (r"\bлучш(ая|ий|ее|ие|его|ую|их|им|ему|его)\b", "превосходная степень"),
    (r"сам\w*\s+низк", "«самые низкие цены»"),
    (r"дешевле\s+всех", "«дешевле всех»"),
    (r"№\s*1\b", "«№1»"),
    (r"\b100\s*%", "«100%»"),
    (r"навсегда", "«навсегда»"),
    (r"единственн\w+", "«единственный»"),
    (r"в\s+отличие\s+от\s*[«\"]", "сравнение с конкурентом по названию"),
    (r"гарантиру\w*\s+качество", "«гарантируем качество»"),
    (r"без\s+конкурент", "«без конкурентов»"),
]

INVENTED_CASE = [
    (r"клиент\w*\s+[А-ЯЁ][а-яё]+", "«клиент Имя» — выдуманный кейс"),
    (r"клиентк\w*\s+[А-ЯЁ][а-яё]+", "«клиентка Имя» — выдуманный кейс"),
    (r"(наши|наши)\s+клиенты\s+отмечают", "«наши клиенты отмечают»"),
    (r"клиенты\s+отмечают", "«клиенты отмечают»"),
    (r"по\s+отзывам", "«по отзывам»"),
    (r"написал\w*\s+отзыв", "«написал отзыв»"),
    (r"дом\s+на\s+[А-ЯЁ][а-яё]+", "выдуманный адрес объекта"),
]

UNIT = (
    r"₽|руб\w*|%|м²|м2|кв\.?\s?м\w*|дн\w*|месяц\w*|год\w*|лет|час\w*|мин\w*|"
    r"этап\w*|слов\w*|пункт\w*|квартир\w*|бригад\w*|прораб\w*|строк\w*|провер\w*|"
    r"вариант\w*|визит\w*|заяв\w*|объект\w*|точк\w*|машин\w*|мм\b"
)

NUMBER_WITH_UNIT = re.compile(
    r"(?P<est>≈|~)?\s*(?P<num>\d[\d\s\u00a0]*(?:[.,]\d+)?)\s*(?P<unit>" + UNIT + r")",
    re.IGNORECASE,
)
RANGE_ANY = re.compile(
    r"(?P<a>\d[\d\s\u00a0]*)\s*[–—-]\s*(?P<b>\d[\d\s\u00a0]*)",
    re.IGNORECASE,
)
# Единица измерения может стоять не сразу: «45–60 рабочих дней», «35–45 рабочих дней».
UNIT_RE = re.compile(UNIT, re.IGNORECASE)
RANGE_TAIL = 25
BIG_NUMBER = re.compile(r"(?<![\d.,])(?P<num>\d{4,})(?![\d.,])")


# ---------------------------------------------------------------- утилиты


def norm(text: str) -> str:
    """Нормализация для сравнений: нижний регистр, ё→е, единые пробелы."""
    text = text.replace("ё", "е").replace("Ё", "Е").lower()
    return re.sub(r"\s+", " ", text).strip()


def norm_number(raw: str) -> str:
    """'4 900' → '4900', '12,5' → '12.5'."""
    cleaned = re.sub(r"[\s\u00a0]", "", raw).replace(",", ".")
    if cleaned.endswith(".0"):
        cleaned = cleaned[:-2]
    return cleaned


def word_tokens(text: str) -> list[str]:
    return re.findall(r"[А-Яа-яЁёA-Za-z]+", text)


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p for p in parts if word_tokens(p)]


def paragraphs(body: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip() and not p.lstrip().startswith(("#", "|", "---"))]


def headings(body: str, level: int) -> list[str]:
    marker = "#" * level
    return [line[len(marker):].strip() for line in body.splitlines() if line.startswith(marker + " ") and not line.startswith(marker + "#")]


def strip_markup(body: str) -> str:
    """Убираем код, ссылки и разметку — чтобы цифры из URL не считались фактами."""
    text = re.sub(r"```.*?```", " ", body, flags=re.DOTALL)
    text = re.sub(r"`[^`]*`", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)  # оставляем подпись ссылки
    text = re.sub(r"https?://\S+", " ", text)
    return text


def read_front_matter(text: str) -> tuple[dict, str, list[str]]:
    """Простой разбор YAML-подобного frontmatter. Возвращает (данные, тело, ошибки)."""
    errors: list[str] = []
    if not text.startswith("---"):
        return {}, text, ["нет frontmatter (файл не начинается с ---)"]
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text, ["frontmatter не закрыт строкой ---"]
    raw = text[3:end].strip("\n")
    body = text[end + 4:]
    data: dict = {}
    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            errors.append(f"строка frontmatter без ':' — {line.strip()!r}")
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        data[key.strip()] = value
    return data, body, errors


# ---------------------------------------------------------------- факты


def load_facts(path: Path = FACTS_FILE) -> dict[str, str]:
    """Собирает разрешённые числа из колонки «Значения» реестра фактов."""
    allowed: dict[str, str] = {}
    if not path.exists():
        return allowed
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line.startswith("|") or not re.match(r"\|\s*F\d+\s*\|", line):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 2:
            continue
        fact_id = cells[0]
        for raw in re.findall(r"\d[\d\s\u00a0]*(?:[.,]\d+)?", cells[1]):
            allowed[norm_number(raw)] = fact_id
    return allowed


def extract_numbers(body: str) -> list[dict]:
    """Все числа, за которые агент отвечает: с единицей измерения или 4+ цифры."""
    text = strip_markup(body)
    found: dict[tuple[str, str], dict] = {}

    def add(raw: str, est: bool, unit: str, context: str) -> None:
        value = norm_number(raw)
        key = (value, unit)
        if key not in found:
            found[key] = {"value": value, "estimate": est, "unit": unit, "context": context}

    for m in RANGE_ANY.finditer(text):
        tail = text[m.end():m.end() + RANGE_TAIL]
        hit = UNIT_RE.search(tail)
        if not hit:
            continue
        unit = hit.group(0)
        add(m.group("a"), False, unit, m.group(0) + tail[:hit.start()] + unit)
        add(m.group("b"), False, unit, m.group(0) + tail[:hit.start()] + unit)

    for m in NUMBER_WITH_UNIT.finditer(text):
        add(m.group("num"), bool(m.group("est")), m.group("unit"), m.group(0))

    for m in BIG_NUMBER.finditer(text):
        add(m.group("num"), False, "—", m.group(0))

    return list(found.values())


# ---------------------------------------------------------------- проверки


def check_frontmatter(data: dict, errors: list[str], slug_from_file: str) -> tuple[str, str]:
    problems = list(errors)
    missing = [f for f in REQUIRED_FIELDS if not data.get(f)]
    if missing:
        problems.append("нет полей: " + ", ".join(missing))
    objection = (data.get("objection") or "").split(",")
    objection = [o.strip() for o in objection if o.strip()]
    if len(objection) != 1:
        problems.append(f"objection должен быть один, а их {len(objection)}: {data.get('objection')!r}")
    elif objection[0] not in VALID_OBJECTIONS:
        problems.append(f"неизвестный objection: {objection[0]!r}")
    if data.get("slug") and data["slug"] != slug_from_file:
        problems.append(f"slug в файле ({data['slug']}) != имя файла ({slug_from_file})")
    status = "fail" if problems else "pass"
    detail = ("problems=" + "; ".join(problems)) if problems else f"fields={len(data)} objection={objection}"
    return status, detail


def check_title(data: dict, h1: list[str]) -> tuple[str, str]:
    title = data.get("title", "")
    desc = data.get("description", "")
    problems = []
    if not (TITLE_MIN <= len(title) <= TITLE_MAX):
        problems.append(f"title {len(title)} симв. (нужно {TITLE_MIN}–{TITLE_MAX})")
    if not (DESC_MIN <= len(desc) <= DESC_MAX):
        problems.append(f"description {len(desc)} симв. (нужно {DESC_MIN}–{DESC_MAX})")
    if len(h1) != 1:
        problems.append(f"H1 не один ({len(h1)})")
    elif len(h1[0]) > H1_MAX:
        problems.append(f"H1 {len(h1[0])} симв. (макс {H1_MAX})")
    return ("fail" if problems else "pass"), "; ".join(problems) or f"title={len(title)} desc={len(desc)}"


def check_length(body: str) -> tuple[str, str]:
    words = word_tokens(strip_markup(body))
    status = "pass" if WORDS_MIN <= len(words) <= WORDS_MAX else "fail"
    return status, f"words={len(words)} (нужно {WORDS_MIN}–{WORDS_MAX})"


def _stems(query: str) -> list[str]:
    stems = []
    for token in word_tokens(query):
        token = token.lower()
        if len(token) < 4 or token in STOPWORDS:
            continue
        stems.append(token[:5])
    return stems


def _coverage(chunk: str, stems: list[str]) -> float:
    if not stems:
        return 1.0
    words = [w.lower() for w in word_tokens(chunk)]
    hit = sum(1 for s in stems if any(w.startswith(s) for w in words))
    return hit / len(stems)


def check_query(data: dict, body: str, paragraphs_: list[str], h2: list[str]) -> tuple[str, str]:
    stems = _stems(data.get("target_query", ""))
    if not stems:
        return "fail", "не задан target_query"
    h1 = headings(body, 1)
    first = paragraphs_[0] if paragraphs_ else ""
    h1_cov = _coverage(h1[0], stems) if h1 else 0.0
    first_cov = _coverage(first, stems)
    good_h2 = [h for h in h2 if _coverage(h, stems) >= 0.5]
    problems = []
    if h1_cov < 0.8:
        problems.append(f"H1={h1_cov:.0%}")
    if first_cov < 0.6:
        problems.append(f"первый абзац={first_cov:.0%}")
    if len(good_h2) < 2:
        problems.append(f"H2 с запросом={len(good_h2)} (нужно ≥2)")
    detail = f"H1={h1_cov:.0%} первый абзац={first_cov:.0%} H2≥50%={len(good_h2)}"
    if problems:
        detail += " → " + "; ".join(problems)
    return ("fail" if problems else "pass"), detail


def check_facts(body: str, allowed: dict[str, str]) -> tuple[str, str, dict]:
    numbers = extract_numbers(body)
    # Ноль — не утверждение о мире, а результат арифметики: «работы — 0 ₽, если делаете сами».
    unknown = [n for n in numbers if not n["estimate"] and n["value"] != "0" and n["value"] not in allowed]
    estimates = [n for n in numbers if n["estimate"]]
    stats = {"total": len(numbers), "unknown": len(unknown), "estimates": len(estimates)}
    if unknown:
        sample = "; ".join(f"{u['value']} ({u['context'].strip()[:40]})" for u in unknown[:5])
        return "fail", f"нет в реестре фактов: {sample}", stats
    detail = f"numbers={len(numbers)} unknown=0 estimates={len(estimates)}"
    return "pass", detail, stats


def check_offer(body: str, data: dict) -> tuple[str, str]:
    links = re.findall(r"\[[^\]]*\]\(([^)]+)\)", body)
    cta_links = [l for l in links if l.split("?")[0].rstrip("/") == CTA_LINK.rstrip("/")]
    problems = []
    if not data.get("cta"):
        problems.append("пустое поле cta")
    if len(cta_links) != 1:
        problems.append(f"ссылок на {CTA_LINK}: {len(cta_links)} (нужна ровно 1)")
    if "замер" not in norm(body):
        problems.append("в тексте нет слова «замер»")
    return ("fail" if problems else "pass"), "; ".join(problems) or f"cta_links={len(cta_links)}"


def check_stoplist(body: str) -> tuple[str, str]:
    low = body.lower()
    hits = [f"{reason} ({re.search(p, low).group(0)!r})" for p, reason in STOPLIST if re.search(p, low)]
    return ("fail" if hits else "pass"), "; ".join(hits) or "чисто"


def check_structure(body: str, h2: list[str], paragraphs_: list[str]) -> tuple[str, str]:
    problems = []
    if len(h2) < H2_MIN:
        problems.append(f"H2={len(h2)} (нужно ≥{H2_MIN})")
    if not any("проверить" in norm(h) for h in h2):
        problems.append("нет раздела «Как проверить»")
    if not any(line.startswith("|") for line in body.splitlines()):
        problems.append("нет таблицы")
    long_paragraphs = [p for p in paragraphs_ if len(word_tokens(p)) > PARAGRAPH_MAX_WORDS]
    if long_paragraphs:
        problems.append(f"абзацев длиннее {PARAGRAPH_MAX_WORDS} слов: {len(long_paragraphs)}")
    return ("fail" if problems else "pass"), "; ".join(problems) or f"H2={len(h2)} таблица=есть"


def check_human(body: str) -> tuple[str, str]:
    text = strip_markup(body)
    sents = sentences(text)
    words = word_tokens(text)
    avg = (len(words) / len(sents)) if sents else 0.0
    long_words = [w for w in words if len(w) > LONG_WORD_LIMIT]
    share = (len(long_words) / len(words)) if words else 0.0
    problems = []
    if avg > SENTENCE_MAX_AVG:
        problems.append(f"средняя длина предложения {avg:.1f} (макс {SENTENCE_MAX_AVG})")
    if share > LONG_WORD_SHARE_MAX:
        problems.append(f"доля слов длиннее {LONG_WORD_LIMIT} букв {share:.1%} (макс {LONG_WORD_SHARE_MAX:.0%})")
    detail = f"предложение≈{avg:.1f} сл. длинных слов={share:.1%}"
    if problems:
        detail += " → " + "; ".join(problems)
    return ("fail" if problems else "pass"), detail


def shingles(text: str, size: int = 5) -> set[tuple[str, ...]]:
    words = [w.lower() for w in word_tokens(strip_markup(text))]
    if len(words) < size:
        return set()
    return {tuple(words[i:i + size]) for i in range(len(words) - size + 1)}


def check_duplicates(body: str, slug: str, corpus: dict[str, str]) -> tuple[str, str]:
    mine = shingles(body)
    worst, worst_slug = 0.0, ""
    for other_slug, other_body in corpus.items():
        if other_slug == slug:
            continue
        theirs = shingles(other_body)
        if not mine or not theirs:
            continue
        overlap = len(mine & theirs) / min(len(mine), len(theirs))
        if overlap > worst:
            worst, worst_slug = overlap, other_slug
    if worst >= DUPLICATE_MAX:
        return "fail", f"пересечение {worst:.1%} с «{worst_slug}» (макс {DUPLICATE_MAX:.0%})"
    return "pass", f"макс. пересечение {worst:.1%}" + (f" («{worst_slug}»)" if worst_slug else "")


def check_links(body: str, slug: str) -> tuple[str, str]:
    targets = re.findall(r"\[[^\]]*\]\(([^)]+)\)", body)
    internal, broken = [], []
    for target in targets:
        clean = target.split("#", 1)[0].split("?", 1)[0].strip("<>")
        if not clean or clean.startswith(("http://", "https://", "mailto:", "#")):
            continue
        internal.append(target)
        if clean.startswith("/articles/"):
            other = clean.strip("/").split("/")[1] if len(clean.strip("/").split("/")) > 1 else ""
            if not (ARTICLES_DIR / f"{other}.md").exists():
                broken.append(target)
        elif clean.rstrip("/") == CTA_LINK.rstrip("/"):
            continue
        else:
            if not (ROOT / clean.lstrip("/")).exists():
                broken.append(target)
    problems = []
    if broken:
        problems.append("битые ссылки: " + ", ".join(broken))
    if len(internal) < INTERNAL_LINKS_MIN:
        problems.append(f"внутренних ссылок {len(internal)} (нужно ≥{INTERNAL_LINKS_MIN})")
    return ("fail" if problems else "pass"), "; ".join(problems) or f"внутренних ссылок={len(internal)}"


def check_invented(body: str) -> tuple[str, str]:
    hits = [
        f"{reason} ({re.search(p, body, re.IGNORECASE).group(0)!r})"
        for p, reason in INVENTED_CASE
        if re.search(p, body, re.IGNORECASE)
    ]
    return ("fail" if hits else "pass"), "; ".join(hits) or "выдуманных кейсов нет"


# ---------------------------------------------------------------- сборка


def rel(path: Path) -> str:
    """Путь для отчёта: относительно корня проекта, если это возможно."""
    try:
        return str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def check_article(path: Path, corpus: dict[str, str] | None = None, allowed: dict[str, str] | None = None) -> dict:
    path = Path(path).resolve()
    allowed = allowed if allowed is not None else load_facts()
    text = path.read_text(encoding="utf-8")
    data, body, fm_errors = read_front_matter(text)
    slug = data.get("slug") or path.stem
    h1, h2 = headings(body, 1), headings(body, 2)
    paras = paragraphs(body)

    corpus = corpus if corpus is not None else {}
    if path.stem not in corpus:
        corpus = dict(corpus, **{path.stem: body})

    results = [
        ("S", "frontmatter", check_frontmatter(data, fm_errors, path.stem)),
        ("T", "title/description/H1", check_title(data, h1)),
        ("L", "объём", check_length(body)),
        ("K", "целевой запрос", check_query(data, body, paras, h2)),
        ("F", "факты", check_facts(body, allowed)[:2]),
        ("O", "оффер и призыв", check_offer(body, data)),
        ("R", "стоп-лист", check_stoplist(body)),
        ("C", "структура", check_structure(body, h2, paras)),
        ("H", "человеческий язык", check_human(body)),
        ("D", "дубли", check_duplicates(body, path.stem, corpus)),
        ("M", "внутренние ссылки", check_links(body, slug)),
        ("X", "выдуманные кейсы", check_invented(strip_markup(body))),
    ]
    facts_detail, facts_stats = check_facts(body, allowed)[1], check_facts(body, allowed)[2]

    checks = [
        {"code": code, "name": name, "status": status, "detail": facts_detail if code == "F" else detail}
        for code, name, (status, detail) in results
    ]
    words = len(word_tokens(strip_markup(body)))
    failed = [c for c in checks if c["status"] == "fail"]
    return {
        "file": rel(path),
        "slug": slug,
        "passed": not failed,
        "failed_codes": [c["code"] for c in failed],
        "checks": checks,
        "stats": {"words": words, **facts_stats},
    }


def load_corpus() -> dict[str, str]:
    corpus = {}
    for path in sorted(ARTICLES_DIR.glob("*.md")):
        if path.name.startswith("_"):
            continue
        _, body, _ = read_front_matter(path.read_text(encoding="utf-8"))
        corpus[path.stem] = body
    return corpus


def print_report(result: dict, use_json: bool) -> None:
    if use_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    head = "OK  " if result["passed"] else "FAIL"
    print(f"{head} {result['file']}  (слов: {result['stats']['words']})")
    for check in result["checks"]:
        mark = "PASS" if check["status"] == "pass" else "FAIL"
        print(f"  {mark}  {check['code']}  {check['name']:<22} {check['detail']}")
    if result["failed_codes"]:
        print(f"\nНе пройдено: {', '.join(result['failed_codes'])} → правь статью, а не пороги.")


def main() -> int:
    parser = argparse.ArgumentParser(description="QA-проверки статьи")
    parser.add_argument("files", nargs="*", help="пути к файлам статей")
    parser.add_argument("--corpus", action="store_true", help="проверить все статьи в content/articles")
    parser.add_argument("--json", action="store_true", help="вывести JSON")
    parser.add_argument("--facts", type=Path, default=FACTS_FILE, help="путь к реестру фактов")
    args = parser.parse_args()

    allowed = load_facts(args.facts)
    if not allowed:
        print(json.dumps({"error": f"реестр фактов пуст или не найден: {args.facts}"}, ensure_ascii=False), file=sys.stderr)
        return 2
    corpus = load_corpus()

    if args.corpus:
        paths = [p for p in sorted(ARTICLES_DIR.glob("*.md")) if not p.name.startswith("_")]
        if not paths:
            print(json.dumps({"error": "в content/articles нет статей"}, ensure_ascii=False), file=sys.stderr)
            return 2
    elif args.files:
        paths = [Path(p) for p in args.files]
    else:
        parser.print_help()
        return 2

    results = []
    for path in paths:
        if not path.exists():
            print(json.dumps({"error": f"файл не найден: {path}"}, ensure_ascii=False), file=sys.stderr)
            return 2
        results.append(check_article(path, corpus, allowed))

    if args.json:
        print(json.dumps(results if len(results) > 1 else results[0], ensure_ascii=False, indent=2))
    else:
        for i, result in enumerate(results):
            if i:
                print()
            print_report(result, use_json=False)
        if len(results) > 1:
            ok = sum(1 for r in results if r["passed"])
            print(f"\nИтого: {ok}/{len(results)} статей прошли проверку")

    return 0 if all(r["passed"] for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
