import { useEffect, useMemo, useRef } from 'react'
import { parse_engine_logs, type LogLevel } from '../utils/log_parser'

interface EngineLogsTableProps {
  logs: string[]
  max_rows?: number
}

function level_class(level: LogLevel): string {
  switch (level) {
    case 'ERROR':
    case 'FATAL':
      return 'log_level error'
    case 'WARN':
      return 'log_level warn'
    case 'INFO':
      return 'log_level info'
    case 'DEBUG':
    case 'TRACE':
      return 'log_level debug'
    default:
      return 'log_level other'
  }
}

export function EngineLogsTable({ logs, max_rows = 120 }: EngineLogsTableProps) {
  const rows = useMemo(() => parse_engine_logs(logs).slice(-max_rows).reverse(), [logs, max_rows])
  const body_ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (body_ref.current) {
      body_ref.current.scrollTop = 0
    }
  }, [rows.length])

  return (
    <div className="log_table_panel">
      <div className="log_table_wrap" ref={body_ref}>
        {rows.length === 0 ? (
          <div className="empty_state">Логов пока нет</div>
        ) : (
          <table className="data log_table">
            <thead>
              <tr>
                <th className="col_time">Время</th>
                <th className="col_level">Уровень</th>
                <th className="col_source">Источник</th>
                <th>Сообщение</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={`log_row_${row.level.toLowerCase()}`}>
                  <td className="mono col_time">{row.time}</td>
                  <td>
                    <span className={level_class(row.level)}>{row.level}</span>
                  </td>
                  <td className="mono col_source">{row.source || '—'}</td>
                  <td className="log_message">{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
