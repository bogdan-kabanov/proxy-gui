import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { load_profile, parse_proxy_line, patch_profile } from './profile_store'
import {
  check_is_admin,
  check_proxy,
  fetch_live_connections,
  get_connection_status,
  get_engine_logs,
  refresh_traffic,
  set_work_mode_status,
  start_engine,
  stop_engine,
} from './proxy_engine'
import type {
  AppProfile,
  AppProfilePatch,
  ProxificationRule,
  ProxyServer,
  WorkMode,
} from './types'

let main_window: BrowserWindow | null = null

function create_window(): void {
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
    main_window?.show()
  })

  main_window.webContents.on('did-fail-load', (_event, error_code, error_description, url) => {
    console.error(`Page failed to load (${error_code}): ${error_description} ${url}`)
  })

  void load_window(main_window)

  main_window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
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

  ipcMain.handle('profile_save', (_event, patch: AppProfilePatch) => {
    return patch_profile(patch)
  })

  ipcMain.handle('proxy_add', (_event, proxy_input: Omit<ProxyServer, 'id'>) => {
    const profile = load_profile()
    const proxy: ProxyServer = {
      ...proxy_input,
      id: randomUUID(),
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
    const selected_proxy_id =
      profile.selected_proxy_id === proxy_id ? proxies[0]?.id ?? null : profile.selected_proxy_id
    return patch_profile({ proxies, selected_proxy_id })
  })

  ipcMain.handle('proxy_import_line', (_event, line: string) => {
    const parsed = parse_proxy_line(line)
    if (!parsed) {
      throw new Error('Неверный формат. Ожидается host:port:user:pass')
    }
    const profile = load_profile()
    const proxy: ProxyServer = {
      id: randomUUID(),
      name: `${parsed.host}:${parsed.port}`,
      enabled: true,
      ...parsed,
    }
    return patch_profile({
      proxies: [...profile.proxies, proxy],
      selected_proxy_id: proxy.id,
    })
  })

  ipcMain.handle('proxy_check', async (_event, proxy: ProxyServer) => {
    return check_proxy(proxy)
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

  ipcMain.handle('engine_logs', () => get_engine_logs())

  ipcMain.handle('admin_check', () => check_is_admin())

  ipcMain.handle('select_proxy', (_event, proxy_id: string) => {
    return patch_profile({ selected_proxy_id: proxy_id })
  })

  ipcMain.handle('settings_update', (_event, settings: AppProfile['settings']) => {
    return patch_profile({ settings })
  })
}

app.whenReady().then(async () => {
  register_ipc()
  const profile = load_profile()
  create_window()

  if (profile.settings.auto_connect && profile.selected_proxy_id) {
    void start_engine(profile)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      create_window()
    }
  })
})

app.on('window-all-closed', () => {
  void stop_engine().finally(() => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
})

app.on('before-quit', () => {
  void stop_engine()
})
