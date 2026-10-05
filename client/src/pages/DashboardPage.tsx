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
                <div className="field_hint">{status.message}</div>
                {profile.work_mode === 'tun' && !status.is_admin ? (
                  <div className="toast error">
                    TUN-режим требует запуск приложения от имени администратора.
                  </div>
                ) : null}
                <div className="field_hint">
                  Для YouTube / Cursor / Telegram используйте <strong>TUN</strong> + Connect от администратора.
                  Режим Proxy ловит только программы, которые читают системный прокси.
                </div>
              </div>
            ) : (
              <div className="empty_state">Выберите прокси на вкладке Proxies</div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel_header">
            <h2>Состояние</h2>
          </div>
          <div className="panel_body">
            <div className="field_hint">
              Admin: {status.is_admin ? 'yes' : 'no'} · Режим: {profile.work_mode.toUpperCase()}
            </div>
            <div className="field_hint" style={{ marginTop: 8 }}>
              HTTP-прокси не умеет QUIC/UDP: движок режет QUIC, чтобы YouTube шёл по TCP.
              Cursor и Telegram лучше работают в TUN.
            </div>
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
