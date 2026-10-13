// Zero-dependency static file server (ESM port of mapMyCity's video/tools/serve.js): serve({ root, port }) or `node static-server.mjs <root> <port>`
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pbf': 'application/x-protobuf',
}

// Maps a request path inside root; null when it would escape it or cannot be decoded
function resolveInside(root, urlPath) {
  let path
  try {
    path = decodeURIComponent(urlPath.split(/[?#]/)[0])
  } catch {
    return null
  }
  if (path.endsWith('/')) path += 'index.html'
  const full = normalize(join(root, path))
  return full === root || full.startsWith(root + sep) ? full : null
}

// Starts a server on 127.0.0.1:port serving root with byte ranges (video seeking) and no caching; resolves { url, port, close }
export function serve({ root, port, host = '127.0.0.1', quiet = true } = {}) {
  const base = resolve(root)
  statSync(base)
  const server = createServer((req, res) => {
    const file = resolveInside(base, req.url)
    if (!file) {
      res.writeHead(403).end('forbidden')
      return
    }
    let st
    try {
      st = statSync(file)
    } catch {
      st = null
    }
    if (!st?.isFile()) {
      if (!quiet) console.log(`404 ${req.url}`)
      res.writeHead(404).end('not found')
      return
    }
    const headers = {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    }
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1
      if (start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end()
        return
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 })
      createReadStream(file, { start, end }).pipe(res)
      return
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size })
    if (req.method === 'HEAD') res.end()
    else createReadStream(file).pipe(res)
  })
  return new Promise((resolvePromise, reject) => {
    server.once('error', (err) => reject(err.code === 'EADDRINUSE' ? new Error(`Port ${port} is already in use`) : err))
    server.listen(port, host, () => {
      const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${server.address().port}`
      resolvePromise({
        url,
        port: server.address().port,
        root: base,
        // Drops keep-alive sockets too, so a capture run exits promptly
        close: () => new Promise((done) => {
          server.closeAllConnections?.()
          server.close(() => done())
        }),
      })
    })
  })
}

// CLI: node scripts/lib/static-server.mjs <root> <port>; Ctrl+C stops it
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [root, port] = process.argv.slice(2)
  if (!root || !port) {
    console.error('Usage: node scripts/lib/static-server.mjs <root> <port>')
    process.exit(2)
  }
  const server = await serve({ root, port: Number(port), quiet: false })
  console.log(`serving ${server.root} on ${server.url}`)
}
