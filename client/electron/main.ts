import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  check_for_updates,
  get_update_status,
  init_auto_updater,
  install_update_now,
  schedule_startup_update_check,
} from './auto_updater'
import { request_admin_restart } from './elevate'
import { detect_proxy_protocol_quick } from './proxy_check'
import {
  bulk_import_proxies,
  export_profile,
  import_profile,
  import_proxy_files,
  load_profile,
  parse_proxy_line,
  patch_profile,
} from './profile_store'
import {
  check_is_admin,
  check_all_proxies_latency,
  check_proxy,
  fetch_live_connections,
  get_connection_status,
  get_engine_logs,
  kill_connection,
  refresh_traffic,
  set_work_mode_status,
  start_engine,
  stop_engine,
} from './proxy_engine'
import { read_start_with_windows, set_start_with_windows } from './startup'
import { create_tray, destroy_tray } from './tray'
import type {
  AppProfile,
  AppProfilePatch,
  ProxificationRule,
  ProxyGroup,
  ProxyServer,
  WorkMode,
} from './types'

let main_window: BrowserWindow | null = null
let quitting = false

function create_window(): void {
  const start_minimized = process.argv.includes('--minimized')

  main_window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4f6f8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  main_window.once('ready-to-show', () => {
    if (!start_minimized) {
      main_window?.show()
    }
  })

  main_window.on('close', (event) => {
    const profile = load_profile()
    if (!quitting && profile.settings.minimize_to_tray) {
      event.preventDefault()
      main_window?.hide()
    }
  })

  main_window.webContents.on('did-fail-load', (_event, error_code, error_description, url) => {
    console.error(`Page failed to load (${error_code}): ${error_description} ${url}`)
  })

  void load_window(main_window)

  main_window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  create_tray(
    main_window,
    () => get_connection_status(),
    async () => {
      const profile = load_profile()
      await start_engine(profile)
    },
    async () => {
      await stop_engine()
    },
  )

  init_auto_updater(main_window)
}

async function load_window(window: BrowserWindow): Promise<void> {
  const dev_server_url = process.env.VITE_DEV_SERVER_URL
  if (dev_server_url && (await is_dev_server_up(dev_server_url))) {
    await window.loadURL(dev_server_url)
    return
  }
  await window.loadFile(path.join(__dirname, '../dist/index.html'))
}

async function is_dev_server_up(dev_server_url: string): Promise<boolean> {
  try {
    const response = await fetch(dev_server_url, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

function register_ipc(): void {
  ipcMain.handle('profile_get', () => load_profile())

  ipcMain.handle('profile_save', (_event, patch: AppProfilePatch) => patch_profile(patch))

  ipcMain.handle('profile_export', () => export_profile())

  ipcMain.handle('profile_import', (_event, json_text: string) => import_profile(json_text))

  ipcMain.handle('proxy_add', (_event, proxy_input: Omit<ProxyServer, 'id'>) => {
    const profile = load_profile()
    const proxy: ProxyServer = {
      ...proxy_input,
      id: randomUUID(),
      last_latency_ms: null,
      last_exit_ip: null,
      last_checked_at: null,
    }
    const proxies = [...profile.proxies, proxy]
    return patch_profile({
      proxies,
      selected_proxy_id: profile.selected_proxy_id ?? proxy.id,
    })
  })

  ipcMain.handle('proxy_update', (_event, proxy: ProxyServer) => {
    const profile = load_profile()
    const proxies = profile.proxies.map((item) => (item.id === proxy.id ? proxy : item))
    return patch_profile({ proxies })
  })

  ipcMain.handle('proxy_delete', (_event, proxy_id: string) => {
    const profile = load_profile()
    const proxies = profile.proxies.filter((item) => item.id !== proxy_id)
    const proxy_groups = profile.proxy_groups.map((group) => ({
      ...group,
      proxy_ids: group.proxy_ids.filter((id) => id !== proxy_id),
    }))
    const selected_proxy_id =
      profile.selected_proxy_id === proxy_id ? proxies[0]?.id ?? null : profile.selected_proxy_id
    return patch_profile({ proxies, proxy_groups, selected_proxy_id })
  })

  ipcMain.handle('proxy_import_line', async (_event, line: string) => {
    const parsed = parse_proxy_line(line)
    if (!parsed) {
      throw new Error('Неверный формат. Ожидается host:port:user:pass')
    }
    const protocol = await detect_proxy_protocol_quick(parsed)
    const profile = load_profile()
    const proxy: ProxyServer = {
      id: randomUUID(),
      name: `${parsed.host}:${parsed.port}`,
      enabled: true,
      ...parsed,
      protocol,
      last_latency_ms: null,
      last_exit_ip: null,
      last_checked_at: null,
    }
    return patch_profile({
      proxies: [...profile.proxies, proxy],
      selected_proxy_id: proxy.id,
    })
  })

  ipcMain.handle('proxy_import_bulk', async (_event, text: string) =>
    bulk_import_proxies(text, { test: true }),
  )

  ipcMain.handle('proxy_import_files', async () => {
    const result = await dialog.showOpenDialog(main_window ?? undefined, {
      title: 'Импорт прокси из .txt',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Proxy lists', extensions: ['txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return {
        imported: 0,
        skipped: 0,
        tested: 0,
        failed: 0,
        profile: load_profile(),
      }
    }
    return import_proxy_files(result.filePaths, { test: true })
  })

  ipcMain.handle('proxy_check', async (_event, proxy: ProxyServer) => check_proxy(proxy))

  ipcMain.handle('proxy_check_all', async () => {
    const profile = load_profile()
    await check_all_proxies_latency(profile)
    return load_profile()
  })

  ipcMain.handle('proxy_group_upsert', (_event, group: ProxyGroup) => {
    const profile = load_profile()
    const exists = profile.proxy_groups.some((item) => item.id === group.id)
    const proxy_groups = exists
      ? profile.proxy_groups.map((item) => (item.id === group.id ? group : item))
      : [...profile.proxy_groups, group]
    return patch_profile({ proxy_groups })
  })

  ipcMain.handle('proxy_group_delete', (_event, group_id: string) => {
    const profile = load_profile()
    const proxy_groups = profile.proxy_groups.filter((item) => item.id !== group_id)
    const selected_group_id =
      profile.settings.selected_group_id === group_id
        ? proxy_groups[0]?.id ?? null
        : profile.settings.selected_group_id
    return patch_profile({
      proxy_groups,
      settings: { ...profile.settings, selected_group_id },
    })
  })

  ipcMain.handle('rule_upsert', (_event, rule: ProxificationRule) => {
    const profile = load_profile()
    const exists = profile.rules.some((item) => item.id === rule.id)
    const rules = exists
      ? profile.rules.map((item) => (item.id === rule.id ? rule : item))
      : [...profile.rules, rule]
    return patch_profile({ rules })
  })

  ipcMain.handle('rule_delete', (_event, rule_id: string) => {
    const profile = load_profile()
    const target = profile.rules.find((item) => item.id === rule_id)
    if (target?.is_builtin && target.name === 'Default') {
      throw new Error('Правило Default нельзя удалить')
    }
    return patch_profile({
      rules: profile.rules.filter((item) => item.id !== rule_id),
    })
  })

  ipcMain.handle('rule_reorder', (_event, rule_ids: string[]) => {
    const profile = load_profile()
    const map = new Map(profile.rules.map((rule) => [rule.id, rule]))
    const ordered: ProxificationRule[] = []
    for (const id of rule_ids) {
      const rule = map.get(id)
      if (rule) {
        ordered.push(rule)
        map.delete(id)
      }
    }
    for (const rule of map.values()) {
      ordered.push(rule)
    }
    return patch_profile({ rules: ordered })
  })

  ipcMain.handle('dialog_pick_exe', async () => {
    const result = await dialog.showOpenDialog(main_window ?? undefined, {
      title: 'Выберите приложение',
      properties: ['openFile'],
      filters: [{ name: 'Executable', extensions: ['exe'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return path.basename(result.filePaths[0])
  })

  ipcMain.handle('mode_set', (_event, work_mode: WorkMode) => {
    const profile = patch_profile({ work_mode })
    set_work_mode_status(work_mode)
    return profile
  })

  ipcMain.handle('connection_start', async () => {
    const profile = load_profile()
    return start_engine(profile)
  })

  ipcMain.handle('connection_stop', async () => {
    return stop_engine()
  })

  ipcMain.handle('connection_status', async () => {
    const profile = load_profile()
    return refresh_traffic(profile.settings.clash_api_port)
  })

  ipcMain.handle('connections_list', async () => {
    const profile = load_profile()
    const status = get_connection_status()
    if (status.state !== 'connected') return []
    return fetch_live_connections(profile.settings.clash_api_port)
  })

  ipcMain.handle('connection_kill', async (_event, connection_id: string) => {
    const profile = load_profile()
    return kill_connection(profile.settings.clash_api_port, connection_id)
  })

  ipcMain.handle('engine_logs', () => get_engine_logs())

  ipcMain.handle('admin_check', () => check_is_admin())

  ipcMain.handle('admin_restart', () => {
    request_admin_restart()
  })

  ipcMain.handle('select_proxy', (_event, proxy_id: string) => {
    return patch_profile({ selected_proxy_id: proxy_id })
  })

  ipcMain.handle('settings_update', (_event, settings: AppProfile['settings']) => {
    const profile = patch_profile({ settings })
    set_start_with_windows(settings.start_with_windows)
    return profile
  })

  ipcMain.handle('startup_check', () => read_start_with_windows())

  ipcMain.handle('update_status', () => get_update_status())

  ipcMain.handle('update_check', async () => check_for_updates(true))

  ipcMain.handle('update_install', () => install_update_now())
}

app.whenReady().then(async () => {
  register_ipc()
  const profile = load_profile()

  if (profile.settings.start_with_windows !== read_start_with_windows()) {
    set_start_with_windows(profile.settings.start_with_windows)
  }

  create_window()

  if (profile.settings.auto_connect && (profile.selected_proxy_id || profile.settings.use_proxy_group)) {
    void start_engine(profile)
  }

  if (profile.settings.auto_check_updates) {
    schedule_startup_update_check()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      create_window()
    } else {
      main_window?.show()
    }
  })
})

app.on('before-quit', () => {
  quitting = true
  destroy_tray()
  void stop_engine()
})

app.on('window-all-closed', () => {
  const profile = load_profile()
  if (profile.settings.minimize_to_tray && !quitting) {
    return
  }
  void stop_engine().finally(() => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
})
