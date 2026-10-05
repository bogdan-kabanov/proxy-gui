/// <reference types="vite/client" />

declare const __APP_VERSION__: string

import type { ProxyGuiApi } from '../../electron/preload'

declare global {
  interface Window {
    proxy_gui: ProxyGuiApi
  }
}

export {}
