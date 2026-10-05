export type ProxyProtocol = 'socks5' | 'http' | 'https'
export type WorkMode = 'proxy' | 'tun'
export type RuleAction = 'proxy' | 'direct' | 'block'
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ProxyServer {
  id: string
  name: string
  host: string
  port: number
  protocol: ProxyProtocol
  username: string
  password: string
  enabled: boolean
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
}

export interface AppProfile {
  version: number
  selected_proxy_id: string | null
  work_mode: WorkMode
  settings: AppSettings
  proxies: ProxyServer[]
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
  started_at: string | null
}

export interface ProxyCheckResult {
  ok: boolean
  latency_ms: number | null
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
  rules?: ProxificationRule[]
}
