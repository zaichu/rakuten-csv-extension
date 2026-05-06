import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')

const args = process.argv.slice(2)
const portIdx = args.indexOf('--port')
const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 5173

const mime = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  let filePath = join(distDir, url.pathname)

  if (!existsSync(filePath) || filePath === distDir) {
    filePath = join(distDir, 'src/popup/index.html')
  }

  const ext = extname(filePath)
  try {
    const data = readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': mime[ext] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})

const sockets = new Set()
server.on('connection', (socket) => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`serving dist on http://127.0.0.1:${port}`)
})

const shutdown = () => {
  for (const socket of sockets) socket.destroy()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
