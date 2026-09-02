# 💬 Chat App — Frontend

Frontend client for the Chat App, built with **React 19**, **TypeScript**, and **Vite**.

## 🚀 Features

- ⚡ **Realtime Messaging**: WebSocket via `@stomp/stompjs` and `sockjs-client`.
- 📞 **WebRTC Calling**: 1-1 voice and video calls with device test pre-call modal and minimized call bar.
- 🎙️ **Voice Notes**: Built-in voice message recorder and player.
- 🖼️ **Media & Link Previews**: Image/video lightbox preview and automatic OpenGraph link cards.
- 💾 **Offline Cache**: IndexedDB caching for conversations and unsent pending messages.
- 🔔 **In-app Audio & Notifications**: Sound effects for events and browser push notifications.
- 📱 **Responsive & Modern UI**: Messenger/Discord-style UI with rich animations and dark theme support.

## 🛠️ Tech Stack

- **Framework**: React 19 + TypeScript
- **Bundler & Dev Server**: Vite
- **Routing**: React Router v7
- **HTTP Client**: Axios
- **Realtime**: `@stomp/stompjs` & `sockjs-client`
- **Linter**: Oxlint

## 📂 Directory Structure

```text
src/
├── assets/         # Sound effects and static assets
├── components/     # UI components
│   ├── chat/       # Conversation, MessageList, Input, Modals, Call overlays
│   ├── VoiceMessagePlayer.tsx
│   └── VoiceRecorderButton.tsx
├── config/         # App constants, routes, API endpoints
├── constants/      # Shared constant definitions
├── context/        # Auth and application contexts
├── hooks/          # Domain hooks (WebRTC, STOMP, call controls, viewport)
├── icons/          # SVG iconography
├── pages/          # AuthPage, ChatPage, InviteJoinPage
├── services/       # Axios API client, WebSocket STOMP, IndexedDB, Sounds
├── types/          # TypeScript data contracts & models
└── utils/          # Formatting and utility functions
```

## ⚙️ Environment Variables

Create `.env` based on `.env.example`:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:8080/api
VITE_WS_BASE_URL=http://localhost:8080/api/ws

# Application Info
VITE_APP_NAME=Chat App
VITE_APP_VERSION=1.0.0

# WebRTC ICE Servers
VITE_RTC_STUN_URLS=stun:stun.l.google.com:19302
VITE_RTC_TURN_URLS=
VITE_RTC_TURN_USERNAME=
VITE_RTC_TURN_CREDENTIAL=
VITE_CALL_RINGING_TIMEOUT_MS=45000
```

## 💻 Available Scripts

- `npm run dev`: Start local development server at `http://localhost:5173`
- `npm run build`: Type-check and build production bundle
- `npm run lint`: Run Oxlint to check code quality
- `npm run preview`: Preview production build locally
