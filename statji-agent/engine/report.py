#!/usr/bin/env python3
"""Отчёт владельцу: что опубликовано, что принесло заявки, сколько это стоило.

    python3 engine/report.py
    python3 engine/report.py --json

Правило честности: где данных нет — пишем «неизвестно», а не ноль и не оценку.
Время считается по регламенту (65 минут на статью) и помечается как регламент, а не как замер.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

ENGINE = Path(__file__).resolve().parent
ROOT = ENGINE.parent
sys.path.insert(0, str(ENGINE))
import web as site_mod  # noqa: E402  (модуль web.py: имя site.py конфликтует со stdlib)

MINUTES_PER_ARTICLE = 65  # факт F29: регламентное время агента на статью


def topics_summary() -> dict:
    path = ROOT / "content" / "topics.md"
    if not path.exists():
        return {}
    counts = {"published": 0, "next": 0, "queue": 0, "low": 0, "rejected": 0}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        if "✅" in line:
            counts["published"] += 1
        elif "🔜" in line:
            counts["next"] += 1
        elif "⏳" in line:
            counts["queue"] += 1
        elif "💤" in line:
            counts["low"] += 1
        elif "❌" in line:
            counts["rejected"] += 1
    return counts


def build_report() -> dict:
    articles = site_mod.load_articles()
    snapshot = site_mod.stats_snapshot(articles)
    rows = []
    for item in snapshot["articles"]:
        rows.append({
            **item,
            "objection": next((a["objection"] for a in articles if a["slug"] == item["slug"]), ""),
            "words": next((a["qa"]["stats"].get("words", 0) for a in articles if a["slug"] == item["slug"]), 0),
        })
    published_count = sum(1 for r in rows if r["published"])
    leads_total = snapshot["totals"]["leads"]
    views_total = snapshot["totals"]["views"]
    minutes = published_count * MINUTES_PER_ARTICLE
    return {
        "date": time.strftime("%Y-%m-%d"),
        "rows": rows,
        "published": published_count,
        "qa_failed": [a["slug"] for a in articles if not a["qa"]["passed"]],
        "views": views_total,
        "leads": leads_total,
        "minutes_planned": minutes,
        "minutes_source": "регламент 65 мин/статья (факт F29), не замер секундомером",
        "cost_per_lead_minutes": round(minutes / leads_total, 1) if leads_total else None,
        "topics": topics_summary(),
        "notes": snapshot["totals"]["note"],
    }


def print_human(report: dict) -> None:
    print(f"ОТЧЁТ АГЕНТА-СТАТЕЙНИКА · {report['date']}")
    print("=" * 72)
    print(f"Опубликовано статей: {report['published']}  ·  не прошли QA: {len(report['qa_failed'])}")
    print(f"Время агента (регламент): {report['minutes_planned']} мин — {report['minutes_source']}")
    print()
    header = f"{'Статья':<34} {'Возр.':<6} {'QA':<5} {'Слов':<5} {'Просм.':<7} {'Заявки':<7}"
    print(header)
    print("-" * len(header))
    for row in report["rows"]:
        qa_state = "pass" if row["qa"]["passed"] else "FAIL:" + ",".join(row["qa"]["failed_codes"])
        print(f"{row['slug']:<34} {row['objection']:<6} {qa_state:<5} {row['words']:<5} "
              f"{row['views']:<7} {row['leads']:<7}")
    print()
    print(f"Просмотры: {report['views'] if report['views'] else 'неизвестно (ещё не накапливались)'}")
    print(f"Заявки: {report['leads']}")
    if report["leads"]:
        best = max(report["rows"], key=lambda r: r["leads"])
        print(f"Лучшая статья по заявкам: {best['slug']} ({best['leads']})")
        print(f"Время на заявку: {report['cost_per_lead_minutes']} мин агентского времени")
    else:
        print("Время на заявку: неизвестно — заявок пока нет")
    print(f"Примечание: {report['notes']}")
    if report["topics"]:
        t = report["topics"]
        print(f"Очередь тем: опубликовано {t.get('published',0)} · следующая {t.get('next',0)} · "
              f"в очереди {t.get('queue',0)} · низкий приоритет {t.get('low',0)} · не берём {t.get('rejected',0)}")
    print()
    print("Что дальше по регламенту: следующая тема — из очереди content/topics.md;")
    print("после публикации — ссылка с ?ref=<slug>, через неделю — повторный отчёт.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Отчёт агента-статейника")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    report = build_report()
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_human(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
