/// <reference types="vite/client" />

declare const __APP_VERSION__: string

import type {
  AppProfile,
  AppSettings,
  ConnectionStatus,
  LiveConnection,
  ProxificationRule,
  ProxyCheckResult,
  ProxyServer,
  WorkMode,
} from '../../electron/types'

export interface ProxyGuiApi {
  profile_get: () => Promise<AppProfile>
  profile_save: (patch: Partial<AppProfile>) => Promise<AppProfile>
  proxy_add: (proxy: Omit<ProxyServer, 'id'>) => Promise<AppProfile>
  proxy_update: (proxy: ProxyServer) => Promise<AppProfile>
  proxy_delete: (proxy_id: string) => Promise<AppProfile>
  proxy_import_line: (line: string) => Promise<AppProfile>
  proxy_check: (proxy: ProxyServer) => Promise<ProxyCheckResult>
  rule_upsert: (rule: ProxificationRule) => Promise<AppProfile>
  rule_delete: (rule_id: string) => Promise<AppProfile>
  rule_reorder: (rule_ids: string[]) => Promise<AppProfile>
  mode_set: (work_mode: WorkMode) => Promise<AppProfile>
  connection_start: () => Promise<ConnectionStatus>
  connection_stop: () => Promise<ConnectionStatus>
  connection_status: () => Promise<ConnectionStatus>
  connections_list: () => Promise<LiveConnection[]>
  engine_logs: () => Promise<string[]>
  admin_check: () => Promise<boolean>
  select_proxy: (proxy_id: string) => Promise<AppProfile>
  settings_update: (settings: AppSettings) => Promise<AppProfile>
}

declare global {
  interface Window {
    proxy_gui: ProxyGuiApi
  }
}

export {}
