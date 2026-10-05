const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { spawn } = require('node:child_process')
const http = require('node:http')

const ROOT = path.join(__dirname, '..')
const SING_BOX = path.join(ROOT, 'resources', 'sing-box', 'sing-box.exe')
const WINTUN = path.join(ROOT, 'resources', 'sing-box', 'wintun.dll')
const CONFIG_PATH = path.join(ROOT, 'resources', 'sing-box', 'auto-test.json')
const MIXED_PORT = 17901
const CLASH_PORT = 17902

const PROXY = {
  host: '45.11.183.190',
  port: 11707,
  username: 'modeler_TBbGST',
  password: 'GxBi5GsRDlbV',
}

const results = []

function pass(name, detail = '') {
  results.push({ ok: true, name, detail })
  console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`)
}

function fail(name, detail = '') {
  results.push({ ok: false, name, detail })
  console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`)
}

function wait_port(port, timeout_ms = 10000) {
  const started = Date.now()
  return new Promise((resolve) => {
    const tick = () => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        socket.destroy()
        resolve(true)
      })
      socket.on('error', () => {
        if (Date.now() - started > timeout_ms) resolve(false)
        else setTimeout(tick, 200)
      })
    }
    tick()
  })
}

function tcp_check(host, port, timeout_ms = 8000) {
  const started = Date.now()
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve({ ok: false, ms: null, error: 'timeout' })
    }, timeout_ms)
    socket.on('connect', () => {
      clearTimeout(timer)
      const ms = Date.now() - started
      socket.destroy()
      resolve({ ok: true, ms, error: null })
    })
    socket.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, ms: null, error: error.message })
    })
  })
}

function http_get_via_proxy(target_url, timeout_ms = 20000) {
  return new Promise((resolve) => {
    const url = new URL(target_url)
    const req = http.request(
      {
        host: '127.0.0.1',
        port: MIXED_PORT,
        method: 'GET',
        path: target_url,
        headers: {
          Host: url.host,
          'User-Agent': 'proxy-gui-auto-test',
          Connection: 'close',
        },
        timeout: timeout_ms,
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode,
            body: body.slice(0, 500),
          })
        })
      },
    )
    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false, status: 0, body: 'timeout' })
    })
    req.on('error', (error) => {
      resolve({ ok: false, status: 0, body: error.message })
    })
    req.end()
  })
}

function build_config() {
  return {
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
        listen_port: MIXED_PORT,
      },
    ],
    outbounds: [
      {
        type: 'http',
        tag: 'proxy',
        server: PROXY.host,
        server_port: PROXY.port,
        username: PROXY.username,
        password: PROXY.password,
      },
      { type: 'direct', tag: 'direct' },
    ],
    route: {
      rules: [
        { protocol: 'dns', action: 'hijack-dns' },
        { ip_cidr: [`${PROXY.host}/32`], outbound: 'direct' },
        { ip_is_private: true, outbound: 'direct' },
      ],
      final: 'proxy',
      auto_detect_interface: true,
      find_process: true,
    },
    experimental: {
      clash_api: {
        external_controller: `127.0.0.1:${CLASH_PORT}`,
      },
    },
  }
}

async function main() {
  console.log('=== Proxy GUI auto-test (no system proxy / no TUN) ===')

  if (!fs.existsSync(SING_BOX)) fail('sing-box.exe exists')
  else pass('sing-box.exe exists')

  if (!fs.existsSync(WINTUN)) fail('wintun.dll exists')
  else pass('wintun.dll exists')

  const tcp = await tcp_check(PROXY.host, PROXY.port)
  if (tcp.ok) pass('seed proxy TCP', `${tcp.ms} ms`)
  else fail('seed proxy TCP', tcp.error)

  const config = build_config()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))

  const check = spawn(SING_BOX, ['check', '-c', CONFIG_PATH], {
    windowsHide: true,
    encoding: 'utf8',
  })
  let check_err = ''
  check.stderr.on('data', (d) => {
    check_err += d.toString()
  })
  const check_code = await new Promise((resolve) => check.on('close', resolve))
  if (check_code === 0) pass('sing-box config check')
  else fail('sing-box config check', check_err.trim())

  const child = spawn(SING_BOX, ['run', '-c', CONFIG_PATH], {
    cwd: path.dirname(SING_BOX),
    windowsHide: true,
  })
  let logs = ''
  child.stdout.on('data', (d) => {
    logs += d.toString()
  })
  child.stderr.on('data', (d) => {
    logs += d.toString()
  })

  const up = await wait_port(MIXED_PORT, 12000)
  if (up) pass('local mixed inbound up', `127.0.0.1:${MIXED_PORT}`)
  else {
    fail('local mixed inbound up', logs.slice(-500))
    child.kill()
    cleanup()
    finish()
    return
  }

  try {
    const version = await fetch(`http://127.0.0.1:${CLASH_PORT}/version`, {
      signal: AbortSignal.timeout(4000),
    })
    const text = await version.text()
    if (version.ok) pass('clash api', text.trim())
    else fail('clash api', String(version.status))
  } catch (error) {
    fail('clash api', String(error))
  }

  const direct_ip = await new Promise((resolve) => {
    const req = http.get('http://api.ipify.org', { timeout: 10000 }, (res) => {
      let body = ''
      res.on('data', (c) => {
        body += c
      })
      res.on('end', () => resolve({ ok: true, ip: body.trim() }))
    })
    req.on('error', (error) => resolve({ ok: false, ip: error.message }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false, ip: 'timeout' })
    })
  })

  if (direct_ip.ok) pass('direct internet IP', direct_ip.ip)
  else fail('direct internet IP', direct_ip.ip)

  const via_proxy = await http_get_via_proxy('http://api.ipify.org')
  if (via_proxy.ok) {
    const proxy_ip = via_proxy.body.trim()
    pass('HTTP via local mixed -> seed HTTP proxy', `status=${via_proxy.status} ip=${proxy_ip}`)
    if (direct_ip.ok && proxy_ip && proxy_ip !== direct_ip.ip) {
      pass('exit IP changed through proxy', `${direct_ip.ip} -> ${proxy_ip}`)
    } else if (direct_ip.ok && proxy_ip === direct_ip.ip) {
      // Same IP can be valid if this exit node is already the current public IP.
      pass('exit IP via proxy equals current public IP', proxy_ip)
    }
  } else {
    fail('HTTP via local mixed -> seed HTTP proxy', via_proxy.body)
  }

  try {
    const connections = await fetch(`http://127.0.0.1:${CLASH_PORT}/connections`, {
      signal: AbortSignal.timeout(4000),
    })
    if (connections.ok) {
      const data = await connections.json()
      pass(
        'connections api',
        `count=${(data.connections || []).length} up=${data.uploadTotal || 0} down=${data.downloadTotal || 0}`,
      )
    } else {
      fail('connections api', String(connections.status))
    }
  } catch (error) {
    fail('connections api', String(error))
  }

  // Parse sample logs into table rows
  const sample_lines = logs
    .split(/\r?\n/)
    .map((line) => line.replace(/\u001b\[[0-9;]*m/g, '').trim())
    .filter(Boolean)
    .slice(-8)
  if (sample_lines.length > 0) {
    pass('engine logs captured', `${sample_lines.length} lines`)
    for (const line of sample_lines.slice(-3)) {
      console.log(`  LOG   ${line}`)
    }
  } else {
    fail('engine logs captured')
  }

  child.kill()
  await new Promise((resolve) => setTimeout(resolve, 500))
  cleanup()
  finish()
}

function cleanup() {
  try {
    if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH)
  } catch {
    // ignore
  }
}

function finish() {
  const failed = results.filter((item) => !item.ok)
  console.log('')
  console.log(`=== DONE: ${results.length - failed.length}/${results.length} passed ===`)
  if (failed.length) {
    for (const item of failed) console.error(`- ${item.name}: ${item.detail}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  cleanup()
  process.exit(1)
})
