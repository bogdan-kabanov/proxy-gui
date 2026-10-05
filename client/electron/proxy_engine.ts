import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { app } from 'electron'
import { get_runtime_config_path, patch_profile } from './profile_store'
import { enable_system_proxy, restore_system_proxy } from './system_proxy'
import type {
  AppProfile,
  ConnectionStatus,
  LiveConnection,
  ProxificationRule,
  ProxyCheckResult,
  ProxyServer,
  WorkMode,
} from './types'

interface EngineState {
  process: ChildProcessWithoutNullStreams | null
  status: ConnectionStatus
  log_buffer: string[]
}

const engine_state: EngineState = {
  process: null,
  status: {
    state: 'disconnected',
    work_mode: 'proxy',
    selected_proxy_id: null,
    message: 'Не подключено',
    upload_bytes: 0,
    download_bytes: 0,
    is_admin: false,
    started_at: null,
  },
  log_buffer: [],
}

function resolve_sing_box_dir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'sing-box')
  }
  return path.join(__dirname, '..', 'resources', 'sing-box')
}

function resolve_sing_box_binary(): string {
  return path.join(resolve_sing_box_dir(), 'sing-box.exe')
}

export function check_is_admin(): boolean {
  try {
    execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true })
    return true
  } catch {
    return false
  }
}

function parse_ports(ports: string): number[] {
  if (!ports.trim()) return []
  const result: number[] = []
  for (const part of ports.split(/[,\s]+/)) {
    if (!part) continue
    if (part.includes('-')) {
      const [start_raw, end_raw] = part.split('-')
      const start = Number(start_raw)
      const end = Number(end_raw)
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
        for (let port = start; port <= end && result.length < 64; port += 1) {
          result.push(port)
        }
      }
      continue
    }
    const port = Number(part)
    if (Number.isFinite(port) && port > 0 && port <= 65535) {
      result.push(port)
    }
  }
  return result
}

function is_cidr(value: string): boolean {
  return value.includes('/')
}

function is_ip_literal(value: string): boolean {
  return net.isIP(value) !== 0 || is_cidr(value)
}

function build_rule_objects(rule: ProxificationRule): Record<string, unknown>[] {
  if (!rule.enabled) return []

  const action_fields: Record<string, unknown> =
    rule.action === 'block'
      ? { action: 'reject' }
      : { outbound: rule.action === 'proxy' ? 'proxy' : 'direct' }

  const domains: string[] = []
  const ip_cidrs: string[] = []
  for (const host of rule.hosts) {
    const trimmed = host.trim()
    if (!trimmed) continue
    if (is_ip_literal(trimmed)) {
      ip_cidrs.push(trimmed.includes('/') ? trimmed : `${trimmed}/32`)
    } else {
      domains.push(trimmed)
    }
  }

  const ports = parse_ports(rule.ports)
  const process_names = rule.applications.length > 0 ? rule.applications : null

  const make_rule = (extra: Record<string, unknown>): Record<string, unknown> => {
    const item: Record<string, unknown> = { ...action_fields, ...extra }
    if (process_names) item.process_name = process_names
    if (ports.length > 0) item.port = ports
    return item
  }

  const rules: Record<string, unknown>[] = []
  if (domains.length > 0) {
    rules.push(make_rule({ domain: domains }))
  }
  if (ip_cidrs.length > 0) {
    rules.push(make_rule({ ip_cidr: ip_cidrs }))
  }

  if (rules.length === 0) {
    if (process_names || ports.length > 0) {
      rules.push(make_rule({}))
    } else if (rule.name === 'Default') {
      rules.push({ ...action_fields })
    }
  }

  return rules
}

function protocol_to_outbound_type(protocol: ProxyServer['protocol']): string {
  if (protocol === 'socks5') return 'socks'
  if (protocol === 'https') return 'http'
  return 'http'
}

export async function detect_proxy_protocol(proxy: ProxyServer): Promise<ProxyServer> {
  const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')

  const http_ok = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, 4000)

    socket.on('connect', () => {
      socket.write(
        `GET http://api.ipify.org/ HTTP/1.1\r\nHost: api.ipify.org\r\nProxy-Authorization: Basic ${auth}\r\nConnection: close\r\n\r\n`,
      )
    })
    socket.on('data', (chunk) => {
      clearTimeout(timer)
      const text = chunk.toString('utf8')
      socket.destroy()
      resolve(text.includes('HTTP/1.') && text.includes('200'))
    })
    socket.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })

  if (http_ok) {
    return { ...proxy, protocol: 'http' }
  }

  const socks_ok = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, 3000)
    socket.on('connect', () => {
      socket.write(Buffer.from([0x05, 0x01, 0x02]))
    })
    socket.on('data', (chunk) => {
      clearTimeout(timer)
      socket.destroy()
      resolve(chunk.length >= 2 && chunk[0] === 0x05)
    })
    socket.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })

  if (socks_ok) {
    return { ...proxy, protocol: 'socks5' }
  }

  return proxy
}

export function build_sing_box_config(profile: AppProfile, proxy: ProxyServer): Record<string, unknown> {
  const route_rules = profile.rules.flatMap(build_rule_objects)
  const is_http_family = proxy.protocol === 'http' || proxy.protocol === 'https'

  const inbounds: Record<string, unknown>[] = [
    {
      type: 'mixed',
      tag: 'mixed-in',
      listen: '127.0.0.1',
      listen_port: profile.settings.mixed_port,
      set_system_proxy: false,
    },
  ]

  if (profile.work_mode === 'tun') {
    inbounds.push({
      type: 'tun',
      tag: 'tun-in',
      interface_name: 'ProxyGUI',
      address: ['172.19.0.1/30'],
      mtu: 1500,
      auto_route: true,
      // strict_route breaks VirtualBox/WSL/some apps and can blackhole traffic
      strict_route: false,
      stack: 'mixed',
      sniff: true,
      sniff_override_destination: false,
    })
  }

  const outbound: Record<string, unknown> = {
    type: protocol_to_outbound_type(proxy.protocol),
    tag: 'proxy',
    server: proxy.host,
    server_port: proxy.port,
  }

  if (proxy.protocol === 'socks5') {
    outbound.version = '5'
    outbound.udp_over_tcp = {
      enabled: true,
      version: 2,
    }
  }

  if (proxy.username) {
    outbound.username = proxy.username
    outbound.password = proxy.password
  }

  if (proxy.protocol === 'https') {
    outbound.tls = { enabled: true }
  }

  // HTTP proxies cannot carry raw UDP DNS. Use DoH through the proxy instead.
  const dns_servers: Record<string, unknown>[] = [
    {
      tag: 'local',
      address: 'local',
    },
  ]

  if (profile.settings.dns_via_proxy) {
    dns_servers.unshift(
      is_http_family
        ? {
            tag: 'remote',
            address: 'https://1.1.1.1/dns-query',
            detour: 'proxy',
          }
        : {
            tag: 'remote',
            address: '1.1.1.1',
            detour: 'proxy',
          },
    )
  }

  const route_final =
    profile.settings.default_action === 'direct'
      ? 'direct'
      : profile.settings.default_action === 'block'
        ? 'direct'
        : 'proxy'

  const proxy_ip_rule =
    net.isIP(proxy.host) !== 0
      ? [{ ip_cidr: [`${proxy.host}/32`], outbound: 'direct' }]
      : [{ domain: [proxy.host], outbound: 'direct' }]

  const compatibility_rules: Record<string, unknown>[] = [
    // YouTube/Chrome break when QUIC/UDP-443 cannot traverse HTTP proxies.
    { protocol: 'quic', action: 'reject' },
  ]

  if (is_http_family) {
    // HTTP CONNECT is TCP-only; send remaining UDP direct so apps do not hang.
    compatibility_rules.push({ network: 'udp', outbound: 'direct' })
  }

  return {
    log: {
      level: 'info',
      timestamp: true,
    },
    dns: {
      servers: dns_servers,
      final: profile.settings.dns_via_proxy ? 'remote' : 'local',
      strategy: 'prefer_ipv4',
      independent_cache: true,
    },
    inbounds,
    outbounds: [
      outbound,
      { type: 'direct', tag: 'direct' },
    ],
    route: {
      rules: [
        { protocol: 'dns', action: 'hijack-dns' },
        ...proxy_ip_rule,
        { ip_is_private: true, outbound: 'direct' },
        ...compatibility_rules,
        ...route_rules,
        ...(profile.settings.default_action === 'block' ? [{ action: 'reject' }] : []),
      ],
      final: route_final,
      auto_detect_interface: true,
      find_process: true,
    },
    experimental: {
      clash_api: {
        external_controller: `127.0.0.1:${profile.settings.clash_api_port}`,
      },
    },
  }
}

function push_log(line: string): void {
  engine_state.log_buffer.push(line)
  if (engine_state.log_buffer.length > 500) {
    engine_state.log_buffer.shift()
  }
}

function update_status(partial: Partial<ConnectionStatus>): ConnectionStatus {
  engine_state.status = {
    ...engine_state.status,
    ...partial,
    is_admin: check_is_admin(),
  }
  return engine_state.status
}

async function wait_for_port(port: number, timeout_ms = 8000): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeout_ms) {
    const is_open = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        socket.destroy()
        resolve(true)
      })
      socket.on('error', () => resolve(false))
    })
    if (is_open) return true
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return false
}

export function get_connection_status(): ConnectionStatus {
  return {
    ...engine_state.status,
    is_admin: check_is_admin(),
  }
}

export function get_engine_logs(): string[] {
  return [...engine_state.log_buffer]
}

export async function stop_engine(): Promise<ConnectionStatus> {
  if (engine_state.process) {
    const child = engine_state.process
    engine_state.process = null
    child.kill()
  }

  try {
    restore_system_proxy()
  } catch (error) {
    push_log(`Failed to restore system proxy: ${String(error)}`)
  }

  return update_status({
    state: 'disconnected',
    message: 'Не подключено',
    upload_bytes: 0,
    download_bytes: 0,
    started_at: null,
  })
}

export async function start_engine(profile: AppProfile): Promise<ConnectionStatus> {
  await stop_engine()

  let proxy = profile.proxies.find((item) => item.id === profile.selected_proxy_id)
  if (!proxy) {
    return update_status({
      state: 'error',
      message: 'Прокси-сервер не выбран',
      selected_proxy_id: null,
    })
  }

  if (profile.work_mode === 'tun' && !check_is_admin()) {
    return update_status({
      state: 'error',
      work_mode: profile.work_mode,
      selected_proxy_id: proxy.id,
      message: 'TUN-режим требует запуск от имени администратора',
    })
  }

  const binary_path = resolve_sing_box_binary()
  if (!fs.existsSync(binary_path)) {
    return update_status({
      state: 'error',
      work_mode: profile.work_mode,
      selected_proxy_id: proxy.id,
      message: `Не найден sing-box: ${binary_path}. Запустите npm run download:sing-box`,
    })
  }

  if (profile.work_mode === 'tun') {
    const wintun_path = path.join(resolve_sing_box_dir(), 'wintun.dll')
    if (!fs.existsSync(wintun_path)) {
      return update_status({
        state: 'error',
        work_mode: profile.work_mode,
        selected_proxy_id: proxy.id,
        message: 'Не найден wintun.dll. Запустите npm run download:sing-box',
      })
    }
  }

  engine_state.log_buffer = []
  push_log(`INFO detecting protocol for ${proxy.host}:${proxy.port} (saved as ${proxy.protocol})`)
  const detected = await detect_proxy_protocol(proxy)
  if (detected.protocol !== proxy.protocol) {
    push_log(`INFO auto-switched protocol ${proxy.protocol} -> ${detected.protocol}`)
    const updated_proxy: ProxyServer = {
      ...detected,
      name:
        detected.protocol === 'http' && proxy.name.includes('SOCKS')
          ? 'Seed HTTP'
          : proxy.name,
    }
    proxy = updated_proxy
    patch_profile({
      proxies: profile.proxies.map((item) => (item.id === updated_proxy.id ? updated_proxy : item)),
    })
  } else {
    push_log(`INFO protocol confirmed: ${proxy.protocol}`)
  }

  update_status({
    state: 'connecting',
    work_mode: profile.work_mode,
    selected_proxy_id: proxy.id,
    message: 'Запуск sing-box…',
  })

  const config = build_sing_box_config(profile, proxy)
  const config_path = get_runtime_config_path()
  fs.writeFileSync(config_path, JSON.stringify(config, null, 2), 'utf8')

  const child = spawn(binary_path, ['run', '-c', config_path], {
    cwd: resolve_sing_box_dir(),
    windowsHide: true,
  })
  engine_state.process = child

  child.stdout.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      if (line.trim()) push_log(line)
    }
  })
  child.stderr.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      if (line.trim()) push_log(line)
    }
  })
  child.on('exit', (code) => {
    if (engine_state.process === child) {
      engine_state.process = null
      try {
        restore_system_proxy()
      } catch {
        // ignore
      }
      update_status({
        state: 'error',
        message: `sing-box завершился (код ${code ?? 'null'})`,
        started_at: null,
      })
    }
  })

  const ready = await wait_for_port(profile.settings.mixed_port)
  if (!ready) {
    await stop_engine()
    return update_status({
      state: 'error',
      work_mode: profile.work_mode,
      selected_proxy_id: proxy.id,
      message: 'Не удалось дождаться локального mixed-порта sing-box',
    })
  }

  // Verify remote proxy path before touching OS settings.
  const probe_ok = await probe_local_mixed(profile.settings.mixed_port)
  if (!probe_ok) {
    const tail = engine_state.log_buffer.slice(-6).join(' | ')
    await stop_engine()
    return update_status({
      state: 'error',
      work_mode: profile.work_mode,
      selected_proxy_id: proxy.id,
      message: `Прокси не отвечает через движок. ${tail}`,
    })
  }

  if (profile.work_mode === 'proxy') {
    try {
      enable_system_proxy('127.0.0.1', profile.settings.mixed_port)
    } catch (error) {
      await stop_engine()
      return update_status({
        state: 'error',
        work_mode: profile.work_mode,
        selected_proxy_id: proxy.id,
        message: `Не удалось включить системный прокси: ${String(error)}`,
      })
    }
  } else {
    // TUN + system proxy: browsers/Cursor that honor WinINET also work reliably.
    try {
      enable_system_proxy('127.0.0.1', profile.settings.mixed_port)
    } catch (error) {
      push_log(`WARN system proxy helper failed in TUN mode: ${String(error)}`)
    }
  }

  return update_status({
    state: 'connected',
    work_mode: profile.work_mode,
    selected_proxy_id: proxy.id,
    message:
      profile.work_mode === 'tun'
        ? `TUN активен (${proxy.protocol.toUpperCase()})`
        : `Системный прокси активен (${proxy.protocol.toUpperCase()})`,
    started_at: new Date().toISOString(),
  })
}

async function probe_local_mixed(mixed_port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = net.connect({ host: '127.0.0.1', port: mixed_port })
    const timer = setTimeout(() => {
      req.destroy()
      resolve(false)
    }, 8000)

    req.on('connect', () => {
      req.write(
        'GET http://api.ipify.org/ HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n',
      )
    })
    req.on('data', (chunk) => {
      clearTimeout(timer)
      const text = chunk.toString('utf8')
      req.destroy()
      resolve(text.includes('HTTP/1.') && text.includes('200'))
    })
    req.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

export async function check_proxy(proxy: ProxyServer, timeout_ms = 8000): Promise<ProxyCheckResult> {
  const started = Date.now()
  return new Promise((resolve) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve({
        ok: false,
        latency_ms: null,
        message: 'Таймаут подключения',
      })
    }, timeout_ms)

    socket.on('connect', () => {
      clearTimeout(timer)
      const latency_ms = Date.now() - started
      socket.destroy()
      resolve({
        ok: true,
        latency_ms,
        message: `TCP OK (${latency_ms} ms)`,
      })
    })

    socket.on('error', (error) => {
      clearTimeout(timer)
      resolve({
        ok: false,
        latency_ms: null,
        message: error.message,
      })
    })
  })
}

export async function fetch_live_connections(clash_api_port: number): Promise<LiveConnection[]> {
  try {
    const response = await fetch(`http://127.0.0.1:${clash_api_port}/connections`)
    if (!response.ok) return []
    const data = (await response.json()) as {
      connections?: Array<{
        id: string
        metadata?: {
          process?: string
          host?: string
          destinationIP?: string
          destinationPort?: number
          network?: string
        }
        rule?: string
        upload?: number
        download?: number
        start?: string
      }>
      uploadTotal?: number
      downloadTotal?: number
    }

    update_status({
      upload_bytes: data.uploadTotal ?? engine_state.status.upload_bytes,
      download_bytes: data.downloadTotal ?? engine_state.status.download_bytes,
    })

    return (data.connections ?? []).map((item) => {
      const host = item.metadata?.host || item.metadata?.destinationIP || 'unknown'
      const port = item.metadata?.destinationPort
      return {
        id: item.id,
        process_name: item.metadata?.process || 'n/a',
        destination: port ? `${host}:${port}` : host,
        network: item.metadata?.network || 'tcp',
        rule: item.rule || '',
        upload_bytes: item.upload ?? 0,
        download_bytes: item.download ?? 0,
        start_time: item.start || '',
      }
    })
  } catch {
    return []
  }
}

export async function refresh_traffic(clash_api_port: number): Promise<ConnectionStatus> {
  if (engine_state.status.state !== 'connected') {
    return get_connection_status()
  }
  await fetch_live_connections(clash_api_port)
  return get_connection_status()
}

export function set_work_mode_status(work_mode: WorkMode): ConnectionStatus {
  return update_status({ work_mode })
}
