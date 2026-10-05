import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { detect_proxy_protocol_quick } from './proxy_check'
import type {
  AppProfile,
  AppProfilePatch,
  AppSettings,
  BulkImportResult,
  ProxificationRule,
  ProxyGroup,
  ProxyServer,
} from './types'

const PROFILE_VERSION = 2

const DEFAULT_SETTINGS: AppSettings = {
  mixed_port: 7890,
  clash_api_port: 9090,
  dns_via_proxy: true,
  auto_connect: false,
  default_action: 'proxy',
  start_with_windows: false,
  minimize_to_tray: true,
  use_proxy_group: false,
  selected_group_id: null,
  auto_check_updates: true,
}

function empty_proxy_meta(): Pick<ProxyServer, 'last_latency_ms' | 'last_exit_ip' | 'last_checked_at'> {
  return {
    last_latency_ms: null,
    last_exit_ip: null,
    last_checked_at: null,
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
  return {
    version: PROFILE_VERSION,
    selected_proxy_id: null,
    work_mode: 'proxy',
    settings: { ...DEFAULT_SETTINGS },
    proxies: [],
    proxy_groups: [],
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

function is_proxy_group(value: unknown): value is ProxyGroup {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    Array.isArray(item.proxy_ids) &&
    (item.mode === 'select' || item.mode === 'urltest') &&
    (item.selected_proxy_id === null || typeof item.selected_proxy_id === 'string')
  )
}

function normalize_proxy(raw: ProxyServer): ProxyServer {
  return {
    ...raw,
    ...empty_proxy_meta(),
    last_latency_ms: typeof raw.last_latency_ms === 'number' ? raw.last_latency_ms : null,
    last_exit_ip: typeof raw.last_exit_ip === 'string' ? raw.last_exit_ip : null,
    last_checked_at: typeof raw.last_checked_at === 'string' ? raw.last_checked_at : null,
  }
}

function normalize_profile(raw: unknown): AppProfile {
  const fallback = create_default_profile()
  if (!raw || typeof raw !== 'object') return fallback

  const data = raw as Partial<AppProfile>
  const proxies = Array.isArray(data.proxies)
    ? data.proxies.filter(is_proxy_server).map(normalize_proxy)
    : fallback.proxies

  const proxy_groups = Array.isArray(data.proxy_groups)
    ? data.proxy_groups.filter(is_proxy_group)
    : fallback.proxy_groups

  const rules = Array.isArray(data.rules) ? data.rules.filter(is_rule) : fallback.rules

  const selected_proxy_id =
    typeof data.selected_proxy_id === 'string' &&
    proxies.some((proxy) => proxy.id === data.selected_proxy_id)
      ? data.selected_proxy_id
      : proxies[0]?.id ?? null

  const selected_group_id =
    typeof data.settings?.selected_group_id === 'string' &&
    proxy_groups.some((group) => group.id === data.settings?.selected_group_id)
      ? data.settings.selected_group_id
      : proxy_groups[0]?.id ?? null

  return {
    version: PROFILE_VERSION,
    selected_proxy_id,
    work_mode: data.work_mode === 'tun' ? 'tun' : 'proxy',
    settings: {
      ...DEFAULT_SETTINGS,
      ...(data.settings ?? {}),
      selected_group_id,
    },
    proxies,
    proxy_groups,
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
    proxy_groups: patch.proxy_groups ?? current.proxy_groups,
    rules: patch.rules ?? current.rules,
  }
  return save_profile(next)
}

export function get_runtime_config_path(): string {
  return path.join(get_profile_dir(), 'sing-box-runtime.json')
}

export function parse_proxy_line(line: string): Omit<ProxyServer, 'id' | 'enabled' | 'name' | 'last_latency_ms' | 'last_exit_ip' | 'last_checked_at'> | null {
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

export async function bulk_import_proxies(text: string): Promise<BulkImportResult> {
  const profile = load_profile()
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  let imported = 0
  let skipped = 0
  const new_proxies: ProxyServer[] = [...profile.proxies]

  for (const line of lines) {
    const parsed = parse_proxy_line(line)
    if (!parsed) {
      skipped += 1
      continue
    }

    const protocol = await detect_proxy_protocol_quick(parsed)
    const proxy: ProxyServer = {
      id: randomUUID(),
      name: `${parsed.host}:${parsed.port}`,
      enabled: true,
      ...parsed,
      protocol,
      ...empty_proxy_meta(),
    }
    new_proxies.push(proxy)
    imported += 1
  }

  const next = patch_profile({
    proxies: new_proxies,
    selected_proxy_id: profile.selected_proxy_id ?? new_proxies[0]?.id ?? null,
  })

  return { imported, skipped, profile: next }
}

export function export_profile(): string {
  const profile = load_profile()
  return JSON.stringify(profile, null, 2)
}

export function import_profile(json_text: string): AppProfile {
  const raw = JSON.parse(json_text) as unknown
  const profile = normalize_profile(raw)
  return save_profile(profile)
}

export function update_proxy_check_meta(
  proxy_id: string,
  meta: Pick<ProxyServer, 'last_latency_ms' | 'last_exit_ip' | 'last_checked_at' | 'protocol'>,
): AppProfile {
  const profile = load_profile()
  const proxies = profile.proxies.map((item) =>
    item.id === proxy_id
      ? {
          ...item,
          last_latency_ms: meta.last_latency_ms,
          last_exit_ip: meta.last_exit_ip,
          last_checked_at: meta.last_checked_at,
          protocol: meta.protocol ?? item.protocol,
        }
      : item,
  )
  return patch_profile({ proxies })
}

export { create_default_profile, DEFAULT_SETTINGS }
