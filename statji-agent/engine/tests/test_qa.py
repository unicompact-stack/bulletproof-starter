#!/usr/bin/env python3
"""Тесты движка проверки. Запуск: python3 -m unittest discover -s engine/tests -v"""

from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

import qa  # noqa: E402  (импорт после правки sys.path — так задумано)


def article(front: str, body: str) -> str:
    return f"---\n{front.strip()}\n---\n\n{body.strip()}\n"


GOOD_FRONT = """
slug: test-slug
title: "Как выбрать подрядчика на ремонт квартиры: 7 проверок до договора"
description: "Семь проверок подрядчика до подписания договора: смета, порядок оплаты, срок и гарантия. С примерами формулировок, которые должны быть в договоре."
target_query: "как выбрать подрядчика на ремонт квартиры"
objection: O2
cta: "Бесплатный замер и смета за 24 часа"
published: true
"""


class UtilsTest(unittest.TestCase):
    def test_norm_number(self):
        self.assertEqual(qa.norm_number("4 900"), "4900")
        self.assertEqual(qa.norm_number("12,5"), "12.5")
        self.assertEqual(qa.norm_number("294\u00a0000"), "294000")

    def test_front_matter(self):
        data, body, errors = qa.read_front_matter(article(GOOD_FRONT, "# Заголовок"))
        self.assertEqual(errors, [])
        self.assertEqual(data["objection"], "O2")
        self.assertIn("# Заголовок", body)

    def test_front_matter_without_header(self):
        _, _, errors = qa.read_front_matter("# Просто заголовок")
        self.assertTrue(errors)


class FactsTest(unittest.TestCase):
    def setUp(self):
        self.allowed = qa.load_facts()

    def test_registry_not_empty(self):
        self.assertIn("4900", self.allowed)
        self.assertIn("620000", self.allowed)

    def test_range_with_unit_gives_both_numbers(self):
        numbers = {n["value"] for n in qa.extract_numbers("Срок — 45–60 рабочих дней.")}
        self.assertEqual({"45", "60"}, numbers)

    def test_number_with_unit_and_price(self):
        numbers = {n["value"] for n in qa.extract_numbers("Цена от 4 900 ₽ за м².")}
        self.assertEqual({"4900"}, numbers)

    def test_urls_and_code_are_not_facts(self):
        body = "Смотри [смету](/zamer/2024/) и код `x = 12345`."
        numbers = {n["value"] for n in qa.extract_numbers(body)}
        self.assertEqual(set(), numbers)

    def test_unknown_number_fails(self):
        status, detail, stats = qa.check_facts("Точная цена — 999 999 ₽ за всё.", self.allowed)
        self.assertEqual("fail", status)
        self.assertIn("999999", detail)
        self.assertEqual(1, stats["unknown"])

    def test_estimate_is_allowed(self):
        status, detail, stats = qa.check_facts("Это займёт ≈ 200 часов.", self.allowed)
        self.assertEqual("pass", status)
        self.assertEqual(1, stats["estimates"])

    def test_zero_is_allowed(self):
        status, _, _ = qa.check_facts("Работы — 0 ₽, если делаете сами.", self.allowed)
        self.assertEqual("pass", status)


class ChecksTest(unittest.TestCase):
    def setUp(self):
        self.allowed = qa.load_facts()

    def test_stoplist_catches_superlatives(self):
        status, detail = qa.check_stoplist("Мы лучшая компания с гарантией 100% навсегда.")
        self.assertEqual("fail", status)
        self.assertIn("превосходная степень", detail)

    def test_stoplist_clean_text(self):
        status, _ = qa.check_stoplist("Квартира 60 м² — это 620 000 ₽ и 45–60 рабочих дней.")
        self.assertEqual("pass", status)

    def test_invented_case_is_caught(self):
        status, detail = qa.check_invented("Клиент Сергей остался доволен.")
        self.assertEqual("fail", status)
        self.assertIn("выдуманный кейс", detail)

    def test_cta_must_be_exactly_once(self):
        body = "[замер](/zamer/?ref=x) и ещё раз [замер](/zamer/?ref=y)"
        self.assertEqual("fail", qa.check_offer(body, {"cta": "Замер"})[0])
        self.assertEqual("pass", qa.check_offer("[замер](/zamer/?ref=x)", {"cta": "Замер"})[0])

    def test_link_with_query_is_not_broken(self):
        body = "[замер](/zamer/?ref=test-slug) и [статья](/articles/skolko-stoit-remont-pod-klyuch/)"
        status, detail = qa.check_links(body, "test-slug")
        self.assertEqual("pass", status, detail)

    def test_broken_internal_link_fails(self):
        body = "[нет такой](/articles/nesushchestvuyushchaya/) и [ещё](/articles/kak-vybrat-podryadchika/)"
        self.assertEqual("fail", qa.check_links(body, "test-slug")[0])

    def test_query_stems_match_inflections(self):
        stems = qa._stems("как выбрать подрядчика на ремонт квартиры")
        self.assertGreaterEqual(qa._coverage("Как выбрать подрядчика: ремонт квартиры и договор", stems), 1.0)

    def test_duplicates_detected(self):
        text = " ".join(f"слово{i}" for i in range(80))
        status, _ = qa.check_duplicates(text, "a", {"b": text})
        self.assertEqual("fail", status)

    def test_unique_text_passes_duplicates(self):
        a = " ".join(f"альфа{i}" for i in range(80))
        b = " ".join(f"бета{i}" for i in range(80))
        self.assertEqual("pass", qa.check_duplicates(a, "a", {"b": b})[0])


class CorpusTest(unittest.TestCase):
    """Интеграционные проверки на реальных файлах проекта."""

    def setUp(self):
        self.allowed = qa.load_facts()
        self.corpus = qa.load_corpus()

    def test_articles_dir_is_not_empty(self):
        self.assertGreaterEqual(len(self.corpus), 3)

    def test_all_published_articles_pass(self):
        for slug in self.corpus:
            with self.subTest(slug=slug):
                result = qa.check_article(ROOT / "content" / "articles" / f"{slug}.md", self.corpus, self.allowed)
                self.assertTrue(result["passed"], f"{slug}: не пройдено {result['failed_codes']}")

    def test_bad_example_is_caught(self):
        path = ROOT / "content" / "examples" / "_bad-example.md"
        result = qa.check_article(path, self.corpus, self.allowed)
        self.assertFalse(result["passed"])
        for code in ("F", "O", "R", "X"):
            with self.subTest(code=code):
                self.assertIn(code, result["failed_codes"])

    def test_cli_corpus_exit_zero(self):
        proc = subprocess.run(
            [sys.executable, str(ROOT / "engine" / "qa.py"), "--corpus"],
            capture_output=True, text=True, cwd=ROOT,
        )
        self.assertEqual(0, proc.returncode, proc.stdout + proc.stderr)

    def test_cli_bad_example_exit_one(self):
        proc = subprocess.run(
            [sys.executable, str(ROOT / "engine" / "qa.py"), "content/examples/_bad-example.md"],
            capture_output=True, text=True, cwd=ROOT,
        )
        self.assertEqual(1, proc.returncode)


if __name__ == "__main__":
    unittest.main()
