import axios, { type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../config/constants';
import type { AuthResponse } from '../types';

const ACCESS_TOKEN_REFRESH_SKEW_MS = 30_000;
type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };
type SessionInvalidationListener = () => void;

let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse | null> | null = null;
const sessionInvalidationListeners = new Set<SessionInvalidationListener>();

function isAuthEndpoint(url?: string) {
  return url?.startsWith('/auth/') ?? false;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function clearAuthSession() {
  accessToken = null;
}

export function storeAuthSession(response: AuthResponse) {
  accessToken = response.token;
}

export function onAuthSessionInvalidated(listener: SessionInvalidationListener) {
  sessionInvalidationListeners.add(listener);
  return () => sessionInvalidationListeners.delete(listener);
}

function notifyAuthSessionInvalidated() {
  sessionInvalidationListeners.forEach((listener) => listener());
}

function getJwtExpirationMs(token: string) {
  const [, payload] = token.split('.');
  if (!payload) {
    return 0;
  }

  try {
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '='
    );
    const decodedPayload = JSON.parse(atob(paddedPayload)) as { exp?: number };
    return decodedPayload.exp ? decodedPayload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function shouldRefreshAccessToken(token: string) {
  const expiresAt = getJwtExpirationMs(token);
  return expiresAt > 0 && expiresAt - Date.now() <= ACCESS_TOKEN_REFRESH_SKEW_MS;
}

export async function refreshAuthSession() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<AuthResponse>(`${API_BASE_URL}/auth/refresh`, undefined, { withCredentials: true })
      .then((response) => {
        storeAuthSession(response.data);
        return response.data;
      })
      .catch(() => {
        clearAuthSession();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function getValidAccessToken() {
  if (accessToken && !shouldRefreshAccessToken(accessToken)) {
    return accessToken;
  }

  return (await refreshAuthSession())?.token ?? null;
}

apiClient.interceptors.request.use(
  async (config) => {
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    const token = !isAuthEndpoint(config.url) ? await getValidAccessToken() : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest.url)
    ) {
      originalRequest._retry = true;
      const session = await refreshAuthSession();
      if (session) {
        originalRequest.headers.Authorization = `Bearer ${session.token}`;
        return apiClient(originalRequest);
      }

      notifyAuthSessionInvalidated();
    }

    return Promise.reject(error);
  }
);
