const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i]
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    }
  }
  return ~c >>> 0
}

function png_chunk(type, data) {
  const type_buf = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc_buf = Buffer.alloc(4)
  crc_buf.writeUInt32BE(crc32(Buffer.concat([type_buf, data])))
  return Buffer.concat([len, type_buf, data, crc_buf])
}

function make_png(size, r, g, b) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const i = row + 1 + x * 4
      const cx = x - size / 2
      const cy = y - size / 2
      const dist = Math.sqrt(cx * cx + cy * cy) / (size * 0.42)
      const inside = dist <= 1
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = inside ? 255 : 0
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    signature,
    png_chunk('IHDR', ihdr),
    png_chunk('IDAT', zlib.deflateSync(raw)),
    png_chunk('IEND', Buffer.alloc(0)),
  ])
}

function make_bmp_icon(size, r, g, b) {
  const row_size = size * 4
  const xor = Buffer.alloc(row_size * size)
  const and_row = Math.ceil(size / 32) * 4
  const and_mask = Buffer.alloc(and_row * size)

  for (let y = 0; y < size; y += 1) {
    const dest_y = size - 1 - y
    for (let x = 0; x < size; x += 1) {
      const cx = x - size / 2
      const cy = y - size / 2
      const dist = Math.sqrt(cx * cx + cy * cy) / (size * 0.42)
      const inside = dist <= 1
      const i = dest_y * row_size + x * 4
      xor[i] = b
      xor[i + 1] = g
      xor[i + 2] = r
      xor[i + 3] = inside ? 255 : 0
      if (!inside) {
        const byte_index = dest_y * and_row + Math.floor(x / 8)
        and_mask[byte_index] |= 0x80 >> (x % 8)
      }
    }
  }

  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)
  header.writeUInt32LE(xor.length + and_mask.length, 20)

  return Buffer.concat([header, xor, and_mask])
}

function build_ico(images) {
  const count = images.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)

  const entries = []
  let offset = 6 + count * 16
  const bodies = []

  for (const image of images) {
    const entry = Buffer.alloc(16)
    entry[0] = image.size >= 256 ? 0 : image.size
    entry[1] = image.size >= 256 ? 0 : image.size
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(image.data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    bodies.push(image.data)
    offset += image.data.length
  }

  return Buffer.concat([header, ...entries, ...bodies])
}

const out_dir = path.join(__dirname, '..', 'build')
fs.mkdirSync(out_dir, { recursive: true })

const sizes = [16, 32, 48, 256]
const ico = build_ico(
  sizes.map((size) => ({
    size,
    data: size === 256 ? make_png(size, 56, 189, 248) : make_bmp_icon(size, 56, 189, 248),
  })),
)

const ico_path = path.join(out_dir, 'icon.ico')
fs.writeFileSync(ico_path, ico)
fs.writeFileSync(path.join(out_dir, 'icon.png'), make_png(512, 56, 189, 248))
console.log(`Wrote ${ico_path} (${ico.length} bytes)`)
