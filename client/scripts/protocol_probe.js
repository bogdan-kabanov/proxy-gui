const net = require('node:net')
const tls = require('node:tls')

const HOST = '45.11.183.190'
const PORT = 11707
const USER = 'modeler_TBbGST'
const PASS = 'GxBi5GsRDlbV'

function probe_raw(label, payload, use_tls = false, wait_ms = 5000) {
  return new Promise((resolve) => {
    const started = Date.now()
    const chunks = []
    const socket = use_tls
      ? tls.connect({ host: HOST, port: PORT, servername: HOST, rejectUnauthorized: false })
      : net.connect({ host: HOST, port: PORT })

    const finish = (extra = {}) => {
      clearTimeout(timer)
      try {
        socket.destroy()
      } catch {}
      resolve({
        label,
        ms: Date.now() - started,
        hex: Buffer.concat(chunks).toString('hex').slice(0, 200),
        text: Buffer.concat(chunks).toString('utf8').slice(0, 300),
        ...extra,
      })
    }

    const timer = setTimeout(() => finish({ event: 'timeout' }), wait_ms)

    socket.on('secureConnect', () => {
      if (payload) socket.write(payload)
    })
    socket.on('connect', () => {
      if (!use_tls && payload) socket.write(payload)
    })
    socket.on('data', (d) => {
      chunks.push(d)
      if (Buffer.concat(chunks).length > 8) finish({ event: 'data' })
    })
    socket.on('error', (error) => finish({ event: 'error', error: error.message }))
    socket.on('end', () => finish({ event: 'end' }))
  })
}

async function main() {
  const auth = Buffer.from(`${USER}:${PASS}`).toString('base64')

  const tests = [
    await probe_raw('idle-tcp', null, false, 3000),
    await probe_raw('socks-greeting', Buffer.from([0x05, 0x01, 0x02]), false, 5000),
    await probe_raw(
      'http-connect',
      Buffer.from(
        `CONNECT api.ipify.org:443 HTTP/1.1\r\nHost: api.ipify.org:443\r\nProxy-Authorization: Basic ${auth}\r\n\r\n`,
      ),
      false,
      8000,
    ),
    await probe_raw(
      'http-get-abs',
      Buffer.from(
        `GET http://api.ipify.org/ HTTP/1.1\r\nHost: api.ipify.org\r\nProxy-Authorization: Basic ${auth}\r\nConnection: close\r\n\r\n`,
      ),
      false,
      8000,
    ),
    await probe_raw('tls-hello', null, true, 5000),
  ]

  console.log(JSON.stringify(tests, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
