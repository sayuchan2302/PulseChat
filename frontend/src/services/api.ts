import axios, { type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, ROUTES } from '../config/constants';
import type { AuthResponse } from '../types';

const ACCESS_TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';
const ACCESS_TOKEN_REFRESH_SKEW_MS = 30_000;
type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function isAuthEndpoint(url?: string) {
  return url?.startsWith('/auth/') ?? false;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshPromise: Promise<string | null> | null = null;

export function clearAuthSession() {
  localStorage.removeItem('user');
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function storeAuthSession(response: AuthResponse) {
  localStorage.setItem(ACCESS_TOKEN_KEY, response.token);
  localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
  localStorage.setItem('user', JSON.stringify(response.user));
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

export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    return null;
  }

  if (!refreshPromise) {
    refreshPromise = axios
      .post<AuthResponse>(`${API_BASE_URL}/auth/refresh`, { refreshToken })
      .then((response) => {
        storeAuthSession(response.data);
        return response.data.token;
      })
      .catch((error) => {
        clearAuthSession();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function getValidAccessToken() {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token && !shouldRefreshAccessToken(token)) {
    return token;
  }

  return refreshAccessToken();
}

// Request interceptor for adding auth token
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

// Response interceptor for handling errors
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

      try {
        const token = await refreshAccessToken();
        if (token) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        }
      } catch {
        clearAuthSession();
      }

      window.location.href = ROUTES.LOGIN;
    }

    return Promise.reject(error);
  }
);
