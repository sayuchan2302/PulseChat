export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'http://localhost:8080/api/ws';

export const ROUTES = {
  HOME: '/',
  LOGIN: '/',
  REGISTER: '/',
  CHAT: '/chat',
  PROFILE: '/profile',
} as const;
