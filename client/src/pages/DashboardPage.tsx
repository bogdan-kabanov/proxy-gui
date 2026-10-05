import type { AppProfile, ConnectionStatus, ProxyServer } from '../types'
import { EngineLogsTable } from '../components/EngineLogsTable'

interface DashboardPageProps {
  profile: AppProfile
  status: ConnectionStatus
  selected_proxy: ProxyServer | null
  format_bytes: (value: number) => string
  logs: string[]
  on_connect: () => void
  on_disconnect: () => void
  on_admin_restart: () => void
  busy: boolean
}

export function DashboardPage({
  profile,
  status,
  selected_proxy,
  format_bytes,
  logs,
  on_connect,
  on_disconnect,
  on_admin_restart,
  busy,
}: DashboardPageProps) {
  return (
    <div className="stack">
      <div className="grid_stats">
        <div className="stat">
          <div className="stat_label">Режим</div>
          <div className="stat_value">{profile.work_mode.toUpperCase()}</div>
        </div>
        <div className="stat">
          <div className="stat_label">Статус</div>
          <div className="stat_value">{status.state}</div>
        </div>
        <div className="stat">
          <div className="stat_label">Upload</div>
          <div className="stat_value">{format_bytes(status.upload_bytes)}</div>
        </div>
        <div className="stat">
          <div className="stat_label">Download</div>
          <div className="stat_value">{format_bytes(status.download_bytes)}</div>
        </div>
      </div>

      {profile.work_mode === 'proxy' ? (
        <div className="toast error">
          Telegram и многие приложения игнорируют системный прокси. Для них нужен режим{' '}
          <strong>TUN</strong> (запуск от администратора).
        </div>
      ) : null}

      <div className="grid_two">
        <section className="panel">
          <div className="panel_header">
            <h2>Активный сервер</h2>
            {status.state === 'connected' ? (
              <button className="btn btn_danger" disabled={busy} onClick={on_disconnect} type="button">
                Disconnect
              </button>
            ) : (
              <button className="btn btn_primary" disabled={busy || !selected_proxy} onClick={on_connect} type="button">
                Connect
              </button>
            )}
          </div>
          <div className="panel_body">
            {selected_proxy ? (
              <div className="stack">
                <div>
                  <div className="stat_label">Имя</div>
                  <div className="stat_value">{selected_proxy.name}</div>
                </div>
                <div className="mono">
                  {selected_proxy.protocol.toUpperCase()} {selected_proxy.host}:{selected_proxy.port}
                </div>
                {selected_proxy.last_exit_ip ? (
                  <div className="field_hint">
                    Exit IP: {selected_proxy.last_exit_ip}
                    {selected_proxy.last_latency_ms != null ? ` · ${selected_proxy.last_latency_ms} ms` : ''}
                  </div>
                ) : null}
                <div className="field_hint">{status.message}</div>
                {profile.work_mode === 'tun' && !status.is_admin ? (
                  <div className="stack">
                    <div className="toast error">
                      TUN-режим требует запуск приложения от имени администратора.
                    </div>
                    <button className="btn btn_secondary" type="button" onClick={on_admin_restart}>
                      Запустить от администратора
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty_state">Выберите прокси на вкладке Proxies</div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel_header">
            <h2>Состояние системы</h2>
          </div>
          <div className="panel_body">
            <div className="field_hint">Admin: {status.is_admin ? 'yes' : 'no'}</div>
            <div className="field_hint">WinTun: {status.wintun_ready ? 'ready' : 'missing'}</div>
            <div className="field_hint">
              System proxy: {status.system_proxy_enabled ? 'enabled' : 'disabled'}
            </div>
            <div className="field_hint" style={{ marginTop: 8 }}>
              Режим: {profile.work_mode.toUpperCase()}
              {profile.settings.use_proxy_group ? ' · proxy group' : ''}
            </div>
            {!status.is_admin ? (
              <div className="row_actions" style={{ marginTop: 12 }}>
                <button className="btn btn_secondary" type="button" onClick={on_admin_restart}>
                  Restart as Admin
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel_header">
          <h2>Логи движка</h2>
          <span className="field_hint">{logs.length} записей</span>
        </div>
        <div className="panel_body panel_body_flush">
          <EngineLogsTable logs={logs} />
        </div>
      </section>
    </div>
  )
}
