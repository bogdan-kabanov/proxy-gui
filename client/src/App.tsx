import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AppProfile,
  ConnectionStatus,
  LiveConnection,
  ProxificationRule,
  ProxyGroup,
  ProxyServer,
  WorkMode,
} from './types'
import { DashboardPage } from './pages/DashboardPage'
import { ProxiesPage } from './pages/ProxiesPage'
import { RulesPage } from './pages/RulesPage'
import { ConnectionsPage } from './pages/ConnectionsPage'
import { SettingsPage } from './pages/SettingsPage'

type PageId = 'dashboard' | 'proxies' | 'rules' | 'connections' | 'settings'

const PAGE_META: Record<PageId, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Статус подключения и быстрый запуск',
  },
  proxies: {
    title: 'Proxies',
    subtitle: 'Серверы SOCKS / HTTP / HTTPS',
  },
  rules: {
    title: 'Rules',
    subtitle: 'Какие приложения идут через прокси',
  },
  connections: {
    title: 'Connections',
    subtitle: 'Живые соединения через движок',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Порты, DNS и поведение по умолчанию',
  },
}

function format_bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

declare const __APP_VERSION__: string

export default function App() {
  const [page, set_page] = useState<PageId>('dashboard')
  const [profile, set_profile] = useState<AppProfile | null>(null)
  const [status, set_status] = useState<ConnectionStatus | null>(null)
  const [connections, set_connections] = useState<LiveConnection[]>([])
  const [logs, set_logs] = useState<string[]>([])
  const [busy, set_busy] = useState(false)
  const [toast, set_toast] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null)

  const show_toast = useCallback((text: string, kind: 'ok' | 'error' | 'info' = 'info') => {
    set_toast({ text, kind })
    window.setTimeout(() => set_toast(null), 4000)
  }, [])

  const refresh_all = useCallback(async () => {
    const [next_profile, next_status, next_logs] = await Promise.all([
      window.proxy_gui.profile_get(),
      window.proxy_gui.connection_status(),
      window.proxy_gui.engine_logs(),
    ])
    set_profile(next_profile)
    set_status(next_status)
    set_logs(next_logs)
    if (next_status.state === 'connected') {
      const live = await window.proxy_gui.connections_list()
      set_connections(live)
    } else {
      set_connections([])
    }
  }, [])

  useEffect(() => {
    void refresh_all().catch((error: unknown) => {
      show_toast(String(error), 'error')
    })
    const timer = window.setInterval(() => {
      void refresh_all().catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [refresh_all, show_toast])

  const selected_proxy = useMemo(() => {
    if (!profile) return null
    if (profile.settings.use_proxy_group && profile.settings.selected_group_id) {
      const group = profile.proxy_groups.find((item) => item.id === profile.settings.selected_group_id)
      const first_id = group?.proxy_ids[0]
      return profile.proxies.find((item) => item.id === first_id) ?? null
    }
    return profile.proxies.find((item) => item.id === profile.selected_proxy_id) ?? null
  }, [profile])

  const apply_profile = (next: AppProfile) => {
    set_profile(next)
  }

  const on_mode_change = async (work_mode: WorkMode) => {
    try {
      const next = await window.proxy_gui.mode_set(work_mode)
      apply_profile(next)
      if (work_mode === 'tun') {
        const is_admin = await window.proxy_gui.admin_check()
        if (!is_admin) {
          show_toast('TUN потребует запуск от администратора', 'info')
        }
      }
    } catch (error) {
      show_toast(String(error), 'error')
    }
  }

  const on_connect = async () => {
    set_busy(true)
    try {
      const next_status = await window.proxy_gui.connection_start()
      set_status(next_status)
      show_toast(next_status.message, next_status.state === 'connected' ? 'ok' : 'error')
      await refresh_all()
    } catch (error) {
      show_toast(String(error), 'error')
    } finally {
      set_busy(false)
    }
  }

  const on_disconnect = async () => {
    set_busy(true)
    try {
      const next_status = await window.proxy_gui.connection_stop()
      set_status(next_status)
      show_toast('Отключено', 'ok')
      await refresh_all()
    } catch (error) {
      show_toast(String(error), 'error')
    } finally {
      set_busy(false)
    }
  }

  const on_select_proxy = async (proxy_id: string) => {
    const next = await window.proxy_gui.select_proxy(proxy_id)
    apply_profile(next)
  }

  const on_proxy_save = async (proxy: ProxyServer, is_new: boolean) => {
    const next = is_new
      ? await window.proxy_gui.proxy_add({
          name: proxy.name,
          host: proxy.host,
          port: proxy.port,
          protocol: proxy.protocol,
          username: proxy.username,
          password: proxy.password,
          enabled: proxy.enabled,
        })
      : await window.proxy_gui.proxy_update(proxy)
    apply_profile(next)
    show_toast(is_new ? 'Прокси добавлен' : 'Прокси обновлён', 'ok')
  }

  const on_proxy_delete = async (proxy_id: string) => {
    const next = await window.proxy_gui.proxy_delete(proxy_id)
    apply_profile(next)
    show_toast('Прокси удалён', 'ok')
  }

  const on_proxy_import = async (line: string) => {
    const next = await window.proxy_gui.proxy_import_line(line)
    apply_profile(next)
    show_toast('Прокси импортирован', 'ok')
  }

  const on_proxy_import_bulk = async (text: string) => {
    const result = await window.proxy_gui.proxy_import_bulk(text)
    apply_profile(result.profile)
    show_toast(
      `OK: ${result.imported}, fail: ${result.failed}, skip: ${result.skipped}`,
      result.imported > 0 ? 'ok' : 'error',
    )
    return {
      imported: result.imported,
      skipped: result.skipped,
      tested: result.tested,
      failed: result.failed,
    }
  }

  const on_proxy_import_files = async () => {
    const result = await window.proxy_gui.proxy_import_files()
    apply_profile(result.profile)
    show_toast(
      `Файлы: добавлено ${result.imported}, не прошли тест ${result.failed}, пропущено ${result.skipped}`,
      result.imported > 0 ? 'ok' : 'info',
    )
    return {
      imported: result.imported,
      skipped: result.skipped,
      tested: result.tested,
      failed: result.failed,
    }
  }

  const on_proxy_check = async (proxy: ProxyServer) => {
    const result = await window.proxy_gui.proxy_check(proxy)
    const next_profile = await window.proxy_gui.profile_get()
    apply_profile(next_profile)
    show_toast(result.message, result.ok ? 'ok' : 'error')
    return result
  }

  const on_proxy_check_all = async () => {
    const next = await window.proxy_gui.proxy_check_all()
    apply_profile(next)
    show_toast('Latency check завершён', 'ok')
  }

  const on_group_save = async (group: ProxyGroup) => {
    const next = await window.proxy_gui.proxy_group_upsert(group)
    apply_profile(next)
    show_toast('Группа сохранена', 'ok')
  }

  const on_group_delete = async (group_id: string) => {
    const next = await window.proxy_gui.proxy_group_delete(group_id)
    apply_profile(next)
    show_toast('Группа удалена', 'ok')
  }

  const on_use_group_change = async (use_group: boolean, group_id: string | null) => {
    if (!profile) return
    const next = await window.proxy_gui.settings_update({
      ...profile.settings,
      use_proxy_group: use_group,
      selected_group_id: group_id,
    })
    apply_profile(next)
  }

  const on_rule_upsert = async (rule: ProxificationRule) => {
    const next = await window.proxy_gui.rule_upsert(rule)
    apply_profile(next)
    show_toast('Правило сохранено', 'ok')
  }

  const on_rule_delete = async (rule_id: string) => {
    const next = await window.proxy_gui.rule_delete(rule_id)
    apply_profile(next)
    show_toast('Правило удалено', 'ok')
  }

  const on_rule_reorder = async (rule_ids: string[]) => {
    const next = await window.proxy_gui.rule_reorder(rule_ids)
    apply_profile(next)
  }

  const on_pick_exe = async () => window.proxy_gui.dialog_pick_exe()

  const on_connection_kill = async (connection_id: string) => {
    const ok = await window.proxy_gui.connection_kill(connection_id)
    show_toast(ok ? 'Соединение закрыто' : 'Не удалось закрыть', ok ? 'ok' : 'error')
    await refresh_all()
  }

  const on_settings_save = async (settings: AppProfile['settings']) => {
    const next = await window.proxy_gui.settings_update(settings)
    apply_profile(next)
    show_toast('Настройки сохранены', 'ok')
  }

  const on_profile_export = async () => window.proxy_gui.profile_export()

  const on_profile_import = async (json_text: string) => {
    const next = await window.proxy_gui.profile_import(json_text)
    apply_profile(next)
    show_toast('Профиль импортирован', 'ok')
  }

  const on_admin_restart = () => {
    void window.proxy_gui.admin_restart()
  }

  if (!profile || !status) {
    return (
      <div className="app_shell">
        <div className="content">
          <div className="empty_state">Загрузка профиля…</div>
        </div>
      </div>
    )
  }

  const meta = PAGE_META[page]

  return (
    <div className="app_shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="brand_name">Proxy GUI</p>
          <p className="brand_sub">SOCKS · HTTPS · TUN</p>
        </div>
        <nav className="nav">
          {(Object.keys(PAGE_META) as PageId[]).map((id) => (
            <button
              key={id}
              className={`nav_button${page === id ? ' active' : ''}`}
              onClick={() => set_page(id)}
              type="button"
            >
              {PAGE_META[id].title}
            </button>
          ))}
        </nav>
        <div className="sidebar_footer">v{__APP_VERSION__}</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar_title">
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>
          <div className="topbar_actions">
            <div className="mode_switch">
              <button
                type="button"
                className={profile.work_mode === 'proxy' ? 'active' : ''}
                onClick={() => void on_mode_change('proxy')}
              >
                Proxy
              </button>
              <button
                type="button"
                className={profile.work_mode === 'tun' ? 'active' : ''}
                onClick={() => void on_mode_change('tun')}
              >
                TUN
              </button>
            </div>
            <span className={`status_pill ${status.state}`}>
              <span className="status_dot" />
              {status.state}
            </span>
            {status.state === 'connected' ? (
              <button className="btn btn_danger" disabled={busy} onClick={() => void on_disconnect()} type="button">
                Disconnect
              </button>
            ) : (
              <button className="btn btn_primary" disabled={busy} onClick={() => void on_connect()} type="button">
                Connect
              </button>
            )}
          </div>
        </header>

        <main className="content">
          {toast ? <div className={`toast ${toast.kind}`}>{toast.text}</div> : null}

          {page === 'dashboard' ? (
            <DashboardPage
              profile={profile}
              status={status}
              selected_proxy={selected_proxy}
              format_bytes={format_bytes}
              logs={logs}
              on_connect={() => void on_connect()}
              on_disconnect={() => void on_disconnect()}
              on_admin_restart={on_admin_restart}
              busy={busy}
            />
          ) : null}

          {page === 'proxies' ? (
            <ProxiesPage
              profile={profile}
              on_save={on_proxy_save}
              on_delete={on_proxy_delete}
              on_import={on_proxy_import}
              on_import_bulk={on_proxy_import_bulk}
              on_import_files={on_proxy_import_files}
              on_check={on_proxy_check}
              on_check_all={on_proxy_check_all}
              on_select={on_select_proxy}
              on_group_save={on_group_save}
              on_group_delete={on_group_delete}
              on_use_group_change={on_use_group_change}
            />
          ) : null}

          {page === 'rules' ? (
            <RulesPage
              profile={profile}
              on_upsert={on_rule_upsert}
              on_delete={on_rule_delete}
              on_reorder={on_rule_reorder}
              on_pick_exe={on_pick_exe}
            />
          ) : null}

          {page === 'connections' ? (
            <ConnectionsPage
              connections={connections}
              format_bytes={format_bytes}
              on_kill={on_connection_kill}
            />
          ) : null}

          {page === 'settings' ? (
            <SettingsPage
              profile={profile}
              status={status}
              on_save={on_settings_save}
              on_export={on_profile_export}
              on_import={on_profile_import}
              on_admin_restart={on_admin_restart}
            />
          ) : null}
        </main>
      </div>
    </div>
  )
}
