const net = require('node:net')

const HOST = '45.11.183.190'
const PORT = 11707
const USER = 'modeler_TBbGST'
const PASS = 'GxBi5GsRDlbV'
const TARGET_HOST = 'api.ipify.org'
const TARGET_PORT = 80

function socks5_http_get() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port: PORT })
    let stage = 'greeting'
    let buffer = Buffer.alloc(0)
    const chunks = []
    const timer = setTimeout(() => {
      socket.destroy()
      resolve({ ok: false, error: `timeout at ${stage}`, body: Buffer.concat(chunks).toString('utf8') })
    }, 20000)

    socket.on('connect', () => {
      // greeting: ver=5, nmethods=1, method=username/password
      socket.write(Buffer.from([0x05, 0x01, 0x02]))
    })

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data])
      chunks.push(data)

      if (stage === 'greeting') {
        if (buffer.length < 2) return
        if (buffer[0] !== 0x05 || buffer[1] !== 0x02) {
          clearTimeout(timer)
          socket.destroy()
          resolve({ ok: false, error: `bad greeting ${buffer[0]},${buffer[1]}` })
          return
        }
        buffer = Buffer.alloc(0)
        stage = 'auth'
        const user_buf = Buffer.from(USER)
        const pass_buf = Buffer.from(PASS)
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
          clearTimeout(timer)
          socket.destroy()
          resolve({ ok: false, error: `auth failed status=${buffer[1]}` })
          return
        }
        buffer = Buffer.alloc(0)
        stage = 'connect'
        const host_buf = Buffer.from(TARGET_HOST)
        socket.write(
          Buffer.concat([
            Buffer.from([0x05, 0x01, 0x00, 0x03, host_buf.length]),
            host_buf,
            Buffer.from([(TARGET_PORT >> 8) & 0xff, TARGET_PORT & 0xff]),
          ]),
        )
        return
      }

      if (stage === 'connect') {
        if (buffer.length < 4) return
        if (buffer[1] !== 0x00) {
          clearTimeout(timer)
          socket.destroy()
          resolve({ ok: false, error: `connect failed reply=${buffer[1]}` })
          return
        }
        // skip bound address
        let need = 4
        if (buffer[3] === 0x01) need += 4 + 2
        else if (buffer[3] === 0x03) {
          if (buffer.length < 5) return
          need += 1 + buffer[4] + 2
        } else if (buffer[3] === 0x04) need += 16 + 2
        if (buffer.length < need) return
        buffer = buffer.slice(need)
        stage = 'http'
        const req = `GET / HTTP/1.1\r\nHost: ${TARGET_HOST}\r\nConnection: close\r\nUser-Agent: socks-test\r\n\r\n`
        socket.write(req)
        return
      }

      if (stage === 'http') {
        const text = Buffer.concat(chunks).toString('utf8')
        if (text.includes('\r\n\r\n')) {
          // wait a bit more for body or connection end
        }
      }
    })

    socket.on('end', () => {
      clearTimeout(timer)
      const text = Buffer.concat(chunks).toString('utf8')
      const body_match = text.match(/\r\n\r\n([\s\S]*)$/)
      resolve({
        ok: stage === 'http' && /HTTP\/1\.\d 200/.test(text),
        error: null,
        stage,
        body: body_match ? body_match[1].trim() : text.slice(-200),
      })
    })

    socket.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, error: error.message, stage })
    })
  })
}

socks5_http_get().then((result) => {
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.ok ? 0 : 1)
})
