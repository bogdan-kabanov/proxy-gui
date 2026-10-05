import { BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import path from 'node:path'
import type { ConnectionStatus } from './types'

let tray: Tray | null = null

function resolve_tray_icon(): Electron.NativeImage {
  const icon_path = path.join(__dirname, '../build/icon.ico')
  try {
    return nativeImage.createFromPath(icon_path)
  } catch {
    return nativeImage.createEmpty()
  }
}

export function create_tray(
  main_window: BrowserWindow,
  get_status: () => ConnectionStatus,
  on_connect: () => Promise<void>,
  on_disconnect: () => Promise<void>,
): Tray {
  if (tray) return tray

  tray = new Tray(resolve_tray_icon())
  tray.setToolTip('Proxy GUI')

  const rebuild_menu = () => {
    const status = get_status()
    const connected = status.state === 'connected'
    const menu = Menu.buildFromTemplate([
      {
        label: connected ? 'Disconnect' : 'Connect',
        click: () => {
          void (connected ? on_disconnect() : on_connect())
        },
      },
      { type: 'separator' },
      {
        label: 'Show',
        click: () => {
          main_window.show()
          main_window.focus()
        },
      },
      {
        label: 'Quit',
        click: () => {
          main_window.destroy()
        },
      },
    ])
    tray?.setContextMenu(menu)
    tray?.setToolTip(`Proxy GUI · ${status.state}`)
  }

  rebuild_menu()
  const timer = setInterval(rebuild_menu, 3000)
  tray.on('double-click', () => {
    main_window.show()
    main_window.focus()
  })

  tray.on('destroy', () => {
    clearInterval(timer)
    tray = null
  })

  return tray
}

export function destroy_tray(): void {
  tray?.destroy()
  tray = null
}
