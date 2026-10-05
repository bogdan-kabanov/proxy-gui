import { useEffect, useState } from 'react'
import type { AppProfile, RuleAction } from '../types'

interface SettingsPageProps {
  profile: AppProfile
  on_save: (settings: AppProfile['settings']) => Promise<void>
  is_admin: boolean
}

export function SettingsPage({ profile, on_save, is_admin }: SettingsPageProps) {
  const [settings, set_settings] = useState(profile.settings)

  useEffect(() => {
    set_settings(profile.settings)
  }, [profile.settings])

  return (
    <section className="panel">
      <div className="panel_header">
        <h2>Настройки</h2>
        <span className="field_hint">Admin: {is_admin ? 'yes' : 'no'}</span>
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
        </div>
        <div className="row_actions" style={{ marginTop: 14 }}>
          <button className="btn btn_primary" type="button" onClick={() => void on_save(settings)}>
            Сохранить
          </button>
        </div>
        <div className="field_hint" style={{ marginTop: 12 }}>
          TUN использует WinTun и требует права администратора. Proxy-режим выставляет системный
          прокси Windows на локальный mixed-порт.
        </div>
      </div>
    </section>
  )
}
