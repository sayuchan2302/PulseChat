# Chat App

Real-time chat application built with React, Spring Boot, PostgreSQL, and STOMP WebSocket.

## Tech Stack

**Frontend:** React 19 + TypeScript + Vite + Axios + STOMP/SockJS
**Backend:** Spring Boot 3.2 + Spring Security + Spring WebSocket + JPA  
**Database:** PostgreSQL  
**Auth:** JWT

## Current Status

The project is in the implementation roadmap stage.

Implemented now:
- React auth page and chat page shell
- Axios API client with Bearer token interceptor
- STOMP/SockJS client service
- Spring Boot app bootstrap
- JPA entities for users, messages, and chat rooms
- CORS and STOMP endpoint config
- Auth controllers, services, repository, JWT filter, and `/users/me`

Still planned:
- Message persistence APIs
- WebSocket message controller
- Group chat, presence, read receipts, tests, migrations, and production setup

See [implementation-phases.md](implementation-phases.md) for the phase-by-phase implementation plan.

## Project Structure

```text
chat-app/
├── frontend/
│   └── src/
│       ├── config/
│       ├── context/
│       ├── pages/
│       ├── services/
│       └── types/
└── backend/
    └── src/main/
        ├── java/com/chatapp/
        │   ├── config/
        │   └── model/
        └── resources/
```

## Quick Start

### Prerequisites
- Node.js 18+
- Java 17+
- Maven 3.8+
- PostgreSQL 14+

### Setup

1. **Database**

```sql
CREATE DATABASE "chat-app";
```

2. **Backend**

```bash
cd backend
cp .env.example .env
# Update .env with your local database and JWT values
mvn spring-boot:run
```

3. **Frontend**

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

URLs:
- Frontend: http://localhost:5173
- Backend REST base: http://localhost:8080/api
- Backend SockJS endpoint: http://localhost:8080/api/ws

## Planned API Contract

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user

### Users
- `GET /api/users/me` - Get current user
- `GET /api/users` - List users

### Messages
- `GET /api/messages/{userId}` - Get 1-1 conversation history
- `POST /api/messages` - Send 1-1 message

### WebSocket
- `CONNECT /api/ws` - SockJS/STOMP connection
- `SUBSCRIBE /user/queue/messages` - Private messages
- `SUBSCRIBE /topic/public` - Public events
- `SEND /app/chat.send` - Send message event

## Validation

Frontend:

```bash
cd frontend
npm run build
npm run lint
```

Backend:

```bash
cd backend
mvn test
```

## Security Notes

- Keep real database credentials and JWT secrets in `.env`.
- Do not commit `.env` files.
- `application.yml` intentionally avoids sensitive defaults.
- Use DTOs for API responses so password hashes and lazy JPA graphs are never serialized directly.

## License

MIT
