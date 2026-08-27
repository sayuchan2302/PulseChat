import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Friendship, User } from '../types';
import { apiClient } from '../services/api';
import { applyFriendshipToProfileUser } from '../utils/userUtils';

interface Options {
  currentUserIdRef: MutableRefObject<number | null>;
  setFriendActionKeys: Dispatch<SetStateAction<string[]>>;
  setUsersError: Dispatch<SetStateAction<string>>;
  setFriendRequestsError: Dispatch<SetStateAction<string>>;
  setProfileActionError: Dispatch<SetStateAction<string>>;
  setViewedProfileUser: Dispatch<SetStateAction<User | null>>;
  loadUsers: (options?: { silent?: boolean }) => Promise<unknown>;
  loadIncomingFriendRequests: (options?: { silent?: boolean }) => Promise<unknown>;
  loadFriendSummary: (options?: { silent?: boolean }) => Promise<unknown>;
}

export function useFriendshipActions({
  currentUserIdRef, setFriendActionKeys, setUsersError, setFriendRequestsError, setProfileActionError,
  setViewedProfileUser, loadUsers, loadIncomingFriendRequests, loadFriendSummary,
}: Options) {
  const setFriendActionPending = useCallback((key: string, pending: boolean) => {
    setFriendActionKeys((keys) => pending ? [...new Set([...keys, key])] : keys.filter((item) => item !== key));
  }, [setFriendActionKeys]);
  const refreshFriendshipState = useCallback(() => Promise.all([
    loadUsers({ silent: true }), loadIncomingFriendRequests({ silent: true }), loadFriendSummary({ silent: true }),
  ]), [loadFriendSummary, loadIncomingFriendRequests, loadUsers]);
  const updateViewedProfileFromFriendship = useCallback((friendship: Friendship) => {
    setViewedProfileUser((user) => user ? applyFriendshipToProfileUser(user, friendship, currentUserIdRef.current) : null);
  }, [currentUserIdRef, setViewedProfileUser]);
  const handleSendFriendRequest = useCallback(async (user: User) => {
    const actionKey = `send-${user.id}`;
    setFriendActionPending(actionKey, true); setUsersError(''); setProfileActionError('');
    try {
      const response = await apiClient.post<Friendship>('/friend-requests', { receiverId: user.id });
      updateViewedProfileFromFriendship(response.data);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to send friend request:', error);
      setUsersError('Unable to send friend request.'); setProfileActionError('Unable to send friend request.');
    } finally { setFriendActionPending(actionKey, false); }
  }, [refreshFriendshipState, setFriendActionPending, setProfileActionError, setUsersError, updateViewedProfileFromFriendship]);
  const handleAcceptFriendRequest = useCallback(async (requestId: number, actionKey: string) => {
    setFriendActionPending(actionKey, true); setFriendRequestsError(''); setProfileActionError('');
    try {
      const response = await apiClient.patch<Friendship>(`/friend-requests/${requestId}/accept`);
      updateViewedProfileFromFriendship(response.data);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to accept friend request:', error);
      setFriendRequestsError('Unable to accept request.'); setProfileActionError('Unable to accept request.');
    } finally { setFriendActionPending(actionKey, false); }
  }, [refreshFriendshipState, setFriendActionPending, setFriendRequestsError, setProfileActionError, updateViewedProfileFromFriendship]);
  const handleDeclineFriendRequest = useCallback(async (requestId: number, actionKey: string) => {
    setFriendActionPending(actionKey, true); setFriendRequestsError(''); setProfileActionError('');
    try {
      const response = await apiClient.patch<Friendship>(`/friend-requests/${requestId}/decline`);
      updateViewedProfileFromFriendship(response.data);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to decline friend request:', error);
      setFriendRequestsError('Unable to decline request.'); setProfileActionError('Unable to decline request.');
    } finally { setFriendActionPending(actionKey, false); }
  }, [refreshFriendshipState, setFriendActionPending, setFriendRequestsError, setProfileActionError, updateViewedProfileFromFriendship]);
  const handleCancelFriendRequest = useCallback(async (user: User) => {
    if (!user.friendshipId) return;
    const actionKey = `cancel-${user.id}`;
    setFriendActionPending(actionKey, true); setUsersError(''); setProfileActionError('');
    try {
      await apiClient.delete(`/friend-requests/${user.friendshipId}`);
      setViewedProfileUser((profile) => profile?.id === user.id ? { ...profile, friendshipId: undefined, friendshipStatus: 'none' } : profile);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to cancel friend request:', error);
      setUsersError('Unable to cancel friend request.'); setProfileActionError('Unable to cancel friend request.');
    } finally { setFriendActionPending(actionKey, false); }
  }, [refreshFriendshipState, setFriendActionPending, setProfileActionError, setUsersError, setViewedProfileUser]);
  return { handleSendFriendRequest, handleAcceptFriendRequest, handleDeclineFriendRequest, handleCancelFriendRequest };
}

export default useFriendshipActions;
