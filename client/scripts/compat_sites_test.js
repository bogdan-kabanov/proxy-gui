const fs = require('node:fs')
const net = require('node:net')
const https = require('node:https')
const { spawn } = require('node:child_process')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SING = path.join(ROOT, 'resources', 'sing-box', 'sing-box.exe')
const CFG = path.join(ROOT, 'resources', 'sing-box', 'compat-test.json')
const PORT = 17955

const config = {
  log: { level: 'info', timestamp: true },
  dns: {
    servers: [
      { tag: 'remote', address: 'https://1.1.1.1/dns-query', detour: 'proxy' },
      { tag: 'local', address: 'local' },
    ],
    final: 'remote',
    strategy: 'prefer_ipv4',
    independent_cache: true,
  },
  inbounds: [{ type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: PORT }],
  outbounds: [
    {
      type: 'http',
      tag: 'proxy',
      server: '45.11.183.190',
      server_port: 11707,
      username: 'modeler_TBbGST',
      password: 'GxBi5GsRDlbV',
    },
    { type: 'direct', tag: 'direct' },
  ],
  route: {
    rules: [
      { protocol: 'dns', action: 'hijack-dns' },
      { ip_cidr: ['45.11.183.190/32'], outbound: 'direct' },
      { ip_is_private: true, outbound: 'direct' },
      { protocol: 'quic', action: 'reject' },
      { network: 'udp', outbound: 'direct' },
    ],
    final: 'proxy',
    auto_detect_interface: true,
  },
}

function wait_port(port) {
  const started = Date.now()
  return new Promise((resolve) => {
    const tick = () => {
      const s = net.connect({ host: '127.0.0.1', port }, () => {
        s.destroy()
        resolve(true)
      })
      s.on('error', () => {
        if (Date.now() - started > 10000) resolve(false)
        else setTimeout(tick, 200)
      })
    }
    tick()
  })
}

function https_via_mixed(hostname, url_path = '/') {
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: hostname,
        path: url_path,
        method: 'GET',
        servername: hostname,
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0', Connection: 'close' },
        createConnection: (_options, callback) => {
          const socket = net.connect({ host: '127.0.0.1', port: PORT }, () => {
            socket.write(
              `CONNECT ${hostname}:443 HTTP/1.1\r\nHost: ${hostname}:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`,
            )
            let buf = ''
            const on_data = (chunk) => {
              buf += chunk.toString('utf8')
              if (buf.includes('\r\n\r\n')) {
                socket.off('data', on_data)
                if (!/^HTTP\/1\.\d 200/i.test(buf)) {
                  callback(new Error(`CONNECT failed: ${buf.slice(0, 120)}`))
                  return
                }
                callback(null, socket)
              }
            }
            socket.on('data', on_data)
          })
          socket.on('error', callback)
          return socket
        },
      },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ ok: res.statusCode < 500, status: res.statusCode, bytes: body.length }))
      },
    )
    req.on('error', (e) => resolve({ ok: false, status: 0, bytes: 0, error: e.message }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false, status: 0, bytes: 0, error: 'timeout' })
    })
    req.end()
  })
}

async function main() {
  fs.writeFileSync(CFG, JSON.stringify(config, null, 2))
  const check = spawn(SING, ['check', '-c', CFG], { windowsHide: true })
  const check_code = await new Promise((r) => check.on('close', r))
  console.log(check_code === 0 ? 'PASS config' : 'FAIL config')

  const child = spawn(SING, ['run', '-c', CFG], { cwd: path.dirname(SING), windowsHide: true })
  let logs = ''
  child.stderr.on('data', (d) => (logs += d.toString()))
  child.stdout.on('data', (d) => (logs += d.toString()))

  if (!(await wait_port(PORT))) {
    console.log('FAIL mixed', logs.slice(-400))
    child.kill()
    process.exit(1)
  }
  console.log('PASS mixed')

  const yt = await https_via_mixed('www.youtube.com')
  console.log(yt.ok ? `PASS youtube ${yt.status} ${yt.bytes}b` : `FAIL youtube ${yt.error || yt.status}`)

  const google = await https_via_mixed('www.google.com')
  console.log(google.ok ? `PASS google ${google.status} ${google.bytes}b` : `FAIL google ${google.error || google.status}`)

  const gh = await https_via_mixed('api.github.com')
  console.log(gh.ok ? `PASS github ${gh.status} ${gh.bytes}b` : `FAIL github ${gh.error || gh.status}`)

  child.kill()
  fs.unlinkSync(CFG)
  if (!yt.ok || !google.ok || !gh.ok) {
    console.log(logs.split(/\r?\n/).slice(-15).join('\n'))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
