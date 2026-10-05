export type ProxyProtocol = 'socks5' | 'http' | 'https'
export type WorkMode = 'proxy' | 'tun'
export type RuleAction = 'proxy' | 'direct' | 'block'
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'
export type ProxyGroupMode = 'select' | 'urltest'

export interface ProxyServer {
  id: string
  name: string
  host: string
  port: number
  protocol: ProxyProtocol
  username: string
  password: string
  enabled: boolean
  last_latency_ms: number | null
  last_exit_ip: string | null
  last_checked_at: string | null
}

export interface ProxyGroup {
  id: string
  name: string
  proxy_ids: string[]
  mode: ProxyGroupMode
  selected_proxy_id: string | null
}

export interface ProxificationRule {
  id: string
  name: string
  enabled: boolean
  applications: string[]
  hosts: string[]
  ports: string
  action: RuleAction
  is_builtin: boolean
}

export interface AppSettings {
  mixed_port: number
  clash_api_port: number
  dns_via_proxy: boolean
  auto_connect: boolean
  default_action: RuleAction
  start_with_windows: boolean
  minimize_to_tray: boolean
  use_proxy_group: boolean
  selected_group_id: string | null
  auto_check_updates: boolean
}

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

export interface AppProfile {
  version: number
  selected_proxy_id: string | null
  work_mode: WorkMode
  settings: AppSettings
  proxies: ProxyServer[]
  proxy_groups: ProxyGroup[]
  rules: ProxificationRule[]
}

export interface ConnectionStatus {
  state: ConnectionState
  work_mode: WorkMode
  selected_proxy_id: string | null
  message: string
  upload_bytes: number
  download_bytes: number
  is_admin: boolean
  wintun_ready: boolean
  system_proxy_enabled: boolean
  started_at: string | null
}

export interface ProxyCheckResult {
  ok: boolean
  latency_ms: number | null
  exit_ip: string | null
  protocol: ProxyProtocol | null
  message: string
}

export interface LiveConnection {
  id: string
  process_name: string
  destination: string
  network: string
  rule: string
  upload_bytes: number
  download_bytes: number
  start_time: string
}

export interface AppProfilePatch {
  selected_proxy_id?: string | null
  work_mode?: WorkMode
  settings?: Partial<AppSettings>
  proxies?: ProxyServer[]
  proxy_groups?: ProxyGroup[]
  rules?: ProxificationRule[]
}

export interface BulkImportResult {
  imported: number
  skipped: number
  profile: AppProfile
}
