import { useMemo, useState } from 'react'
import type { AppProfile, ProxyCheckResult, ProxyProtocol, ProxyServer } from '../types'

interface ProxiesPageProps {
  profile: AppProfile
  on_save: (proxy: ProxyServer, is_new: boolean) => Promise<void>
  on_delete: (proxy_id: string) => Promise<void>
  on_import: (line: string) => Promise<void>
  on_check: (proxy: ProxyServer) => Promise<ProxyCheckResult>
  on_select: (proxy_id: string) => Promise<void>
}

const EMPTY_FORM: ProxyServer = {
  id: '',
  name: '',
  host: '',
  port: 1080,
  protocol: 'socks5',
  username: '',
  password: '',
  enabled: true,
}

export function ProxiesPage({
  profile,
  on_save,
  on_delete,
  on_import,
  on_check,
  on_select,
}: ProxiesPageProps) {
  const [form, set_form] = useState<ProxyServer>(EMPTY_FORM)
  const [import_line, set_import_line] = useState('')
  const [checking_id, set_checking_id] = useState<string | null>(null)
  const is_editing = Boolean(form.id)

  const sorted_proxies = useMemo(() => profile.proxies, [profile.proxies])

  const reset_form = () => set_form(EMPTY_FORM)

  const submit = async () => {
    if (!form.name.trim() || !form.host.trim() || !form.port) {
      return
    }
    await on_save(form, !is_editing)
    reset_form()
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel_header">
          <h2>Список серверов</h2>
        </div>
        <div className="panel_body table_wrap">
          {sorted_proxies.length === 0 ? (
            <div className="empty_state">Нет серверов</div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Протокол</th>
                  <th>Адрес</th>
                  <th>Auth</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted_proxies.map((proxy) => (
                  <tr
                    key={proxy.id}
                    className={profile.selected_proxy_id === proxy.id ? 'selected' : ''}
                  >
                    <td>{proxy.name}</td>
                    <td className="mono">{proxy.protocol.toUpperCase()}</td>
                    <td className="mono">
                      {proxy.host}:{proxy.port}
                    </td>
                    <td>{proxy.username ? proxy.username : '—'}</td>
                    <td>
                      <div className="row_actions">
                        <button
                          className="btn btn_secondary"
                          type="button"
                          onClick={() => void on_select(proxy.id)}
                        >
                          Select
                        </button>
                        <button
                          className="btn btn_secondary"
                          type="button"
                          disabled={checking_id === proxy.id}
                          onClick={() => {
                            set_checking_id(proxy.id)
                            void on_check(proxy).finally(() => set_checking_id(null))
                          }}
                        >
                          Check
                        </button>
                        <button
                          className="btn btn_ghost"
                          type="button"
                          onClick={() => set_form(proxy)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn_danger"
                          type="button"
                          onClick={() => void on_delete(proxy.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="grid_two">
        <section className="panel">
          <div className="panel_header">
            <h2>{is_editing ? 'Редактировать прокси' : 'Добавить прокси'}</h2>
          </div>
          <div className="panel_body">
            <div className="form_grid">
              <div className="field">
                <label htmlFor="proxy_name">Имя</label>
                <input
                  id="proxy_name"
                  value={form.name}
                  onChange={(event) => set_form({ ...form, name: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="proxy_protocol">Протокол</label>
                <select
                  id="proxy_protocol"
                  value={form.protocol}
                  onChange={(event) =>
                    set_form({ ...form, protocol: event.target.value as ProxyProtocol })
                  }
                >
                  <option value="socks5">SOCKS5</option>
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="proxy_host">Host</label>
                <input
                  id="proxy_host"
                  value={form.host}
                  onChange={(event) => set_form({ ...form, host: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="proxy_port">Port</label>
                <input
                  id="proxy_port"
                  type="number"
                  value={form.port}
                  onChange={(event) => set_form({ ...form, port: Number(event.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="proxy_username">Username</label>
                <input
                  id="proxy_username"
                  value={form.username}
                  onChange={(event) => set_form({ ...form, username: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="proxy_password">Password</label>
                <input
                  id="proxy_password"
                  type="password"
                  value={form.password}
                  onChange={(event) => set_form({ ...form, password: event.target.value })}
                />
              </div>
            </div>
            <div className="row_actions" style={{ marginTop: 14 }}>
              <button className="btn btn_primary" type="button" onClick={() => void submit()}>
                {is_editing ? 'Сохранить' : 'Добавить'}
              </button>
              {is_editing ? (
                <button className="btn btn_secondary" type="button" onClick={reset_form}>
                  Отмена
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel_header">
            <h2>Импорт строки</h2>
          </div>
          <div className="panel_body">
            <div className="field">
              <label htmlFor="import_line">host:port:user:pass</label>
              <input
                id="import_line"
                value={import_line}
                onChange={(event) => set_import_line(event.target.value)}
                placeholder="45.11.183.190:11707:user:pass"
              />
              <div className="field_hint">По умолчанию импортируется как HTTP (CONNECT)</div>
            </div>
            <div className="row_actions" style={{ marginTop: 14 }}>
              <button
                className="btn btn_secondary"
                type="button"
                onClick={() => {
                  void on_import(import_line).then(() => set_import_line(''))
                }}
              >
                Import
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
