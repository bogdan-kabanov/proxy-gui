const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const { execFileSync } = require('node:child_process')

const SING_BOX_VERSION = '1.11.15'
const ASSET_NAME = `sing-box-${SING_BOX_VERSION}-windows-amd64.zip`
const DOWNLOAD_URL = `https://github.com/SagerNet/sing-box/releases/download/v${SING_BOX_VERSION}/${ASSET_NAME}`
const WINTUN_URL = 'https://www.wintun.net/builds/wintun-0.14.1.zip'
const TARGET_DIR = path.join(__dirname, '..', 'resources', 'sing-box')
const ZIP_PATH = path.join(TARGET_DIR, ASSET_NAME)
const EXE_PATH = path.join(TARGET_DIR, 'sing-box.exe')
const WINTUN_PATH = path.join(TARGET_DIR, 'wintun.dll')

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination)
    const request = https.get(url, { headers: { 'User-Agent': 'proxy-gui' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close()
        fs.unlinkSync(destination)
        download(response.headers.location, destination).then(resolve).catch(reject)
        return
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${response.statusCode} for ${url}`))
        return
      }
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    })
    request.on('error', reject)
  })
}

function extract_zip(zip_path, destination) {
  fs.mkdirSync(destination, { recursive: true })
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path "${zip_path}" -DestinationPath "${destination}" -Force`,
    ],
    { stdio: 'inherit', windowsHide: true },
  )
}

async function ensure_sing_box() {
  if (fs.existsSync(EXE_PATH)) {
    console.log('sing-box.exe already present')
    return
  }

  console.log(`Downloading ${DOWNLOAD_URL}`)
  await download(DOWNLOAD_URL, ZIP_PATH)

  const extract_dir = path.join(TARGET_DIR, 'extract-sing-box')
  extract_zip(ZIP_PATH, extract_dir)

  const nested_dir = path.join(extract_dir, `sing-box-${SING_BOX_VERSION}-windows-amd64`)
  const extracted_exe = path.join(nested_dir, 'sing-box.exe')
  if (!fs.existsSync(extracted_exe)) {
    throw new Error('sing-box.exe not found in archive')
  }

  fs.copyFileSync(extracted_exe, EXE_PATH)

  const wintun_src = path.join(nested_dir, 'wintun.dll')
  if (fs.existsSync(wintun_src)) {
    fs.copyFileSync(wintun_src, WINTUN_PATH)
  }

  fs.rmSync(extract_dir, { recursive: true, force: true })
  fs.unlinkSync(ZIP_PATH)
  console.log('sing-box installed')
}

async function ensure_wintun() {
  if (fs.existsSync(WINTUN_PATH)) {
    console.log('wintun.dll already present')
    return
  }

  console.log(`Downloading ${WINTUN_URL}`)
  const zip_path = path.join(TARGET_DIR, 'wintun.zip')
  await download(WINTUN_URL, zip_path)

  const extract_dir = path.join(TARGET_DIR, 'extract-wintun')
  extract_zip(zip_path, extract_dir)

  const candidates = [
    path.join(extract_dir, 'wintun', 'bin', 'amd64', 'wintun.dll'),
    path.join(extract_dir, 'bin', 'amd64', 'wintun.dll'),
  ]
  const found = candidates.find((item) => fs.existsSync(item))
  if (!found) {
    throw new Error('wintun.dll not found in archive')
  }

  fs.copyFileSync(found, WINTUN_PATH)
  fs.rmSync(extract_dir, { recursive: true, force: true })
  fs.unlinkSync(zip_path)
  console.log('wintun.dll installed')
}

async function main() {
  fs.mkdirSync(TARGET_DIR, { recursive: true })
  await ensure_sing_box()
  await ensure_wintun()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
