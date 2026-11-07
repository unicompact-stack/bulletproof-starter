// Статический сервер для собранного приложения.
//
// Зачем он нужен вместо `vite dev`: dev-сервер держит websocket живой
// перезагрузки, пересобирает зависимости на ходу и зависит от разрешённых
// хостов. В превью это и ломалось. Здесь ничего этого нет — просто отдача
// готовых файлов из dist. Ноль зависимостей, только стандартная библиотека.

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(HERE, 'dist')
// Запасной вариант: dist исключён из снимков и пропадает при восстановлении
// сессии, а этот файл лежит в git. Без него превью отдавало бы 500.
const STANDALONE = join(HERE, '..', 'Читальня.html')
const PORT = Number(process.env.PORT) || 5173
const HOST = '0.0.0.0' // обязательно: превью не видит localhost

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

async function readIfFile(path) {
  try {
    const info = await stat(path)
    if (!info.isFile()) return null
    return await readFile(path)
  } catch {
    return null
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  // normalize + отсечение ведущих '..' не выпускает запрос за пределы dist
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  const target = join(ROOT, rel)

  let body = await readIfFile(target)
  let ext = extname(target)

  // SPA-fallback: неизвестный путь отдаёт index.html, навигация не ломается
  if (body === null) {
    body = await readIfFile(join(ROOT, 'index.html'))
    ext = '.html'
  }

  // dist нет — отдаём автономную однофайловую читальню
  if (body === null) {
    body = await readIfFile(STANDALONE)
    ext = '.html'
  }

  if (body === null) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Нет ни dist, ни Читальня.html — выполните npm run build')
    return
  }

  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    // html не кэшируем, иначе правки не видны; ассеты с хэшем в имени — надолго
    'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
  })
  res.end(req.method === 'HEAD' ? undefined : body)
})

server.listen(PORT, HOST, () => {
  console.log(`Читальня: http://${HOST}:${PORT}`)
})
