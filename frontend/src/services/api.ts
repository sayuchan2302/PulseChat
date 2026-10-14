import axios, { type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../config/constants';
import type { AuthResponse } from '../types';

const ACCESS_TOKEN_REFRESH_SKEW_MS = 30_000;
type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean; _sessionGeneration?: number };
type SessionInvalidationListener = () => void;

let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse | null> | null = null;
let sessionGeneration = 0;
let refreshRejected = false;
const sessionInvalidationListeners = new Set<SessionInvalidationListener>();

function isAuthEndpoint(url?: string) {
  return url?.startsWith('/auth/') ?? false;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 45_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function clearAuthSession() {
  sessionGeneration += 1;
  refreshRejected = false;
  refreshPromise = null;
  accessToken = null;
}

export function storeAuthSession(response: AuthResponse) {
  sessionGeneration += 1;
  refreshRejected = false;
  refreshPromise = null;
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
    const generation = sessionGeneration;
    const refresh = async () => {
      if (generation !== sessionGeneration) return null;

      try {
        const response = await axios.post<AuthResponse>(
          `${API_BASE_URL}/auth/refresh`,
          undefined,
          { withCredentials: true, timeout: 15_000 }
        );
        if (generation !== sessionGeneration) return null;
        refreshRejected = false;
        accessToken = response.data.token;
        return response.data;
      } catch (error) {
        if (generation === sessionGeneration) {
          refreshRejected = [401, 403].includes(axios.isAxiosError(error) ? error.response?.status ?? 0 : 0);
          if (refreshRejected) accessToken = null;
        }
        return null;
      }
    };

    // Refresh tokens rotate on every request. Serialize refreshes across tabs
    // so two tabs cannot consume the same HttpOnly cookie at the same time.
    const pendingRefresh = (async () => {
      if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request('pulsechat-auth-refresh', refresh);
      }
      return refresh();
    })().finally(() => {
      if (refreshPromise === pendingRefresh) refreshPromise = null;
    });
    refreshPromise = pendingRefresh;
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
    const generation = sessionGeneration;
    (config as RetryableRequestConfig)._sessionGeneration = generation;
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    const token = !isAuthEndpoint(config.url) ? await getValidAccessToken() : null;
    if (generation !== sessionGeneration) throw new axios.CanceledError('Authentication session changed');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => {
    if ((response.config as RetryableRequestConfig)._sessionGeneration !== sessionGeneration) {
      throw new axios.CanceledError('Authentication session changed');
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    if (originalRequest && originalRequest._sessionGeneration !== sessionGeneration) {
      throw new axios.CanceledError('Authentication session changed');
    }

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest.url)
    ) {
      originalRequest._retry = true;
      const session = await refreshAuthSession();
      if (originalRequest._sessionGeneration !== sessionGeneration) {
        throw new axios.CanceledError('Authentication session changed');
      }
      if (session) {
        originalRequest.headers.Authorization = `Bearer ${session.token}`;
        return apiClient(originalRequest);
      }

      if (refreshRejected) notifyAuthSessionInvalidated();
    }

    return Promise.reject(error);
  }
);
