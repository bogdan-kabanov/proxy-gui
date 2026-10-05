# Proxy GUI

Windows desktop-клиент в стиле Proxifier: SOCKS5 / HTTP / HTTPS, правила по приложениям, режимы **Proxy** (system proxy) и **TUN** (WinTun через sing-box).

## Установка

Скачайте MSI из [Releases](https://github.com/bogdan-kabanov/proxy-gui/releases) и установите `Proxy GUI-x.y.z.msi`.

Для TUN запускайте приложение от имени администратора.

## Возможности

- Список прокси, импорт `host:port:user:pass`
- Автоопределение HTTP / SOCKS
- Правила: process / host / port → proxy | direct | block
- Proxy mode: локальный mixed + системный прокси Windows
- TUN mode: виртуальный интерфейс WinTun
- Live connections и табличные логи

Профиль: `%APPDATA%/proxy-gui/profile/profile.json`.

## Разработка

```bash
cd client
npm install
npm run electron:dev
```

## Сборка MSI

```bash
cd client
npm install
npm run electron:build
```

Готовый установщик появится в `client/release/`.
