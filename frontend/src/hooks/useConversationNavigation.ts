import { useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { ChatRoom, User } from '../types';
import type { MainView, PendingReadConversation } from '../types/chat.types';
import { apiClient } from '../services/api';
import { shouldOpenConversationDetailsByDefault } from '../utils/userUtils';
import {
  getChatRoute,
  getFriendsRoute,
  parseChatRoute,
} from '../utils/routeUtils';

type MutableRef<T> = { current: T };

interface UseConversationNavigationOptions {
  currentUserId: number | undefined;
  pathname: string;
  navigate: NavigateFunction;
  users: User[];
  friends: User[];
  rooms: ChatRoom[];
  usersLoading: boolean;
  usersError: string;
  roomsLoading: boolean;
  canOpenDirectConversation: (user: User) => boolean;
  selectedUserIdRef: MutableRef<number | null>;
  selectedRoomIdRef: MutableRef<number | null>;
  userSearchQueryRef: MutableRef<string>;
  stopTyping: (userId: number) => void;
  stopRoomTyping: (roomId: number) => void;
  resetMessagePagination: () => void;
  clearPendingReadConversation: () => void;
  preparePendingReadConversation: (
    type: NonNullable<PendingReadConversation>['type'],
    id: number,
    unreadCount: number,
  ) => void;
  hideRemoteTyping: () => void;
  loadMessages: (userId: number) => Promise<void>;
  loadRoomMessages: (roomId: number) => Promise<void>;
  loadUsers: (options?: { silent?: boolean; search?: string }) => Promise<void>;
  loadIncomingFriendRequests: (options?: { silent?: boolean }) => Promise<void>;
  loadFriendSummary: (options?: { silent?: boolean }) => Promise<void>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  setMainView: Dispatch<SetStateAction<MainView>>;
  setMessages: Dispatch<SetStateAction<import('../types/chat.types').ChatMessage[]>>;
  setMessageInput: Dispatch<SetStateAction<string>>;
  setProfileMenuOpen: Dispatch<SetStateAction<boolean>>;
  clearViewedProfile: () => void;
  setDetailsOpen: Dispatch<SetStateAction<boolean>>;
  setUserSearchQuery: Dispatch<SetStateAction<string>>;
  setUsersError: Dispatch<SetStateAction<string>>;
}

export function useConversationNavigation({
  currentUserId,
  pathname,
  navigate,
  users,
  friends,
  rooms,
  usersLoading,
  usersError,
  roomsLoading,
  canOpenDirectConversation,
  selectedUserIdRef,
  selectedRoomIdRef,
  userSearchQueryRef,
  stopTyping,
  stopRoomTyping,
  resetMessagePagination,
  clearPendingReadConversation,
  preparePendingReadConversation,
  hideRemoteTyping,
  loadMessages,
  loadRoomMessages,
  loadUsers,
  loadIncomingFriendRequests,
  loadFriendSummary,
  setSelectedUser,
  setSelectedRoom,
  setMainView,
  setMessages,
  setMessageInput,
  setProfileMenuOpen,
  clearViewedProfile,
  setDetailsOpen,
  setUserSearchQuery,
  setUsersError,
}: UseConversationNavigationOptions) {
  const navigateIfNeeded = useCallback((path: string, options: { replace?: boolean } = {}) => {
    if (pathname !== path) {
      navigate(path, options);
    }
  }, [navigate, pathname]);

  const clearSelectedConversation = useCallback(() => {
    if (selectedUserIdRef.current !== null) {
      stopTyping(selectedUserIdRef.current);
    }
    if (selectedRoomIdRef.current !== null) {
      stopRoomTyping(selectedRoomIdRef.current);
    }

    selectedUserIdRef.current = null;
    selectedRoomIdRef.current = null;
    setSelectedUser(null);
    setSelectedRoom(null);
    setMainView('chat');
    resetMessagePagination();
    clearPendingReadConversation();
    setMessages([]);
    setMessageInput('');
    setProfileMenuOpen(false);
    clearViewedProfile();
    setDetailsOpen(shouldOpenConversationDetailsByDefault());
    hideRemoteTyping();
  }, [
    clearPendingReadConversation,
    clearViewedProfile,
    hideRemoteTyping,
    resetMessagePagination,
    selectedRoomIdRef,
    selectedUserIdRef,
    setDetailsOpen,
    setMainView,
    setMessageInput,
    setMessages,
    setProfileMenuOpen,
    setSelectedRoom,
    setSelectedUser,
    stopRoomTyping,
    stopTyping,
  ]);

  const activateUserConversation = useCallback((user: User) => {
    if (!canOpenDirectConversation(user)) {
      return;
    }

    const previousSelectedUserId = selectedUserIdRef.current;
    const previousSelectedRoomId = selectedRoomIdRef.current;
    const conversationChanged = previousSelectedUserId !== user.id || previousSelectedRoomId !== null;

    if (previousSelectedUserId !== null && previousSelectedUserId !== user.id) {
      stopTyping(previousSelectedUserId);
    }
    if (previousSelectedRoomId !== null) {
      stopRoomTyping(previousSelectedRoomId);
    }

    setSelectedRoom(null);
    selectedRoomIdRef.current = null;
    setSelectedUser(user);
    selectedUserIdRef.current = user.id;
    setMainView('chat');
    setProfileMenuOpen(false);
    clearViewedProfile();
    setDetailsOpen(shouldOpenConversationDetailsByDefault());
    hideRemoteTyping();

    const unreadCount = user.unreadCount ?? 0;
    if (conversationChanged || unreadCount > 0) {
      preparePendingReadConversation('user', user.id, unreadCount);
    }
    if (conversationChanged) {
      void loadMessages(user.id);
    }
  }, [
    canOpenDirectConversation,
    clearViewedProfile,
    hideRemoteTyping,
    loadMessages,
    preparePendingReadConversation,
    selectedRoomIdRef,
    selectedUserIdRef,
    setDetailsOpen,
    setMainView,
    setProfileMenuOpen,
    setSelectedRoom,
    setSelectedUser,
    stopRoomTyping,
    stopTyping,
  ]);

  const activateRoomConversation = useCallback((room: ChatRoom) => {
    const previousSelectedUserId = selectedUserIdRef.current;
    const previousSelectedRoomId = selectedRoomIdRef.current;
    const conversationChanged = previousSelectedRoomId !== room.id || previousSelectedUserId !== null;

    if (previousSelectedUserId !== null) {
      stopTyping(previousSelectedUserId);
    }
    if (previousSelectedRoomId !== null && previousSelectedRoomId !== room.id) {
      stopRoomTyping(previousSelectedRoomId);
    }

    setSelectedUser(null);
    selectedUserIdRef.current = null;
    setSelectedRoom(room);
    selectedRoomIdRef.current = room.id;
    setMainView('chat');
    setProfileMenuOpen(false);
    clearViewedProfile();
    setDetailsOpen(shouldOpenConversationDetailsByDefault());
    hideRemoteTyping();

    const unreadCount = room.unreadCount ?? 0;
    if (conversationChanged || unreadCount > 0) {
      preparePendingReadConversation('room', room.id, unreadCount);
    }
    if (conversationChanged) {
      void loadRoomMessages(room.id);
    }
  }, [
    clearViewedProfile,
    hideRemoteTyping,
    loadRoomMessages,
    preparePendingReadConversation,
    selectedRoomIdRef,
    selectedUserIdRef,
    setDetailsOpen,
    setMainView,
    setProfileMenuOpen,
    setSelectedRoom,
    setSelectedUser,
    stopRoomTyping,
    stopTyping,
  ]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const routeStateForPath = parseChatRoute(pathname);
    if (routeStateForPath.kind === 'unknown') {
      navigate(getChatRoute(), { replace: true });
      return;
    }
    if (routeStateForPath.kind === 'chat') {
      clearSelectedConversation();
      return;
    }
    if (routeStateForPath.kind === 'friends') {
      setMainView('friends');
      setProfileMenuOpen(false);
      if (userSearchQueryRef.current) {
        userSearchQueryRef.current = '';
        setUserSearchQuery('');
        setUsersError('');
      }
      void loadUsers({ silent: true, search: '' });
      return;
    }
    if (routeStateForPath.kind === 'requests') {
      setMainView('requests');
      setProfileMenuOpen(false);
      void Promise.all([
        loadIncomingFriendRequests({ silent: true }),
        loadFriendSummary({ silent: true }),
      ]);
    }
  }, [
    clearSelectedConversation,
    currentUserId,
    loadFriendSummary,
    loadIncomingFriendRequests,
    loadUsers,
    navigate,
    pathname,
    setMainView,
    setProfileMenuOpen,
    setUserSearchQuery,
    setUsersError,
    userSearchQueryRef,
  ]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    let active = true;
    const routeStateForPath = parseChatRoute(pathname);
    const usernameMatches = (user: User, username: string) =>
      user.username.toLowerCase() === username.toLowerCase();

    if (routeStateForPath.kind === 'room') {
      const room = rooms.find((currentRoom) => currentRoom.id === routeStateForPath.roomId);
      if (room) {
        activateRoomConversation(room);
        return;
      }
      if (!roomsLoading) {
        navigate(getChatRoute(), { replace: true });
      }
      return;
    }

    if (routeStateForPath.kind !== 'user') {
      return;
    }

    const userFromLists =
      friends.find((friend) => usernameMatches(friend, routeStateForPath.username)) ??
      users.find((user) => usernameMatches(user, routeStateForPath.username));
    if (userFromLists) {
      if (canOpenDirectConversation(userFromLists)) {
        activateUserConversation(userFromLists);
      } else {
        navigate(getFriendsRoute(), { replace: true });
      }
      return;
    }

    if (usersLoading && !usersError) {
      return;
    }

    apiClient
      .get<User>(`/users/${encodeURIComponent(routeStateForPath.username)}`)
      .then((response) => {
        if (!active) return;
        if (canOpenDirectConversation(response.data)) {
          activateUserConversation(response.data);
        } else {
          navigate(getFriendsRoute(), { replace: true });
        }
      })
      .catch((error) => {
        console.error('Failed to resolve chat route user:', error);
        if (active) {
          navigate(getFriendsRoute(), { replace: true });
        }
      });

    return () => {
      active = false;
    };
  }, [
    activateRoomConversation,
    activateUserConversation,
    canOpenDirectConversation,
    currentUserId,
    friends,
    navigate,
    pathname,
    rooms,
    roomsLoading,
    users,
    usersError,
    usersLoading,
  ]);

  return {
    navigateIfNeeded,
    clearSelectedConversation,
    activateUserConversation,
    activateRoomConversation,
  };
}

export default useConversationNavigation;
