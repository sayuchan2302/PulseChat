# 💬 Chat App

A full-stack real-time chat application inspired by modern Messenger-style experiences.

## ✨ Highlights

- 🔐 JWT authentication with access and refresh tokens
- 💬 Real-time private and group messaging with STOMP WebSocket
- 👥 Friend requests, friends list, user search, and profile preview
- 🖼️ Image/video messages with in-chat media preview
- 🔗 Link previews and shared media/link gallery
- 😀 Emoji picker, reactions, replies, recall, read receipts, and unread badges
- 📞 1-1 audio/video calls with WebRTC and a minimized call bar
- 👤 User profile, local avatar upload, presence, and last-seen status

## 🧰 Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Axios, STOMP/SockJS |
| Backend | Spring Boot 3.2, Spring Security, Spring WebSocket, Spring Data JPA |
| Database | PostgreSQL |
| Realtime | WebSocket, STOMP, WebRTC |
| Media | Local avatar upload, Cloudinary-ready message media |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Java 17+
- PostgreSQL 14+

### 1. Database

```sql
CREATE DATABASE "chat-app";
```

### 2. Backend

```bash
cd backend
copy .env.example .env
.\mvnw.cmd spring-boot:run
```

Backend runs at `http://localhost:8080/api`.

### 3. Frontend

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

## 📁 Project Structure

```text
chat-app/
├── backend/    # Spring Boot REST API, WebSocket, auth, PostgreSQL models
└── frontend/   # React chat UI, realtime client, media and call experience
```

## ✅ Validation

```bash
cd backend
.\mvnw.cmd test
```

```bash
cd frontend
npm run build
npm run lint
```

## 🔒 Notes

- Keep secrets in `.env` files only.
- Do not commit database credentials, JWT secrets, or Cloudinary secrets.
- The project uses `spring.jpa.hibernate.ddl-auto=update` for solo development convenience.

## 📄 License

MIT
