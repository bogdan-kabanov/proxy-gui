import { useMemo, useState } from 'react'
import type { LiveConnection } from '../types'

interface ConnectionsPageProps {
  connections: LiveConnection[]
  format_bytes: (value: number) => string
  on_kill: (connection_id: string) => Promise<void>
}

export function ConnectionsPage({ connections, format_bytes, on_kill }: ConnectionsPageProps) {
  const [query, set_query] = useState('')
  const [killing_id, set_killing_id] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return connections
    return connections.filter(
      (item) =>
        item.process_name.toLowerCase().includes(q) ||
        item.destination.toLowerCase().includes(q) ||
        item.rule.toLowerCase().includes(q),
    )
  }, [connections, query])

  return (
    <section className="panel">
      <div className="panel_header">
        <h2>Живые соединения</h2>
        <span className="field_hint">
          {filtered.length}/{connections.length} active
        </span>
      </div>
      <div className="panel_body">
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="conn_search">Поиск process / host / rule</label>
          <input
            id="conn_search"
            value={query}
            onChange={(event) => set_query(event.target.value)}
            placeholder="chrome.exe, youtube.com…"
          />
        </div>
        <div className="table_wrap">
          {filtered.length === 0 ? (
            <div className="empty_state">Нет активных соединений (подключитесь и откройте трафик)</div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Process</th>
                  <th>Destination</th>
                  <th>Network</th>
                  <th>Rule</th>
                  <th>Up</th>
                  <th>Down</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{item.process_name}</td>
                    <td className="mono">{item.destination}</td>
                    <td>{item.network}</td>
                    <td>{item.rule || '—'}</td>
                    <td>{format_bytes(item.upload_bytes)}</td>
                    <td>{format_bytes(item.download_bytes)}</td>
                    <td>
                      <button
                        className="btn btn_danger"
                        type="button"
                        disabled={killing_id === item.id}
                        onClick={() => {
                          set_killing_id(item.id)
                          void on_kill(item.id).finally(() => set_killing_id(null))
                        }}
                      >
                        Kill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  )
}
