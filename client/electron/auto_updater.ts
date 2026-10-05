import { app, BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not_available'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  current_version: string
  available_version: string | null
  progress_percent: number
  message: string
}

let update_status: UpdateStatus = {
  state: 'idle',
  current_version: app.getVersion(),
  available_version: null,
  progress_percent: 0,
  message: 'Проверка обновлений ещё не запускалась',
}

let main_window_ref: BrowserWindow | null = null
let initialized = false

function set_status(partial: Partial<UpdateStatus>): UpdateStatus {
  update_status = {
    ...update_status,
    current_version: app.getVersion(),
    ...partial,
  }
  if (main_window_ref && !main_window_ref.isDestroyed()) {
    main_window_ref.webContents.send('update_status_changed', update_status)
  }
  return update_status
}

export function get_update_status(): UpdateStatus {
  return {
    ...update_status,
    current_version: app.getVersion(),
  }
}

export function init_auto_updater(main_window: BrowserWindow): void {
  main_window_ref = main_window

  if (!app.isPackaged) {
    set_status({
      state: 'idle',
      message: 'Автообновление доступно только в установленной версии',
    })
    return
  }

  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    set_status({
      state: 'checking',
      progress_percent: 0,
      message: 'Проверка обновлений…',
    })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    set_status({
      state: 'available',
      available_version: info.version,
      message: `Доступна версия ${info.version}, скачивание…`,
    })
  })

  autoUpdater.on('update-not-available', () => {
    set_status({
      state: 'not_available',
      available_version: null,
      progress_percent: 0,
      message: `Установлена актуальная версия ${app.getVersion()}`,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    set_status({
      state: 'downloading',
      progress_percent: Math.round(progress.percent),
      message: `Скачивание обновления… ${Math.round(progress.percent)}%`,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    set_status({
      state: 'ready',
      available_version: info.version,
      progress_percent: 100,
      message: `Версия ${info.version} готова. Перезапустите, чтобы установить.`,
    })
  })

  autoUpdater.on('error', (error) => {
    set_status({
      state: 'error',
      message: `Ошибка обновления: ${error.message}`,
    })
  })
}

export async function check_for_updates(manual = false): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return set_status({
      state: 'idle',
      message: 'Автообновление доступно только в установленной версии',
    })
  }

  try {
    set_status({
      state: 'checking',
      message: manual ? 'Ручная проверка обновлений…' : 'Проверка обновлений…',
    })
    await autoUpdater.checkForUpdates()
    return get_update_status()
  } catch (error) {
    return set_status({
      state: 'error',
      message: `Не удалось проверить обновления: ${String(error)}`,
    })
  }
}

export function install_update_now(): UpdateStatus {
  if (update_status.state !== 'ready') {
    return set_status({
      message: 'Нет скачанного обновления для установки',
    })
  }

  // isSilent=false, isForceRunAfter=true
  autoUpdater.quitAndInstall(false, true)
  return get_update_status()
}

export function schedule_startup_update_check(delay_ms = 8000): void {
  if (!app.isPackaged) return
  setTimeout(() => {
    void check_for_updates(false)
  }, delay_ms)
}
