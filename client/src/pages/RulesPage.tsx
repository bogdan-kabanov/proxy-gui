import { useState } from 'react'
import type { AppProfile, ProxificationRule, RuleAction } from '../types'

interface RulesPageProps {
  profile: AppProfile
  on_upsert: (rule: ProxificationRule) => Promise<void>
  on_delete: (rule_id: string) => Promise<void>
  on_reorder: (rule_ids: string[]) => Promise<void>
}

function create_empty_rule(): ProxificationRule {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    applications: [],
    hosts: [],
    ports: '',
    action: 'proxy',
    is_builtin: false,
  }
}

export function RulesPage({ profile, on_upsert, on_delete, on_reorder }: RulesPageProps) {
  const [form, set_form] = useState<ProxificationRule>(create_empty_rule())
  const [applications_text, set_applications_text] = useState('')
  const [hosts_text, set_hosts_text] = useState('')
  const [is_new, set_is_new] = useState(true)

  const load_rule = (rule: ProxificationRule) => {
    set_form(rule)
    set_applications_text(rule.applications.join('; '))
    set_hosts_text(rule.hosts.join('; '))
    set_is_new(false)
  }

  const reset_form = () => {
    set_form(create_empty_rule())
    set_applications_text('')
    set_hosts_text('')
    set_is_new(true)
  }

  const move_rule = async (index: number, direction: -1 | 1) => {
    const next_index = index + direction
    if (next_index < 0 || next_index >= profile.rules.length) return
    const ids = profile.rules.map((rule) => rule.id)
    const temp = ids[index]
    ids[index] = ids[next_index]
    ids[next_index] = temp
    await on_reorder(ids)
  }

  const submit = async () => {
    if (!form.name.trim()) return
    const rule: ProxificationRule = {
      ...form,
      applications: applications_text
        .split(/[;,\n]+/)
        .map((item) => item.trim())
        .filter(Boolean),
      hosts: hosts_text
        .split(/[;,\n]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    }
    await on_upsert(rule)
    reset_form()
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel_header">
          <h2>Proxification Rules</h2>
          <span className="field_hint">Сверху вниз, как в Proxifier</span>
        </div>
        <div className="panel_body table_wrap">
          <table className="data">
            <thead>
              <tr>
                <th>#</th>
                <th>Имя</th>
                <th>Applications</th>
                <th>Targets</th>
                <th>Ports</th>
                <th>Action</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {profile.rules.map((rule, index) => (
                <tr key={rule.id}>
                  <td className="mono">{index + 1}</td>
                  <td>
                    {rule.name}
                    {!rule.enabled ? ' (off)' : ''}
                  </td>
                  <td className="mono">{rule.applications.join('; ') || 'Any'}</td>
                  <td className="mono">{rule.hosts.join('; ') || 'Any'}</td>
                  <td className="mono">{rule.ports || 'Any'}</td>
                  <td>{rule.action}</td>
                  <td>
                    <div className="row_actions">
                      <button className="btn btn_ghost" type="button" onClick={() => void move_rule(index, -1)}>
                        ↑
                      </button>
                      <button className="btn btn_ghost" type="button" onClick={() => void move_rule(index, 1)}>
                        ↓
                      </button>
                      <button className="btn btn_secondary" type="button" onClick={() => load_rule(rule)}>
                        Edit
                      </button>
                      <button
                        className="btn btn_danger"
                        type="button"
                        disabled={rule.is_builtin && rule.name === 'Default'}
                        onClick={() => void on_delete(rule.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel_header">
          <h2>{is_new ? 'Новое правило' : 'Редактировать правило'}</h2>
        </div>
        <div className="panel_body">
          <div className="form_grid">
            <div className="field">
              <label htmlFor="rule_name">Имя</label>
              <input
                id="rule_name"
                value={form.name}
                onChange={(event) => set_form({ ...form, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="rule_action">Action</label>
              <select
                id="rule_action"
                value={form.action}
                onChange={(event) =>
                  set_form({ ...form, action: event.target.value as RuleAction })
                }
              >
                <option value="proxy">Proxy</option>
                <option value="direct">Direct</option>
                <option value="block">Block</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="rule_apps">Applications</label>
              <input
                id="rule_apps"
                value={applications_text}
                onChange={(event) => set_applications_text(event.target.value)}
                placeholder="chrome.exe; firefox.exe"
              />
            </div>
            <div className="field">
              <label htmlFor="rule_ports">Ports</label>
              <input
                id="rule_ports"
                value={form.ports}
                onChange={(event) => set_form({ ...form, ports: event.target.value })}
                placeholder="80,443,8000-8100"
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="rule_hosts">Hosts / IP / CIDR</label>
              <textarea
                id="rule_hosts"
                value={hosts_text}
                onChange={(event) => set_hosts_text(event.target.value)}
                placeholder="*.example.com; 192.168.0.0/16"
              />
            </div>
            <div className="field">
              <label htmlFor="rule_enabled">Enabled</label>
              <select
                id="rule_enabled"
                value={form.enabled ? '1' : '0'}
                onChange={(event) =>
                  set_form({ ...form, enabled: event.target.value === '1' })
                }
              >
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </div>
          </div>
          <div className="row_actions" style={{ marginTop: 14 }}>
            <button className="btn btn_primary" type="button" onClick={() => void submit()}>
              Сохранить
            </button>
            <button className="btn btn_secondary" type="button" onClick={reset_form}>
              Сбросить
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
