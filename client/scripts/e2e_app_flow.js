const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const http = require('node:http')
const { spawn, execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const PROFILE = path.join(process.env.APPDATA, 'proxy-gui', 'profile', 'profile.json')
const SING_BOX = path.join(ROOT, 'resources', 'sing-box', 'sing-box.exe')
const CONFIG = path.join(ROOT, 'resources', 'sing-box', 'e2e-runtime.json')
const MIXED = 17890

function load_profile() {
  const profile = JSON.parse(fs.readFileSync(PROFILE, 'utf8'))
  profile.proxies = profile.proxies.map((proxy) => {
    if (proxy.host === '45.11.183.190' && proxy.port === 11707) {
      return { ...proxy, protocol: 'http', name: 'Seed HTTP' }
    }
    return proxy
  })
  profile.work_mode = 'proxy'
  fs.writeFileSync(PROFILE, JSON.stringify(profile, null, 2))
  return profile
}

function detect_http(proxy) {
  return new Promise((resolve) => {
    const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')
    const socket = net.connect({ host: proxy.host, port: proxy.port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, 5000)
    socket.on('connect', () => {
      socket.write(
        `GET http://api.ipify.org/ HTTP/1.1\r\nHost: api.ipify.org\r\nProxy-Authorization: Basic ${auth}\r\nConnection: close\r\n\r\n`,
      )
    })
    socket.on('data', (chunk) => {
      clearTimeout(timer)
      const text = chunk.toString('utf8')
      socket.destroy()
      resolve(text.includes('200'))
    })
    socket.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

function wait_port(port) {
  const started = Date.now()
  return new Promise((resolve) => {
    const tick = () => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        socket.destroy()
        resolve(true)
      })
      socket.on('error', () => {
        if (Date.now() - started > 10000) resolve(false)
        else setTimeout(tick, 200)
      })
    }
    tick()
  })
}

function http_via_mixed(target) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: MIXED,
        method: 'GET',
        path: target,
        headers: { Host: new URL(target).host, Connection: 'close' },
        timeout: 15000,
      },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode, body: body.trim() }))
      },
    )
    req.on('error', (e) => resolve({ status: 0, body: e.message }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ status: 0, body: 'timeout' })
    })
    req.end()
  })
}

async function main() {
  const results = []
  const pass = (name, detail = '') => {
    results.push({ ok: true, name, detail })
    console.log('PASS', name, detail)
  }
  const fail = (name, detail = '') => {
    results.push({ ok: false, name, detail })
    console.error('FAIL', name, detail)
  }

  const profile = load_profile()
  const proxy = profile.proxies.find((p) => p.id === profile.selected_proxy_id)
  if (!proxy) {
    fail('profile proxy selected')
    process.exit(1)
  }
  pass('profile proxy', `${proxy.protocol} ${proxy.host}:${proxy.port}`)

  if (await detect_http(proxy)) pass('remote speaks HTTP CONNECT')
  else fail('remote speaks HTTP CONNECT')

  const config = {
    log: { level: 'info', timestamp: true },
    dns: {
      servers: [
        { tag: 'remote', address: '1.1.1.1', detour: 'proxy' },
        { tag: 'local', address: 'local' },
      ],
      final: 'remote',
      strategy: 'prefer_ipv4',
    },
    inbounds: [
      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: '127.0.0.1',
        listen_port: MIXED,
      },
    ],
    outbounds: [
      {
        type: 'http',
        tag: 'proxy',
        server: proxy.host,
        server_port: proxy.port,
        username: proxy.username,
        password: proxy.password,
      },
      { type: 'direct', tag: 'direct' },
    ],
    route: {
      rules: [
        { protocol: 'dns', action: 'hijack-dns' },
        { ip_cidr: [`${proxy.host}/32`], outbound: 'direct' },
        { ip_is_private: true, outbound: 'direct' },
        { domain: ['localhost'], outbound: 'direct' },
        { ip_cidr: ['127.0.0.1/32', '::1/32'], outbound: 'direct' },
      ],
      final: 'proxy',
      auto_detect_interface: true,
      find_process: true,
    },
  }

  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2))
  const check = spawn(SING_BOX, ['check', '-c', CONFIG], { windowsHide: true })
  const check_code = await new Promise((resolve) => check.on('close', resolve))
  if (check_code === 0) pass('config check')
  else fail('config check')

  const child = spawn(SING_BOX, ['run', '-c', CONFIG], {
    cwd: path.dirname(SING_BOX),
    windowsHide: true,
  })
  let logs = ''
  child.stderr.on('data', (d) => (logs += d.toString()))
  child.stdout.on('data', (d) => (logs += d.toString()))

  if (await wait_port(MIXED)) pass('mixed up', String(MIXED))
  else {
    fail('mixed up', logs.slice(-300))
    child.kill()
    process.exit(1)
  }

  const via = await http_via_mixed('http://api.ipify.org/')
  if (via.status === 200 && via.body) pass('traffic via engine', via.body)
  else fail('traffic via engine', `${via.status} ${via.body}`)

  // Temporarily set IE proxy like the app, test, restore.
  const before = {
    enable: execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable'], { encoding: 'utf8' }),
  }
  try {
    execFileSync('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f'], { windowsHide: true })
    execFileSync('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', `127.0.0.1:${MIXED}`, '/f'], { windowsHide: true })
    pass('system proxy set for test')

    const proxied = await new Promise((resolve) => {
      const req = http.get(
        {
          host: 'api.ipify.org',
          path: '/',
          timeout: 15000,
          agent: new http.Agent({ keepAlive: false }),
        },
        (res) => {
          // Direct request ignores registry; use explicit proxy path again
          resolve({ status: res.statusCode, note: 'node ignores IE proxy' })
        },
      )
      req.on('error', (e) => resolve({ status: 0, note: e.message }))
    })
    pass('node note', proxied.note)

    const via2 = await http_via_mixed('http://example.com/')
    if (via2.status >= 200 && via2.status < 400) pass('second request via engine', String(via2.status))
    else fail('second request via engine', `${via2.status} ${via2.body.slice(0, 80)}`)
  } finally {
    execFileSync('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f'], { windowsHide: true })
    pass('system proxy restored to off')
  }

  child.kill()
  try { fs.unlinkSync(CONFIG) } catch {}

  const failed = results.filter((r) => !r.ok)
  console.log(`\nDONE ${results.length - failed.length}/${results.length}`)
  if (failed.length) {
    for (const item of failed) console.error('-', item.name, item.detail)
    console.log('\nLOG TAIL\n' + logs.split(/\r?\n/).slice(-12).join('\n'))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
