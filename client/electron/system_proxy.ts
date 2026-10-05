import { execFileSync, execSync } from 'node:child_process'
import { Registry } from './win_registry'

const INTERNET_SETTINGS =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'

export interface SystemProxySnapshot {
  proxy_enable: number
  proxy_server: string
  proxy_override: string
  winhttp_proxy: string
}

let previous_snapshot: SystemProxySnapshot | null = null

function read_winhttp_proxy(): string {
  try {
    return execFileSync('netsh', ['winhttp', 'show', 'proxy'], {
      encoding: 'utf8',
      windowsHide: true,
    })
  } catch {
    return ''
  }
}

export function read_system_proxy(): SystemProxySnapshot {
  return {
    proxy_enable: Number(Registry.get(INTERNET_SETTINGS, 'ProxyEnable') ?? '0'),
    proxy_server: String(Registry.get(INTERNET_SETTINGS, 'ProxyServer') ?? ''),
    proxy_override: String(Registry.get(INTERNET_SETTINGS, 'ProxyOverride') ?? ''),
    winhttp_proxy: read_winhttp_proxy(),
  }
}

export function enable_system_proxy(host: string, port: number): void {
  if (!previous_snapshot) {
    previous_snapshot = read_system_proxy()
  }

  Registry.set(INTERNET_SETTINGS, 'ProxyEnable', '1', 'REG_DWORD')
  // Explicit http/https endpoints — required for Chromium/YouTube reliability.
  Registry.set(
    INTERNET_SETTINGS,
    'ProxyServer',
    `http=${host}:${port};https=${host}:${port}`,
    'REG_SZ',
  )
  Registry.set(
    INTERNET_SETTINGS,
    'ProxyOverride',
    'localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;<local>',
    'REG_SZ',
  )

  try {
    execFileSync(
      'netsh',
      ['winhttp', 'set', 'proxy', `${host}:${port}`, 'bypass-list=localhost;127.*;<local>'],
      { windowsHide: true },
    )
  } catch {
    // WinHTTP may require elevation; IE/Chromium still use registry.
  }

  notify_proxy_change()
}

export function restore_system_proxy(): void {
  if (!previous_snapshot) {
    Registry.set(INTERNET_SETTINGS, 'ProxyEnable', '0', 'REG_DWORD')
    Registry.set(INTERNET_SETTINGS, 'ProxyServer', '', 'REG_SZ')
    try {
      execFileSync('netsh', ['winhttp', 'reset', 'proxy'], { windowsHide: true })
    } catch {
      // ignore
    }
    notify_proxy_change()
    return
  }

  Registry.set(
    INTERNET_SETTINGS,
    'ProxyEnable',
    String(previous_snapshot.proxy_enable),
    'REG_DWORD',
  )
  Registry.set(INTERNET_SETTINGS, 'ProxyServer', previous_snapshot.proxy_server, 'REG_SZ')
  Registry.set(INTERNET_SETTINGS, 'ProxyOverride', previous_snapshot.proxy_override, 'REG_SZ')

  try {
    if (/прямой доступ|direct access/i.test(previous_snapshot.winhttp_proxy)) {
      execFileSync('netsh', ['winhttp', 'reset', 'proxy'], { windowsHide: true })
    }
  } catch {
    // ignore
  }

  previous_snapshot = null
  notify_proxy_change()
}

function notify_proxy_change(): void {
  try {
    execSync(
      'powershell -NoProfile -Command "[void][System.Reflection.Assembly]::LoadWithPartialName(\'System\'); $signature = \'[DllImport(\\\"wininet.dll\\\", SetLastError=true)] public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);\'; $type = Add-Type -MemberDefinition $signature -Name WinINet -Namespace Native -PassThru; $type::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null; $type::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null"',
      { stdio: 'ignore', windowsHide: true },
    )
  } catch {
    // Best-effort notification for WinInet consumers.
  }
}
