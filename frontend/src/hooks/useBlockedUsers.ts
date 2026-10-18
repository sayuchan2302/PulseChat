import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../services/api';
import type { User } from '../types';

interface UseBlockedUsersOptions {
  currentUserId: number | null;
  /** Cross-slice cleanup and directory reload that must happen after a successful block. */
  onUserBlocked: (user: User) => Promise<void> | void;
  /** Surfaces block/unblock failures to the profile panel. */
  onActionError: (message: string) => void;
}

export function useBlockedUsers({ currentUserId, onUserBlocked, onActionError }: UseBlockedUsersOptions) {
  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);
  const [blockedUsersOpen, setBlockedUsersOpen] = useState(false);
  const [blockedUsersLoading, setBlockedUsersLoading] = useState(false);
  const [blockedUsersError, setBlockedUsersError] = useState('');
  const [blockActionPendingUserId, setBlockActionPendingUserId] = useState<number | null>(null);

  const loadBlockedUsers = useCallback(async () => {
    setBlockedUsersLoading(true);
    setBlockedUsersError('');
    try {
      const response = await apiClient.get<User[]>('/blocks');
      setBlockedUsers(response.data);
    } catch (error) {
      console.error('Failed to load blocked users:', error);
      setBlockedUsersError('Unable to load blocked users.');
    } finally {
      setBlockedUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }
    void loadBlockedUsers();
  }, [currentUserId, loadBlockedUsers]);

  const openBlockedUsers = useCallback(() => {
    setBlockedUsersOpen(true);
    void loadBlockedUsers();
  }, [loadBlockedUsers]);

  const closeBlockedUsers = useCallback(() => {
    setBlockedUsersOpen(false);
  }, []);

  const toggleUserBlock = useCallback(async (user: User) => {
    const isBlocked = blockedUsers.some((blockedUser) => blockedUser.id === user.id);
    setBlockActionPendingUserId(user.id);
    onActionError('');
    setBlockedUsersError('');
    try {
      if (isBlocked) {
        await apiClient.delete(`/blocks/${user.id}`);
        setBlockedUsers((current) => current.filter((blockedUser) => blockedUser.id !== user.id));
      } else {
        const response = await apiClient.put<User>(`/blocks/${user.id}`);
        setBlockedUsers((current) => current.some((blockedUser) => blockedUser.id === user.id)
          ? current
          : [response.data, ...current]);
        await onUserBlocked(user);
      }
    } catch (error) {
      console.error(isBlocked ? 'Failed to unblock user:' : 'Failed to block user:', error);
      const message = isBlocked ? 'Unable to unblock user.' : 'Unable to block user.';
      onActionError(message);
      setBlockedUsersError(message);
    } finally {
      setBlockActionPendingUserId(null);
    }
  }, [blockedUsers, onActionError, onUserBlocked]);

  const blockedUserIds = useMemo(() => blockedUsers.map((user) => user.id), [blockedUsers]);

  return {
    blockedUsers,
    blockedUserIds,
    blockedUsersOpen,
    openBlockedUsers,
    closeBlockedUsers,
    blockedUsersLoading,
    blockedUsersError,
    blockActionPendingUserId,
    toggleUserBlock,
  };
}
