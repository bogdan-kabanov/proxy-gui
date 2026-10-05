import { useMemo, useState } from 'react'
import type {
  AppProfile,
  ProxyCheckResult,
  ProxyGroup,
  ProxyGroupMode,
  ProxyProtocol,
  ProxyServer,
} from '../types'

interface ProxiesPageProps {
  profile: AppProfile
  on_save: (proxy: ProxyServer, is_new: boolean) => Promise<void>
  on_delete: (proxy_id: string) => Promise<void>
  on_import: (line: string) => Promise<void>
  on_import_bulk: (text: string) => Promise<{ imported: number; skipped: number; tested: number; failed: number }>
  on_import_files: () => Promise<{ imported: number; skipped: number; tested: number; failed: number }>
  on_check: (proxy: ProxyServer) => Promise<ProxyCheckResult>
  on_check_all: () => Promise<void>
  on_select: (proxy_id: string) => Promise<void>
  on_group_save: (group: ProxyGroup) => Promise<void>
  on_group_delete: (group_id: string) => Promise<void>
  on_use_group_change: (use_group: boolean, group_id: string | null) => Promise<void>
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
  last_latency_ms: null,
  last_exit_ip: null,
  last_checked_at: null,
}

function create_empty_group(): ProxyGroup {
  return {
    id: crypto.randomUUID(),
    name: '',
    proxy_ids: [],
    mode: 'urltest',
    selected_proxy_id: null,
  }
}

export function ProxiesPage({
  profile,
  on_save,
  on_delete,
  on_import,
  on_import_bulk,
  on_import_files,
  on_check,
  on_check_all,
  on_select,
  on_group_save,
  on_group_delete,
  on_use_group_change,
}: ProxiesPageProps) {
  const [form, set_form] = useState<ProxyServer>(EMPTY_FORM)
  const [import_line, set_import_line] = useState('')
  const [bulk_text, set_bulk_text] = useState('')
  const [checking_id, set_checking_id] = useState<string | null>(null)
  const [group_form, set_group_form] = useState<ProxyGroup>(create_empty_group())
  const [checking_all, set_checking_all] = useState(false)
  const [importing_files, set_importing_files] = useState(false)
  const is_editing = Boolean(form.id)

  const sorted_proxies = useMemo(
    () =>
      [...profile.proxies].sort((a, b) => {
        const la = a.last_latency_ms ?? Number.MAX_SAFE_INTEGER
        const lb = b.last_latency_ms ?? Number.MAX_SAFE_INTEGER
        return la - lb
      }),
    [profile.proxies],
  )

  const reset_form = () => set_form(EMPTY_FORM)

  const submit = async () => {
    if (!form.name.trim() || !form.host.trim() || !form.port) return
    await on_save(form, !is_editing)
    reset_form()
  }

  const submit_group = async () => {
    if (!group_form.name.trim() || group_form.proxy_ids.length === 0) return
    await on_group_save(group_form)
    set_group_form(create_empty_group())
  }

  const toggle_group_proxy = (proxy_id: string) => {
    const has = group_form.proxy_ids.includes(proxy_id)
    set_group_form({
      ...group_form,
      proxy_ids: has
        ? group_form.proxy_ids.filter((id) => id !== proxy_id)
        : [...group_form.proxy_ids, proxy_id],
    })
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel_header">
          <h2>Список серверов</h2>
          <button
            className="btn btn_secondary"
            type="button"
            disabled={checking_all}
            onClick={() => {
              set_checking_all(true)
              void on_check_all().finally(() => set_checking_all(false))
            }}
          >
            Check all
          </button>
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
                  <th>Exit IP</th>
                  <th>Latency</th>
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
                    <td className="mono">{proxy.last_exit_ip ?? '—'}</td>
                    <td className="mono">
                      {proxy.last_latency_ms != null ? `${proxy.last_latency_ms} ms` : '—'}
                    </td>
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
                        <button className="btn btn_ghost" type="button" onClick={() => set_form(proxy)}>
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

      <section className="panel">
        <div className="panel_header">
          <h2>Proxy groups</h2>
          <div className="row_actions">
            <label className="field_hint">
              <input
                type="checkbox"
                checked={profile.settings.use_proxy_group}
                onChange={(event) =>
                  void on_use_group_change(
                    event.target.checked,
                    profile.settings.selected_group_id ?? profile.proxy_groups[0]?.id ?? null,
                  )
                }
              />{' '}
              Use group on Connect
            </label>
          </div>
        </div>
        <div className="panel_body">
          {profile.proxy_groups.length === 0 ? (
            <div className="empty_state">Нет групп — создайте ниже для failover / url-test</div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Mode</th>
                  <th>Proxies</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {profile.proxy_groups.map((group) => (
                  <tr
                    key={group.id}
                    className={
                      profile.settings.selected_group_id === group.id ? 'selected' : ''
                    }
                  >
                    <td>{group.name}</td>
                    <td>{group.mode}</td>
                    <td>{group.proxy_ids.length}</td>
                    <td>
                      <div className="row_actions">
                        <button
                          className="btn btn_secondary"
                          type="button"
                          onClick={() =>
                            void on_use_group_change(true, group.id)
                          }
                        >
                          Select
                        </button>
                        <button
                          className="btn btn_ghost"
                          type="button"
                          onClick={() => set_group_form(group)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn_danger"
                          type="button"
                          onClick={() => void on_group_delete(group.id)}
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

          <div className="form_grid" style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor="group_name">Group name</label>
              <input
                id="group_name"
                value={group_form.name}
                onChange={(event) => set_group_form({ ...group_form, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="group_mode">Mode</label>
              <select
                id="group_mode"
                value={group_form.mode}
                onChange={(event) =>
                  set_group_form({
                    ...group_form,
                    mode: event.target.value as ProxyGroupMode,
                  })
                }
              >
                <option value="urltest">URL-test (latency failover)</option>
                <option value="select">Manual select</option>
              </select>
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Proxies in group</label>
            <div className="stack" style={{ gap: 6 }}>
              {profile.proxies.map((proxy) => (
                <label key={proxy.id} className="field_hint">
                  <input
                    type="checkbox"
                    checked={group_form.proxy_ids.includes(proxy.id)}
                    onChange={() => toggle_group_proxy(proxy.id)}
                  />{' '}
                  {proxy.name} ({proxy.host}:{proxy.port})
                </label>
              ))}
            </div>
          </div>
          <div className="row_actions" style={{ marginTop: 14 }}>
            <button className="btn btn_primary" type="button" onClick={() => void submit_group()}>
              Save group
            </button>
            <button
              className="btn btn_secondary"
              type="button"
              onClick={() => set_group_form(create_empty_group())}
            >
              Reset
            </button>
          </div>
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
            <h2>Импорт</h2>
          </div>
          <div className="panel_body stack">
            <div className="field">
              <label>Файлы провайдера (.txt)</label>
              <div className="field_hint">
                Поддерживаются: plain, http://, socks5://, user:pass@host:port. Можно выбрать несколько
                файлов сразу — рабочие прокси сами проверяются и добавляются.
              </div>
            </div>
            <div className="row_actions">
              <button
                className="btn btn_primary"
                type="button"
                disabled={importing_files}
                onClick={() => {
                  set_importing_files(true)
                  void on_import_files().finally(() => set_importing_files(false))
                }}
              >
                {importing_files ? 'Тестирую…' : 'Import .txt files'}
              </button>
            </div>
            <div className="field">
              <label htmlFor="import_line">Одна строка host:port:user:pass</label>
              <input
                id="import_line"
                value={import_line}
                onChange={(event) => set_import_line(event.target.value)}
                placeholder="host:port:user:pass"
              />
            </div>
            <div className="row_actions">
              <button
                className="btn btn_secondary"
                type="button"
                onClick={() => {
                  void on_import(import_line).then(() => set_import_line(''))
                }}
              >
                Import line
              </button>
            </div>
            <div className="field">
              <label htmlFor="bulk_text">Bulk import (по строке на прокси)</label>
              <textarea
                id="bulk_text"
                value={bulk_text}
                onChange={(event) => set_bulk_text(event.target.value)}
                placeholder={'host:port:user:pass\nhttp://user:pass@host:port\nsocks5://user:pass@host:port'}
                rows={6}
              />
              <div className="field_hint">При импорте строки тестируются; мёртвые не добавляются</div>
            </div>
            <div className="row_actions">
              <button
                className="btn btn_secondary"
                type="button"
                onClick={() => {
                  void on_import_bulk(bulk_text).then(() => set_bulk_text(''))
                }}
              >
                Bulk import + test
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
