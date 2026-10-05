import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppProfile,
  AppProfilePatch,
  AppSettings,
  ConnectionStatus,
  LiveConnection,
  ProxificationRule,
  ProxyCheckResult,
  ProxyServer,
  WorkMode,
} from './types'

const api = {
  profile_get: (): Promise<AppProfile> => ipcRenderer.invoke('profile_get'),
  profile_save: (patch: AppProfilePatch): Promise<AppProfile> =>
    ipcRenderer.invoke('profile_save', patch),
  proxy_add: (proxy: Omit<ProxyServer, 'id'>): Promise<AppProfile> =>
    ipcRenderer.invoke('proxy_add', proxy),
  proxy_update: (proxy: ProxyServer): Promise<AppProfile> =>
    ipcRenderer.invoke('proxy_update', proxy),
  proxy_delete: (proxy_id: string): Promise<AppProfile> =>
    ipcRenderer.invoke('proxy_delete', proxy_id),
  proxy_import_line: (line: string): Promise<AppProfile> =>
    ipcRenderer.invoke('proxy_import_line', line),
  proxy_check: (proxy: ProxyServer): Promise<ProxyCheckResult> =>
    ipcRenderer.invoke('proxy_check', proxy),
  rule_upsert: (rule: ProxificationRule): Promise<AppProfile> =>
    ipcRenderer.invoke('rule_upsert', rule),
  rule_delete: (rule_id: string): Promise<AppProfile> =>
    ipcRenderer.invoke('rule_delete', rule_id),
  rule_reorder: (rule_ids: string[]): Promise<AppProfile> =>
    ipcRenderer.invoke('rule_reorder', rule_ids),
  mode_set: (work_mode: WorkMode): Promise<AppProfile> =>
    ipcRenderer.invoke('mode_set', work_mode),
  connection_start: (): Promise<ConnectionStatus> => ipcRenderer.invoke('connection_start'),
  connection_stop: (): Promise<ConnectionStatus> => ipcRenderer.invoke('connection_stop'),
  connection_status: (): Promise<ConnectionStatus> => ipcRenderer.invoke('connection_status'),
  connections_list: (): Promise<LiveConnection[]> => ipcRenderer.invoke('connections_list'),
  engine_logs: (): Promise<string[]> => ipcRenderer.invoke('engine_logs'),
  admin_check: (): Promise<boolean> => ipcRenderer.invoke('admin_check'),
  select_proxy: (proxy_id: string): Promise<AppProfile> =>
    ipcRenderer.invoke('select_proxy', proxy_id),
  settings_update: (settings: AppSettings): Promise<AppProfile> =>
    ipcRenderer.invoke('settings_update', settings),
}

contextBridge.exposeInMainWorld('proxy_gui', api)

export type ProxyGuiApi = typeof api
