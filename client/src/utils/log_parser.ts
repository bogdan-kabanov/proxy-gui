export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'TRACE' | 'FATAL' | 'OTHER'

export interface LogRow {
  id: string
  time: string
  level: LogLevel
  source: string
  message: string
}

const ANSI_RE = /\u001b\[[0-9;]*m/g

function strip_ansi(value: string): string {
  return value.replace(ANSI_RE, '')
}

function normalize_level(raw: string): LogLevel {
  const upper = raw.toUpperCase()
  if (
    upper === 'INFO' ||
    upper === 'WARN' ||
    upper === 'ERROR' ||
    upper === 'DEBUG' ||
    upper === 'TRACE' ||
    upper === 'FATAL'
  ) {
    return upper
  }
  return 'OTHER'
}

export function parse_engine_logs(lines: string[]): LogRow[] {
  return lines.map((raw_line, index) => {
    const line = strip_ansi(raw_line).trim()

    // Example: +0300 2026-10-04 19:16:22 INFO inbound/mixed[mixed-in]: tcp server started...
    const match = line.match(
      /^(?:\+\d{4}\s+)?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\s+(.*)$/i,
    )

    if (match) {
      const rest = match[3]
      const source_match = rest.match(/^([^\s:]+)(?::\s*)?(.*)$/)
      return {
        id: `${index}-${match[1]}`,
        time: match[1],
        level: normalize_level(match[2]),
        source: source_match?.[1] || '',
        message: (source_match?.[2] || rest).trim() || rest,
      }
    }

    const simple = line.match(/^(INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\s+(.*)$/i)
    if (simple) {
      return {
        id: `${index}-simple`,
        time: '—',
        level: normalize_level(simple[1]),
        source: 'app',
        message: simple[2],
      }
    }

    return {
      id: `${index}-raw`,
      time: '—',
      level: 'OTHER',
      source: '',
      message: line,
    }
  })
}
