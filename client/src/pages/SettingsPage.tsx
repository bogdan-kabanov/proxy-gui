import { useEffect, useState } from 'react'
import type { AppProfile, ConnectionStatus, RuleAction, UpdateStatus } from '../types'

interface SettingsPageProps {
  profile: AppProfile
  status: ConnectionStatus
  on_save: (settings: AppProfile['settings']) => Promise<void>
  on_export: () => Promise<string>
  on_import: (json_text: string) => Promise<void>
  on_admin_restart: () => void
}

export function SettingsPage({
  profile,
  status,
  on_save,
  on_export,
  on_import,
  on_admin_restart,
}: SettingsPageProps) {
  const [settings, set_settings] = useState(profile.settings)
  const [import_text, set_import_text] = useState('')
  const [update_status, set_update_status] = useState<UpdateStatus | null>(null)
  const [update_busy, set_update_busy] = useState(false)

  useEffect(() => {
    set_settings(profile.settings)
  }, [profile.settings])

  useEffect(() => {
    void window.proxy_gui.update_status().then(set_update_status)
    const unsubscribe = window.proxy_gui.on_update_status(set_update_status)
    return unsubscribe
  }, [])

  const handle_export = async () => {
    const json_text = await on_export()
    await navigator.clipboard.writeText(json_text)
  }

  const handle_check_update = async () => {
    set_update_busy(true)
    try {
      const next = await window.proxy_gui.update_check()
      set_update_status(next)
    } finally {
      set_update_busy(false)
    }
  }

  const handle_install_update = async () => {
    set_update_busy(true)
    try {
      const next = await window.proxy_gui.update_install()
      set_update_status(next)
    } finally {
      set_update_busy(false)
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel_header">
          <h2>Настройки</h2>
          <span className="field_hint">
            Admin: {status.is_admin ? 'yes' : 'no'} · WinTun: {status.wintun_ready ? 'yes' : 'no'}
          </span>
        </div>
        <div className="panel_body">
          <div className="form_grid">
            <div className="field">
              <label htmlFor="mixed_port">Mixed port</label>
              <input
                id="mixed_port"
                type="number"
                value={settings.mixed_port}
                onChange={(event) =>
                  set_settings({ ...settings, mixed_port: Number(event.target.value) })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="clash_api_port">Clash API port</label>
              <input
                id="clash_api_port"
                type="number"
                value={settings.clash_api_port}
                onChange={(event) =>
                  set_settings({ ...settings, clash_api_port: Number(event.target.value) })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="dns_via_proxy">DNS via proxy</label>
              <select
                id="dns_via_proxy"
                value={settings.dns_via_proxy ? '1' : '0'}
                onChange={(event) =>
                  set_settings({ ...settings, dns_via_proxy: event.target.value === '1' })
                }
              >
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="default_action">Default action</label>
              <select
                id="default_action"
                value={settings.default_action}
                onChange={(event) =>
                  set_settings({
                    ...settings,
                    default_action: event.target.value as RuleAction,
                  })
                }
              >
                <option value="proxy">Proxy</option>
                <option value="direct">Direct</option>
                <option value="block">Block</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="auto_connect">Auto connect</label>
              <select
                id="auto_connect"
                value={settings.auto_connect ? '1' : '0'}
                onChange={(event) =>
                  set_settings({ ...settings, auto_connect: event.target.value === '1' })
                }
              >
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="start_with_windows">Start with Windows</label>
              <select
                id="start_with_windows"
                value={settings.start_with_windows ? '1' : '0'}
                onChange={(event) =>
                  set_settings({ ...settings, start_with_windows: event.target.value === '1' })
                }
              >
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="minimize_to_tray">Minimize to tray</label>
              <select
                id="minimize_to_tray"
                value={settings.minimize_to_tray ? '1' : '0'}
                onChange={(event) =>
                  set_settings({ ...settings, minimize_to_tray: event.target.value === '1' })
                }
              >
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="auto_check_updates">Auto check updates</label>
              <select
                id="auto_check_updates"
                value={settings.auto_check_updates ? '1' : '0'}
                onChange={(event) =>
                  set_settings({ ...settings, auto_check_updates: event.target.value === '1' })
                }
              >
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </div>
          </div>
          <div className="row_actions" style={{ marginTop: 14 }}>
            <button className="btn btn_primary" type="button" onClick={() => void on_save(settings)}>
              Сохранить
            </button>
            {!status.is_admin ? (
              <button className="btn btn_secondary" type="button" onClick={on_admin_restart}>
                Restart as Admin
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel_header">
          <h2>Обновления</h2>
          <span className="field_hint">v{update_status?.current_version ?? '—'}</span>
        </div>
        <div className="panel_body stack">
          <div className="field_hint">{update_status?.message ?? 'Загрузка статуса…'}</div>
          {update_status?.state === 'downloading' ? (
            <div className="field_hint">Прогресс: {update_status.progress_percent}%</div>
          ) : null}
          {update_status?.available_version ? (
            <div className="field_hint">Новая версия: {update_status.available_version}</div>
          ) : null}
          <div className="row_actions">
            <button
              className="btn btn_secondary"
              type="button"
              disabled={update_busy || update_status?.state === 'downloading'}
              onClick={() => void handle_check_update()}
            >
              Проверить обновления
            </button>
            {update_status?.state === 'ready' ? (
              <button
                className="btn btn_primary"
                type="button"
                disabled={update_busy}
                onClick={() => void handle_install_update()}
              >
                Установить и перезапустить
              </button>
            ) : null}
          </div>
          <div className="field_hint">
            Автообновление работает для установки через NSIS (`.exe`). Профиль и настройки сохраняются.
            Релизы публикуются в GitHub Releases.
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel_header">
          <h2>Export / Import профиля</h2>
        </div>
        <div className="panel_body stack">
          <div className="row_actions">
            <button className="btn btn_secondary" type="button" onClick={() => void handle_export()}>
              Export to clipboard
            </button>
          </div>
          <div className="field">
            <label htmlFor="profile_import">Import JSON</label>
            <textarea
              id="profile_import"
              value={import_text}
              onChange={(event) => set_import_text(event.target.value)}
              rows={8}
              placeholder='{"proxies":[...],"rules":[...]}'
            />
          </div>
          <div className="row_actions">
            <button
              className="btn btn_primary"
              type="button"
              onClick={() => {
                void on_import(import_text).then(() => set_import_text(''))
              }}
            >
              Import profile
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
