# 💬 Chat App

Real-time messaging application built with React, Spring Boot, PostgreSQL, and WebSocket.

## Tech Stack

**Frontend:** React 18 + TypeScript + Vite + Axios + WebSocket  
**Backend:** Spring Boot 3.2 + Spring Security + Spring WebSocket + JPA  
**Database:** PostgreSQL  
**Auth:** JWT

## Features

- User authentication (Register/Login)
- Real-time one-to-one messaging
- Group chat rooms
- Online/Offline status
- Message read receipts
- User profiles with avatars

## Project Structure

```
chat-app/
├── frontend/          # React + TypeScript
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── services/
│       └── types/
└── backend/           # Spring Boot
    └── src/main/java/com/chatapp/
        ├── controller/
        ├── service/
        ├── repository/
        ├── model/
        └── config/
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
CREATE DATABASE chat-app;
```

2. **Backend**
```bash
cd backend
cp .env.example .env
# Update .env with your database credentials
mvn spring-boot:run
```

3. **Frontend**
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

**URLs:**
- Frontend: http://localhost:5173
- Backend: http://localhost:8080/api

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user

### Users
- `GET /api/users/me` - Get current user
- `GET /api/users` - List all users

### Messages
- `GET /api/messages` - Get message history
- `POST /api/messages` - Send message

### WebSocket
- `CONNECT /ws` - WebSocket connection
- `SUBSCRIBE /topic/public` - Public messages
- `SEND /app/chat.send` - Send message

## Security

- JWT authentication with secure token
- BCrypt password hashing
- CORS configuration
- SQL injection protection via JPA

## License

MIT
