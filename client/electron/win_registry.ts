import { execFileSync } from 'node:child_process'

export const Registry = {
  get(key: string, value_name: string): string | null {
    try {
      const output = execFileSync(
        'reg',
        ['query', key, '/v', value_name],
        { encoding: 'utf8', windowsHide: true },
      )
      const match = output.match(new RegExp(`${value_name}\\s+REG_\\w+\\s+(.+)`))
      return match?.[1]?.trim() ?? null
    } catch {
      return null
    }
  },

  set(key: string, value_name: string, value: string, type: 'REG_SZ' | 'REG_DWORD'): void {
    execFileSync('reg', ['add', key, '/v', value_name, '/t', type, '/d', value, '/f'], {
      encoding: 'utf8',
      windowsHide: true,
    })
  },
}
