import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppProfile,
  AppProfilePatch,
  AppSettings,
  BulkImportResult,
  ConnectionStatus,
  LiveConnection,
  ProxificationRule,
  ProxyCheckResult,
  ProxyGroup,
  ProxyServer,
  UpdateStatus,
  WorkMode,
} from './types'

const api = {
  profile_get: (): Promise<AppProfile> => ipcRenderer.invoke('profile_get'),
  profile_save: (patch: AppProfilePatch): Promise<AppProfile> =>
    ipcRenderer.invoke('profile_save', patch),
  profile_export: (): Promise<string> => ipcRenderer.invoke('profile_export'),
  profile_import: (json_text: string): Promise<AppProfile> =>
    ipcRenderer.invoke('profile_import', json_text),
  proxy_add: (
    proxy: Omit<ProxyServer, 'id' | 'last_latency_ms' | 'last_exit_ip' | 'last_checked_at'>,
  ): Promise<AppProfile> => ipcRenderer.invoke('proxy_add', proxy),
  proxy_update: (proxy: ProxyServer): Promise<AppProfile> =>
    ipcRenderer.invoke('proxy_update', proxy),
  proxy_delete: (proxy_id: string): Promise<AppProfile> =>
    ipcRenderer.invoke('proxy_delete', proxy_id),
  proxy_import_line: (line: string): Promise<AppProfile> =>
    ipcRenderer.invoke('proxy_import_line', line),
  proxy_import_bulk: (text: string): Promise<BulkImportResult> =>
    ipcRenderer.invoke('proxy_import_bulk', text),
  proxy_check: (proxy: ProxyServer): Promise<ProxyCheckResult> =>
    ipcRenderer.invoke('proxy_check', proxy),
  proxy_check_all: (): Promise<AppProfile> => ipcRenderer.invoke('proxy_check_all'),
  proxy_group_upsert: (group: ProxyGroup): Promise<AppProfile> =>
    ipcRenderer.invoke('proxy_group_upsert', group),
  proxy_group_delete: (group_id: string): Promise<AppProfile> =>
    ipcRenderer.invoke('proxy_group_delete', group_id),
  rule_upsert: (rule: ProxificationRule): Promise<AppProfile> =>
    ipcRenderer.invoke('rule_upsert', rule),
  rule_delete: (rule_id: string): Promise<AppProfile> =>
    ipcRenderer.invoke('rule_delete', rule_id),
  rule_reorder: (rule_ids: string[]): Promise<AppProfile> =>
    ipcRenderer.invoke('rule_reorder', rule_ids),
  dialog_pick_exe: (): Promise<string | null> => ipcRenderer.invoke('dialog_pick_exe'),
  mode_set: (work_mode: WorkMode): Promise<AppProfile> =>
    ipcRenderer.invoke('mode_set', work_mode),
  connection_start: (): Promise<ConnectionStatus> => ipcRenderer.invoke('connection_start'),
  connection_stop: (): Promise<ConnectionStatus> => ipcRenderer.invoke('connection_stop'),
  connection_status: (): Promise<ConnectionStatus> => ipcRenderer.invoke('connection_status'),
  connections_list: (): Promise<LiveConnection[]> => ipcRenderer.invoke('connections_list'),
  connection_kill: (connection_id: string): Promise<boolean> =>
    ipcRenderer.invoke('connection_kill', connection_id),
  engine_logs: (): Promise<string[]> => ipcRenderer.invoke('engine_logs'),
  admin_check: (): Promise<boolean> => ipcRenderer.invoke('admin_check'),
  admin_restart: (): Promise<void> => ipcRenderer.invoke('admin_restart'),
  select_proxy: (proxy_id: string): Promise<AppProfile> =>
    ipcRenderer.invoke('select_proxy', proxy_id),
  settings_update: (settings: AppSettings): Promise<AppProfile> =>
    ipcRenderer.invoke('settings_update', settings),
  startup_check: (): Promise<boolean> => ipcRenderer.invoke('startup_check'),
  update_status: (): Promise<UpdateStatus> => ipcRenderer.invoke('update_status'),
  update_check: (): Promise<UpdateStatus> => ipcRenderer.invoke('update_check'),
  update_install: (): Promise<UpdateStatus> => ipcRenderer.invoke('update_install'),
  on_update_status: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => {
      callback(status)
    }
    ipcRenderer.on('update_status_changed', listener)
    return () => {
      ipcRenderer.removeListener('update_status_changed', listener)
    }
  },
}

contextBridge.exposeInMainWorld('proxy_gui', api)

export type ProxyGuiApi = typeof api
