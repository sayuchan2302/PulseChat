import axios, { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthResponse } from '../types';
import {
  apiClient,
  clearAuthSession,
  onAuthSessionInvalidated,
  storeAuthSession,
} from './api';

const originalAdapter = apiClient.defaults.adapter;

function tokenWithLifetime(expiresInSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds }));
  return `header.${payload.replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
}

function authSession(expiresInSeconds: number): AuthResponse {
  return {
    token: tokenWithLifetime(expiresInSeconds),
    user: { id: 1, username: 'sayu', online: true, createdAt: '2026-01-01T00:00:00' },
  };
}

function response(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Unauthorized',
    headers: new AxiosHeaders(),
    config,
  };
}

function unauthorizedError(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError(
    'Request failed with status code 401',
    'ERR_BAD_REQUEST',
    config,
    undefined,
    response(config, 401, { code: 'AUTH_401' })
  );
}

function refreshResponse(session: AuthResponse): AxiosResponse<AuthResponse> {
  return {
    data: session,
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
  } as AxiosResponse<AuthResponse>;
}

afterEach(() => {
  clearAuthSession();
  apiClient.defaults.adapter = originalAdapter;
});

describe('apiClient', () => {
  it('refreshes the session and retries the original request after a 401', async () => {
    const initial = authSession(900);
    storeAuthSession(initial);
    const refreshed = authSession(900);
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue(refreshResponse(refreshed) as never);
    const authorizations: Array<string | undefined> = [];
    let attempts = 0;
    apiClient.defaults.adapter = async (config) => {
      attempts += 1;
      authorizations.push(config.headers.Authorization as string | undefined);
      if (attempts === 1) {
        throw unauthorizedError(config);
      }
      return response(config, 200, { ok: true });
    };

    const result = await apiClient.get<{ ok: boolean }>('/friends');

    expect(result.data).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(authorizations).toEqual([`Bearer ${initial.token}`, `Bearer ${refreshed.token}`]);
  });

  it('notifies auth listeners when the refresh is rejected', async () => {
    storeAuthSession(authSession(900));
    vi.spyOn(axios, 'post').mockRejectedValue(
      unauthorizedError({ url: '/auth/refresh' } as InternalAxiosRequestConfig) as never
    );
    const listener = vi.fn();
    const unsubscribe = onAuthSessionInvalidated(listener);
    apiClient.defaults.adapter = async (config) => {
      throw unauthorizedError(config);
    };

    await expect(apiClient.get('/friends')).rejects.toMatchObject({ response: { status: 401 } });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('shares one refresh across concurrent 401 responses', async () => {
    storeAuthSession(authSession(900));
    let refreshCalls = 0;
    let releaseRefresh: () => void = () => {};
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    vi.spyOn(axios, 'post').mockImplementation((async () => {
      refreshCalls += 1;
      await refreshGate;
      return refreshResponse(authSession(900));
    }) as never);
    const attempts = new Map<string, number>();
    apiClient.defaults.adapter = async (config) => {
      const url = String(config.url);
      const attempt = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, attempt);
      if (attempt === 1) {
        throw unauthorizedError(config);
      }
      return response(config, 200, { ok: true });
    };

    const pending = [apiClient.get('/a'), apiClient.get('/b')];
    await vi.waitFor(() => {
      expect(attempts.get('/a')).toBe(1);
      expect(attempts.get('/b')).toBe(1);
    });
    // Let both rejection handlers reach the shared refresh while it is still in flight.
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseRefresh();
    await Promise.all(pending);

    expect(refreshCalls).toBe(1);
  });

  it('refreshes a token that is about to expire before sending the request', async () => {
    storeAuthSession(authSession(10));
    const refreshed = authSession(900);
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue(refreshResponse(refreshed) as never);
    const authorizations: Array<string | undefined> = [];
    apiClient.defaults.adapter = async (config) => {
      authorizations.push(config.headers.Authorization as string | undefined);
      return response(config, 200, { ok: true });
    };

    await apiClient.get('/friends');

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(authorizations).toEqual([`Bearer ${refreshed.token}`]);
  });

  it('never attaches the access token to auth endpoints', async () => {
    storeAuthSession(authSession(900));
    let authorization: string | undefined = 'unset';
    apiClient.defaults.adapter = async (config) => {
      authorization = config.headers.Authorization as string | undefined;
      return response(config, 200, { ok: true });
    };

    await apiClient.post('/auth/logout');

    expect(authorization).toBeUndefined();
  });
});
