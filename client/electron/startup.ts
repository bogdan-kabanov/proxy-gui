import { execFileSync } from 'node:child_process'
import { Registry } from './win_registry'

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const APP_NAME = 'ProxyGUI'

export function set_start_with_windows(enabled: boolean): void {
  if (enabled) {
    const exe_path = process.execPath.replace(/\\/g, '\\\\')
    Registry.set(RUN_KEY, APP_NAME, `"${process.execPath}" --minimized`, 'REG_SZ')
    void exe_path
  } else {
    try {
      execFileSync('reg', ['delete', RUN_KEY, '/v', APP_NAME, '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      })
    } catch {
      // key may not exist
    }
  }
}

export function read_start_with_windows(): boolean {
  const value = Registry.get(RUN_KEY, APP_NAME)
  return Boolean(value)
}
