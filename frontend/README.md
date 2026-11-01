# 💬 Chat App — Frontend

Frontend client for PulseChat, built with **React 19**, **TypeScript**, and **Vite**.

## 🚀 Features

- ⚡ **Realtime Messaging**: private and group chat over STOMP/SockJS.
- 📞 **WebRTC Calling**: 1-1 audio/video calls, pre-call device check, and a minimized call bar.
- 🎙️ **Voice Notes**: in-chat recorder and waveform player.
- 🖼️ **Media & Link Previews**: image/video lightbox and OpenGraph link cards.
- 💾 **Offline Cache**: IndexedDB cache for conversations and unsent messages.
- 🔔 **Audio & Notifications**: in-app sound effects and browser notifications.
- 📱 **Responsive UI**: mobile layout, light/dark themes, and accessible controls.

## 🛠️ Tech Stack

- **Framework**: React 19 + TypeScript
- **Bundler & Dev Server**: Vite
- **Routing**: React Router v7
- **HTTP Client**: Axios
- **Realtime**: `@stomp/stompjs` + `sockjs-client`
- **Testing**: Vitest, Testing Library, Playwright, axe-core
- **Linter**: Oxlint

## 📂 Directory Structure

```text
src/
├── assets/         # Sound effects and static assets
├── components/     # UI components (chat, calls, modals, voice notes)
├── config/         # App constants, routes, API endpoints
├── constants/      # Shared constants
├── context/        # Auth and application contexts
├── hooks/          # WebRTC, STOMP, call controls, viewport hooks
├── icons/          # SVG icons
├── pages/          # Auth, chat, admin, and invite pages
├── services/       # API, WebSocket, IndexedDB, audio services
├── styles/         # Tokens, reset, and shared styles
├── types/          # TypeScript contracts
└── utils/          # Formatting and utility functions
```

## ⚙️ Environment Variables

Create `.env` from `.env.example`:

```env
VITE_API_BASE_URL=http://localhost:8080/api
VITE_WS_BASE_URL=http://localhost:8080/api/ws
VITE_APP_NAME=Chat App
VITE_APP_VERSION=1.0.0
VITE_RTC_STUN_URLS=stun:stun.l.google.com:19302
VITE_RTC_TURN_URLS=
VITE_RTC_TURN_USERNAME=
VITE_RTC_TURN_CREDENTIAL=
VITE_CALL_RINGING_TIMEOUT_MS=45000
```

## 💻 Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite at `http://localhost:5173`. |
| `npm run build` | Type-check and build the production bundle. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run Oxlint. |
| `npm test` | Run Vitest unit/component tests. |
| `npm run test:coverage` | Run Vitest with coverage. |
| `npm run test:e2e` | Run the Playwright browser quality gate. |
| `npm run test:e2e:visual` | Run only the `@visual` snapshot tests. |
| `npm run check:css` | Fail if a class used in TSX has no CSS rule. |

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## 🧪 Browser E2E

`npm run test:e2e` runs Chromium against a real PostgreSQL database. Locally it
starts the E2E backend on `8081` and Vite on `4173` using the database
credentials from `backend/.env` (or `DB_*` variables). The run creates
throwaway `e2e_*` accounts; use a disposable `DB_NAME` if you do not want them
in your development database.

The suite covers auth, realtime chat and offline recovery, incoming-call popup
layout, responsive overflow, axe smoke checks, computed-style contracts, and
local visual snapshots. Visual baselines are Windows-specific and skipped in
CI.

See the root [`TEST_PLAN.md`](../TEST_PLAN.md) for the full test layers and
evidence.
