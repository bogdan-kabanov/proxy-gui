# Proxy GUI

Windows desktop-клиент в стиле Proxifier: SOCKS5 / HTTP / HTTPS, правила по приложениям, режимы **Proxy** (system proxy) и **TUN** (WinTun через sing-box).

## Установка

Скачайте установщик из [Releases](https://github.com/bogdan-kabanov/proxy-gui/releases):

- **NSIS (`.exe`)** — рекомендуется: поддерживает автообновление без переустановки
- **MSI** — классическая установка, без in-app updates

Для TUN запускайте приложение от имени администратора.

## Автообновление

В установленной NSIS-версии приложение само проверяет GitHub Releases и скачивает обновление. В **Settings → Обновления** можно:

- включить/выключить автопроверку
- проверить обновления вручную
- установить скачанную версию и перезапуститься

Профиль (`%APPDATA%/proxy-gui/profile/profile.json`) при обновлении сохраняется.

Для публикации релиза с автообновлением нужны артефакты `ProxyGUI-x.y.z.exe` + `latest.yml` (создаёт electron-builder).

## Возможности

- Список прокси, bulk-импорт `host:port:user:pass`
- Автоопределение HTTP / SOCKS
- Правила: process / host / port → proxy | direct | block
- Proxy groups / failover / latency check
- System tray, Start with Windows
- Live connections (search / kill)
- Export / import профиля

## Разработка

```bash
cd client
npm install
npm run electron:dev
```

## Сборка

```bash
cd client
npm install
npm run electron:build
```

Готовые установщики появятся в `client/release/` (`.exe` + `.msi`).
