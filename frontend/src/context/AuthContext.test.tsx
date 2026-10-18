import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useContext } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from './auth-context';
import { AuthProvider } from './AuthContext';

const apiMock = vi.hoisted(() => ({
  clearAuthSession: vi.fn(),
  onAuthSessionInvalidated: vi.fn(),
  refreshAuthSession: vi.fn(),
  storeAuthSession: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../services/api', () => ({
  apiClient: { post: apiMock.post },
  clearAuthSession: apiMock.clearAuthSession,
  onAuthSessionInvalidated: apiMock.onAuthSessionInvalidated,
  refreshAuthSession: apiMock.refreshAuthSession,
  storeAuthSession: apiMock.storeAuthSession,
}));

const dbMock = vi.hoisted(() => ({
  setActiveUser: vi.fn(),
  clearUser: vi.fn(),
}));

vi.mock('../services/dbService', () => ({ dbService: dbMock }));

function renderAuth() {
  return renderHook(() => useContext(AuthContext), {
    wrapper: ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>,
  });
}

afterEach(() => {
  cleanup();
});

describe('AuthProvider', () => {
  it('restores the session from the refresh cookie on mount', async () => {
    apiMock.onAuthSessionInvalidated.mockReturnValue(() => {});
    const user = { id: 7, username: 'sayu', online: true };
    apiMock.refreshAuthSession.mockResolvedValue({ token: 'jwt', user });

    const { result } = renderAuth();

    await waitFor(() => expect(result.current?.isLoading).toBe(false));
    expect(result.current?.user).toEqual(user);
    expect(result.current?.isAuthenticated).toBe(true);
    expect(dbMock.setActiveUser).toHaveBeenCalledWith(7);
  });

  it('stores the session when a login completes', async () => {
    apiMock.onAuthSessionInvalidated.mockReturnValue(() => {});
    apiMock.refreshAuthSession.mockResolvedValue(null);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current?.isLoading).toBe(false));
    const session = {
      token: 'jwt',
      user: { id: 9, username: 'newbie', online: true, createdAt: '2026-01-01T00:00:00' },
    };

    act(() => result.current?.completeLogin(session));

    expect(apiMock.storeAuthSession).toHaveBeenCalledWith(session);
    expect(dbMock.setActiveUser).toHaveBeenCalledWith(9);
    expect(result.current?.user).toEqual(session.user);
  });

  it('applies profile updates to the cached user', async () => {
    apiMock.onAuthSessionInvalidated.mockReturnValue(() => {});
    apiMock.refreshAuthSession.mockResolvedValue({
      token: 'jwt',
      user: { id: 5, username: 'sayu', online: true },
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current?.user?.id).toBe(5));

    act(() =>
      result.current?.updateCurrentUser({
        id: 5,
        username: 'sayu',
        online: true,
        bio: 'hello',
        createdAt: '2026-01-01T00:00:00',
      })
    );

    expect(result.current?.user?.bio).toBe('hello');
  });

  it('clears the local session after logout even when the request fails', async () => {
    apiMock.onAuthSessionInvalidated.mockReturnValue(() => {});
    apiMock.refreshAuthSession.mockResolvedValue(null);
    apiMock.post.mockRejectedValue(new Error('offline'));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current?.isLoading).toBe(false));

    await act(async () => {
      try {
        await result.current?.logout();
      } catch {
        // The UI must clear the session even when the endpoint is unreachable.
      }
    });

    expect(apiMock.post).toHaveBeenCalledWith('/auth/logout');
    expect(apiMock.clearAuthSession).toHaveBeenCalled();
    expect(result.current?.user).toBeNull();
    expect(result.current?.isAuthenticated).toBe(false);
  });

  it('clears the cached user when the session is invalidated', async () => {
    let invalidate: (() => void) | undefined;
    apiMock.onAuthSessionInvalidated.mockImplementation((listener: () => void) => {
      invalidate = listener;
      return () => {};
    });
    apiMock.refreshAuthSession.mockResolvedValue({
      token: 'jwt',
      user: { id: 5, username: 'sayu', online: true },
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current?.user?.id).toBe(5));

    act(() => invalidate?.());

    expect(apiMock.clearAuthSession).toHaveBeenCalled();
    expect(dbMock.clearUser).toHaveBeenCalledWith(5);
    expect(result.current?.user).toBeNull();
  });
});
