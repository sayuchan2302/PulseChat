# 💬 Chat App

A modern, full-stack real-time messaging application inspired by Messenger and Discord, featuring WebRTC audio/video calls, AI group summaries, and offline-first capabilities.

Media uploads use authenticated local storage: every file is served with per-file ownership and chat-membership checks. Public Cloudinary uploads are disabled by default.

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

- **Node.js**: 24+
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

### Production database schema

Set `SPRING_PROFILES_ACTIVE=prod` to enable Flyway migrations and Hibernate schema validation. A new (empty) production database is created from `backend/src/main/resources/db/migration/V1__initial_schema.sql`; future schema changes are added as new numbered Flyway migrations.

**First rollout onto an existing database** (one created before Flyway, by `ddl-auto=update`):

1. Back up the database (`pg_dump`) — baselining never rewrites data, but the backup is the rollback path.
2. Confirm the live schema matches the current entities at version 1: `spring.flyway.baseline-on-migrate=true` marks a non-empty schema without migration history as version 1 and applies only migrations above it; `ddl-auto=validate` then fails startup on any mismatch.
3. Start the application with the `prod` profile. Flyway baselines the schema at version 1 and applies `V2__…` onward; the log lists the migrations that ran.
4. Verify with `select installed_rank, version, description, success from flyway_schema_history order by installed_rank;` — the baseline row and every migration up to the latest version must have `success = true`.

Migrations are deliberately not written idempotently (no `IF NOT EXISTS`): Flyway records each version in `flyway_schema_history` and runs it exactly once, so such clauses would only hide genuine drift. A failed migration aborts startup and stays unsuccessful in the history; recover with the backup and fix forward with a new migration version instead of editing an applied one.

## 📄 License

MIT
