import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  AppProfile,
  AppProfilePatch,
  AppSettings,
  ProxificationRule,
  ProxyServer,
} from './types'

const PROFILE_VERSION = 1

const DEFAULT_SETTINGS: AppSettings = {
  mixed_port: 7890,
  clash_api_port: 9090,
  dns_via_proxy: true,
  auto_connect: false,
  default_action: 'proxy',
}

function create_seed_proxy(): ProxyServer {
  return {
    id: randomUUID(),
    name: 'Seed HTTP',
    host: '45.11.183.190',
    port: 11707,
    protocol: 'http',
    username: 'modeler_TBbGST',
    password: 'GxBi5GsRDlbV',
    enabled: true,
  }
}

function create_default_rules(): ProxificationRule[] {
  return [
    {
      id: randomUUID(),
      name: 'Localhost',
      enabled: true,
      applications: [],
      hosts: ['127.0.0.1', 'localhost', '::1'],
      ports: '',
      action: 'direct',
      is_builtin: true,
    },
    {
      id: randomUUID(),
      name: 'Private LAN',
      enabled: true,
      applications: [],
      hosts: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
      ports: '',
      action: 'direct',
      is_builtin: true,
    },
    {
      id: randomUUID(),
      name: 'Default',
      enabled: true,
      applications: [],
      hosts: [],
      ports: '',
      action: 'proxy',
      is_builtin: true,
    },
  ]
}

function create_default_profile(): AppProfile {
  const seed_proxy = create_seed_proxy()
  return {
    version: PROFILE_VERSION,
    selected_proxy_id: seed_proxy.id,
    work_mode: 'proxy',
    settings: { ...DEFAULT_SETTINGS },
    proxies: [seed_proxy],
    rules: create_default_rules(),
  }
}

function get_profile_dir(): string {
  const profile_dir = path.join(app.getPath('userData'), 'profile')
  if (!fs.existsSync(profile_dir)) {
    fs.mkdirSync(profile_dir, { recursive: true })
  }
  return profile_dir
}

function get_profile_path(): string {
  return path.join(get_profile_dir(), 'profile.json')
}

function is_proxy_server(value: unknown): value is ProxyServer {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.host === 'string' &&
    typeof item.port === 'number' &&
    typeof item.protocol === 'string' &&
    typeof item.username === 'string' &&
    typeof item.password === 'string' &&
    typeof item.enabled === 'boolean'
  )
}

function is_rule(value: unknown): value is ProxificationRule {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.enabled === 'boolean' &&
    Array.isArray(item.applications) &&
    Array.isArray(item.hosts) &&
    typeof item.ports === 'string' &&
    typeof item.action === 'string' &&
    typeof item.is_builtin === 'boolean'
  )
}

function normalize_profile(raw: unknown): AppProfile {
  const fallback = create_default_profile()
  if (!raw || typeof raw !== 'object') return fallback

  const data = raw as Partial<AppProfile>
  let proxies = Array.isArray(data.proxies)
    ? data.proxies.filter(is_proxy_server)
    : fallback.proxies

  // Seed proxy was initially saved as SOCKS5 by mistake; it speaks HTTP CONNECT.
  proxies = proxies.map((proxy) => {
    if (
      proxy.host === '45.11.183.190' &&
      proxy.port === 11707 &&
      proxy.protocol === 'socks5'
    ) {
      return {
        ...proxy,
        protocol: 'http',
        name: proxy.name.includes('SOCKS') ? 'Seed HTTP' : proxy.name,
      }
    }
    return proxy
  })

  const rules = Array.isArray(data.rules) ? data.rules.filter(is_rule) : fallback.rules

  const selected_proxy_id =
    typeof data.selected_proxy_id === 'string' &&
    proxies.some((proxy) => proxy.id === data.selected_proxy_id)
      ? data.selected_proxy_id
      : proxies[0]?.id ?? null

  return {
    version: PROFILE_VERSION,
    selected_proxy_id,
    work_mode: data.work_mode === 'tun' ? 'tun' : 'proxy',
    settings: {
      ...DEFAULT_SETTINGS,
      ...(data.settings ?? {}),
    },
    proxies: proxies.length > 0 ? proxies : fallback.proxies,
    rules: rules.length > 0 ? rules : fallback.rules,
  }
}

export function load_profile(): AppProfile {
  const profile_path = get_profile_path()
  if (!fs.existsSync(profile_path)) {
    const profile = create_default_profile()
    save_profile(profile)
    return profile
  }

  try {
    const raw = JSON.parse(fs.readFileSync(profile_path, 'utf8')) as unknown
    const profile = normalize_profile(raw)
    save_profile(profile)
    return profile
  } catch {
    const profile = create_default_profile()
    save_profile(profile)
    return profile
  }
}

export function save_profile(profile: AppProfile): AppProfile {
  const normalized = normalize_profile(profile)
  fs.writeFileSync(get_profile_path(), JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

export function patch_profile(patch: AppProfilePatch): AppProfile {
  const current = load_profile()
  const next: AppProfile = {
    ...current,
    ...patch,
    settings: {
      ...current.settings,
      ...(patch.settings ?? {}),
    },
    proxies: patch.proxies ?? current.proxies,
    rules: patch.rules ?? current.rules,
  }
  return save_profile(next)
}

export function get_runtime_config_path(): string {
  return path.join(get_profile_dir(), 'sing-box-runtime.json')
}

export function parse_proxy_line(line: string): Omit<ProxyServer, 'id' | 'enabled' | 'name'> | null {
  const parts = line.trim().split(':')
  if (parts.length < 2) return null

  const host = parts[0]
  const port = Number(parts[1])
  if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) return null

  const username = parts[2] ?? ''
  const password = parts.slice(3).join(':')

  return {
    host,
    port,
    protocol: 'http',
    username,
    password,
  }
}

export { create_default_profile, create_seed_proxy, DEFAULT_SETTINGS }
