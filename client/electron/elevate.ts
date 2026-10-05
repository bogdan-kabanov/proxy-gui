import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export function request_admin_restart(): void {
  const exe_path = process.execPath
  const args = process.argv.slice(1).filter((arg) => arg !== '--elevated')
  args.push('--elevated')

  const quoted_args = args.map((arg) => `"${arg.replace(/"/g, '\\"')}"`).join(' ')
  const ps_command = `Start-Process -FilePath "${exe_path.replace(/"/g, '`"')}" -ArgumentList ${quoted_args} -Verb RunAs`

  spawn('powershell.exe', ['-NoProfile', '-Command', ps_command], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref()

  app.quit()
}

export function resolve_wintun_ready(): boolean {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'sing-box')
    : path.join(app.getAppPath(), 'resources', 'sing-box')
  return fs.existsSync(path.join(base, 'wintun.dll'))
}
