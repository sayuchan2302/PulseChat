# 💬 Chat App

A modern, full-stack real-time messaging application inspired by Messenger and Discord, featuring WebRTC audio/video calls, AI group summaries, and offline-first capabilities.

## ✨ Highlights

- 🔐 **Authentication & Security**: JWT with access & refresh tokens (HttpOnly cookie), Spring Security.
- 💬 **Real-time Messaging**: Private 1-1 and group chats via WebSocket (STOMP / SockJS).
- 🎙️ **Voice Messages**: Record and play in-chat voice notes with waveform visualization.
- 🤖 **AI Group Summary**: Catch up quickly on unread group chats using Google Gemini API.
- 📞 **1-1 Audio/Video Calls**: WebRTC P2P calls with pre-call device setup and minimized floating call bar.
- 📎 **Rich Media & Links**: Image/video upload (Local / Cloudinary), automatic OpenGraph link previews.
- 😀 **Message Interactions**: Emoji reactions, quote reply, message recall (unsend), and pinned messages.
- 👥 **Social & Community**: Friend requests, user search, profile viewer/editor, and invite-by-link for groups.
- 👁️ **Presence & Receipts**: Realtime online/offline status, last seen, typing indicators, and group "seen by" receipts.
- 💾 **Offline Resilience**: IndexedDB client caching for conversations and pending message queue.
- 🔔 **Notifications & Sounds**: In-app sound effects and browser push notifications.

## 🧰 Tech Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | React 19, TypeScript, Vite, Axios, STOMP/SockJS, React Router v7 |
| **Backend** | Spring Boot 3.2, Java 17, Spring Security, Spring WebSocket, Spring Data JPA |
| **Database** | PostgreSQL 14+ |
| **Realtime & Calls** | STOMP WebSocket, WebRTC (P2P Mesh) |
| **AI Integration** | Google Gemini API (`gemini-3.1-flash-lite`) |
| **Storage & Cache** | Local Storage / Cloudinary for media; IndexedDB for client offline cache |

## 📁 Project Structure

```text
chat-app/
├── backend/
│   └── src/main/java/com/chatapp/
│       ├── config/         # WebSocket, CORS, Resource configs
│       ├── controller/     # REST & WebSocket STOMP controllers
│       ├── dto/            # Request & Response data transfer objects
│       ├── model/          # JPA entities (User, Message, ChatRoom, CallSession, ...)
│       ├── repository/     # Spring Data JPA repositories
│       ├── security/       # JWT filters, interceptors, cookie handlers
│       ├── service/        # Business logic, Gemini AI, WebRTC signaling, Media
│       └── websocket/      # Presence & connection lifecycle listeners
└── frontend/
    └── src/
        ├── components/     # UI components (chat, call overlay, voice recorder, modals)
        ├── context/        # Auth and global application state
        ├── hooks/          # Custom hooks (WebRTC, realtime STOMP, call controls)
        ├── pages/          # AuthPage, ChatPage, InviteJoinPage
        ├── services/       # Axios API, WebSocket client, IndexedDB, Audio SFX
        └── types/          # TypeScript interface definitions
```

## 🚀 Quick Start

### Prerequisites

- **Node.js**: 18+
- **Java**: 17+
- **PostgreSQL**: 14+

### 1. Database Setup

```sql
CREATE DATABASE "chat-app";
```

### 2. Backend Setup

```bash
cd backend

# Windows
copy .env.example .env

# Linux / macOS
cp .env.example .env
```

> **Note**: Configure `.env` with your PostgreSQL credentials, a secure `JWT_SECRET` (minimum 256 bits / 32 bytes), and optionally your `GEMINI_API_KEY` for AI group summaries.

Run the backend server:

```bash
# Windows
.\mvnw.cmd spring-boot:run

# Linux / macOS
./mvnw spring-boot:run
```

API will be running at `http://localhost:8080/api`.

### 3. Frontend Setup

```bash
cd frontend

# Windows
copy .env.example .env

# Linux / macOS
cp .env.example .env

npm install
npm run dev
```

Frontend will be running at `http://localhost:5173`.

## 🧪 Testing & Validation

```bash
# Backend tests
cd backend
.\mvnw.cmd test        # Windows
./mvnw test            # Linux / macOS

# Frontend build & lint
cd frontend
npm run lint
npm run build
```

## 🔒 Notes

- Keep sensitive keys and credentials in `.env` files only; never commit them to version control.
- `spring.jpa.hibernate.ddl-auto=update` is configured for local development convenience.

## 📄 License

MIT
