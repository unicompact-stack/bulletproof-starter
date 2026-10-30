#!/usr/bin/env python3
"""Собирает ВСЁ приложение в один файл index.html.

Внутри: стили (styles.css), данные (data.js) и логика (app.js).
Внешних запросов нет — файл можно скачать, открыть двойным щелчком и работать офлайн.

Правим всегда исходники: template.html, styles.css, data.js, app.js.
Запуск: python3 build.py
"""
from pathlib import Path

here = Path(__file__).parent
html = (here / 'template.html').read_text(encoding='utf-8')
css = (here / 'styles.css').read_text(encoding='utf-8')
data = (here / 'data.js').read_text(encoding='utf-8')
app = (here / 'app.js').read_text(encoding='utf-8')

html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="data.js"></script>', '<script>\n' + data + '\n</script>')
html = html.replace('<script src="app.js"></script>', '<script>\n' + app + '\n</script>')

for bad in ('href="styles.css"', 'src="data.js"', 'src="app.js"', 'href="manifest.webmanifest"'):
    assert bad not in html, 'осталась внешняя ссылка: ' + bad

out = here / 'index.html'
out.write_text(html, encoding='utf-8')
print(f'index.html — {len(html)/1024:.0f} КБ, {html.count(chr(10)) + 1} строк, внешних ссылок 0')
