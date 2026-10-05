import net from 'node:net'
import type { ProxyCheckResult, ProxyProtocol, ProxyServer } from './types'

const CHECK_URL = 'http://api.ipify.org/'

function extract_ip_from_http(body: string): string | null {
  const match = body.match(/\r\n\r\n([\s\S]*)/)
  const ip = match?.[1]?.trim().split(/\s/)[0] ?? ''
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip
  return null
}

async function check_http_proxy(proxy: ProxyServer, timeout_ms: number): Promise<ProxyCheckResult> {
  const started = Date.now()
  const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')

  return new Promise((resolve) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port })
    let buffer = ''

    const timer = setTimeout(() => {
      socket.destroy()
      resolve({
        ok: false,
        latency_ms: null,
        exit_ip: null,
        protocol: 'http',
        message: 'Таймаут HTTP прокси',
      })
    }, timeout_ms)

    socket.on('connect', () => {
      socket.write(
        `GET ${CHECK_URL} HTTP/1.1\r\nHost: api.ipify.org\r\nProxy-Authorization: Basic ${auth}\r\nConnection: close\r\n\r\n`,
      )
    })

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      if (buffer.includes('\r\n\r\n') && /HTTP\/1\.\d 200/.test(buffer)) {
        clearTimeout(timer)
        const latency_ms = Date.now() - started
        const exit_ip = extract_ip_from_http(buffer)
        socket.destroy()
        resolve({
          ok: Boolean(exit_ip),
          latency_ms,
          exit_ip,
          protocol: 'http',
          message: exit_ip
            ? `HTTP OK · ${exit_ip} · ${latency_ms} ms`
            : `HTTP 200, но IP не распознан · ${latency_ms} ms`,
        })
      }
    })

    socket.on('error', (error) => {
      clearTimeout(timer)
      resolve({
        ok: false,
        latency_ms: null,
        exit_ip: null,
        protocol: 'http',
        message: error.message,
      })
    })
  })
}

async function check_socks5_proxy(proxy: ProxyServer, timeout_ms: number): Promise<ProxyCheckResult> {
  const started = Date.now()

  return new Promise((resolve) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port })
    let stage: 'greeting' | 'auth' | 'connect' | 'http' = 'greeting'
    let buffer = Buffer.alloc(0)

    const fail = (message: string) => {
      clearTimeout(timer)
      socket.destroy()
      resolve({
        ok: false,
        latency_ms: null,
        exit_ip: null,
        protocol: 'socks5',
        message,
      })
    }

    const timer = setTimeout(() => fail('Таймаут SOCKS5'), timeout_ms)

    socket.on('connect', () => {
      socket.write(Buffer.from([0x05, 0x01, 0x02]))
    })

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])

      if (stage === 'greeting') {
        if (buffer.length < 2) return
        if (buffer[0] !== 0x05 || buffer[1] !== 0x02) {
          fail('SOCKS5 auth method не поддерживается')
          return
        }
        buffer = Buffer.alloc(0)
        stage = 'auth'
        const user_buf = Buffer.from(proxy.username)
        const pass_buf = Buffer.from(proxy.password)
        socket.write(
          Buffer.concat([
            Buffer.from([0x01, user_buf.length]),
            user_buf,
            Buffer.from([pass_buf.length]),
            pass_buf,
          ]),
        )
        return
      }

      if (stage === 'auth') {
        if (buffer.length < 2) return
        if (buffer[0] !== 0x01 || buffer[1] !== 0x00) {
          fail('SOCKS5 auth failed')
          return
        }
        buffer = Buffer.alloc(0)
        stage = 'connect'
        const host_buf = Buffer.from('api.ipify.org')
        socket.write(
          Buffer.concat([
            Buffer.from([0x05, 0x01, 0x00, 0x03, host_buf.length]),
            host_buf,
            Buffer.from([0x00, 0x50]),
          ]),
        )
        return
      }

      if (stage === 'connect') {
        if (buffer.length < 4) return
        if (buffer[1] !== 0x00) {
          fail(`SOCKS5 connect failed (${buffer[1]})`)
          return
        }
        let need = 4
        if (buffer[3] === 0x01) need += 4 + 2
        else if (buffer[3] === 0x03) {
          if (buffer.length < 5) return
          need += 1 + buffer[4] + 2
        } else if (buffer[3] === 0x04) need += 16 + 2
        if (buffer.length < need) return
        buffer = buffer.slice(need)
        stage = 'http'
        socket.write(
          'GET / HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n',
        )
        return
      }

      if (stage === 'http') {
        const text = buffer.toString('utf8')
        if (/HTTP\/1\.\d 200/.test(text) && text.includes('\r\n\r\n')) {
          clearTimeout(timer)
          const latency_ms = Date.now() - started
          const exit_ip = extract_ip_from_http(text)
          socket.destroy()
          resolve({
            ok: Boolean(exit_ip),
            latency_ms,
            exit_ip,
            protocol: 'socks5',
            message: exit_ip
              ? `SOCKS5 OK · ${exit_ip} · ${latency_ms} ms`
              : `SOCKS5 200, но IP не распознан · ${latency_ms} ms`,
          })
        }
      }
    })

    socket.on('error', (error) => fail(error.message))
  })
}

export async function detect_proxy_protocol_quick(
  proxy: Pick<ProxyServer, 'host' | 'port' | 'username' | 'password'>,
): Promise<ProxyProtocol> {
  const http_result = await check_http_proxy(
    { ...proxy, id: '', name: '', protocol: 'http', enabled: true, last_latency_ms: null, last_exit_ip: null, last_checked_at: null },
    5000,
  )
  if (http_result.ok) return 'http'

  const socks_result = await check_socks5_proxy(
    { ...proxy, id: '', name: '', protocol: 'socks5', enabled: true, last_latency_ms: null, last_exit_ip: null, last_checked_at: null },
    5000,
  )
  if (socks_result.ok) return 'socks5'

  return 'http'
}

export async function check_proxy_full(proxy: ProxyServer, timeout_ms = 12000): Promise<ProxyCheckResult> {
  let working = proxy.protocol
  let result = await (working === 'socks5'
    ? check_socks5_proxy(proxy, timeout_ms)
    : check_http_proxy(proxy, timeout_ms))

  if (!result.ok && proxy.protocol !== 'socks5') {
    const alt = await check_socks5_proxy({ ...proxy, protocol: 'socks5' }, timeout_ms)
    if (alt.ok) {
      working = 'socks5'
      result = alt
    }
  }

  if (!result.ok && proxy.protocol === 'socks5') {
    const alt = await check_http_proxy({ ...proxy, protocol: 'http' }, timeout_ms)
    if (alt.ok) {
      working = 'http'
      result = alt
    }
  }

  if (result.ok && result.protocol !== working) {
    result = { ...result, protocol: working }
  }

  return result
}
