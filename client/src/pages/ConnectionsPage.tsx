import type { LiveConnection } from '../types'

interface ConnectionsPageProps {
  connections: LiveConnection[]
  format_bytes: (value: number) => string
}

export function ConnectionsPage({ connections, format_bytes }: ConnectionsPageProps) {
  return (
    <section className="panel">
      <div className="panel_header">
        <h2>Живые соединения</h2>
        <span className="field_hint">{connections.length} active</span>
      </div>
      <div className="panel_body table_wrap">
        {connections.length === 0 ? (
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
              </tr>
            </thead>
            <tbody>
              {connections.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{item.process_name}</td>
                  <td className="mono">{item.destination}</td>
                  <td>{item.network}</td>
                  <td>{item.rule || '—'}</td>
                  <td>{format_bytes(item.upload_bytes)}</td>
                  <td>{format_bytes(item.download_bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
