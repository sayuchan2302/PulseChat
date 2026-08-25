import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type {
  ChatRoom,
  Friendship,
  FriendshipSummary,
  UnreadCount,
  User,
} from '../types';
import type { ChatMessage, LoadOptions } from '../types/chat.types';
import { apiClient } from '../services/api';
import { getChatRoute } from '../utils/routeUtils';
import { sortRoomsByChatActivity } from '../utils/conversationUtils';
import { mergeUnreadCounts } from '../utils/userUtils';

interface UseConversationDirectoryOptions {
  userSearchQueryRef: MutableRefObject<string>;
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  canOpenDirectConversation: (user: User) => boolean;
  resetMessagePagination: () => void;
  navigate: NavigateFunction;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setFriends: Dispatch<SetStateAction<User[]>>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessageInput: Dispatch<SetStateAction<string>>;
  setIncomingFriendRequests: Dispatch<SetStateAction<Friendship[]>>;
  setFriendSummary: Dispatch<SetStateAction<FriendshipSummary>>;
  setUsersLoading: Dispatch<SetStateAction<boolean>>;
  setRoomsLoading: Dispatch<SetStateAction<boolean>>;
  setFriendRequestsLoading: Dispatch<SetStateAction<boolean>>;
  setUsersError: Dispatch<SetStateAction<string>>;
  setRoomsError: Dispatch<SetStateAction<string>>;
  setFriendRequestsError: Dispatch<SetStateAction<string>>;
}

export function useConversationDirectory({
  userSearchQueryRef,
  selectedUserIdRef,
  selectedRoomIdRef,
  canOpenDirectConversation,
  resetMessagePagination,
  navigate,
  setUsers,
  setFriends,
  setRooms,
  setSelectedUser,
  setSelectedRoom,
  setMessages,
  setMessageInput,
  setIncomingFriendRequests,
  setFriendSummary,
  setUsersLoading,
  setRoomsLoading,
  setFriendRequestsLoading,
  setUsersError,
  setRoomsError,
  setFriendRequestsError,
}: UseConversationDirectoryOptions) {
  const loadUsers = useCallback(async (options: LoadOptions = {}) => {
    const search = (options.search ?? userSearchQueryRef.current).trim();
    const isCurrentSearch = () => userSearchQueryRef.current.trim() === search;
    const usersEndpoint = search ? '/friends/search' : '/conversations';

    if (!options.silent) setUsersLoading(true);
    setUsersError('');

    try {
      const [usersResponse, unreadCountsResponse, friendsResponse] = await Promise.all([
        apiClient.get<User[]>(usersEndpoint, { params: search ? { username: search } : undefined }),
        apiClient.get<UnreadCount[]>('/messages/unread-counts'),
        search ? Promise.resolve(null) : apiClient.get<User[]>('/friends'),
      ]);
      if (!isCurrentSearch()) return;

      const nextUsers = mergeUnreadCounts(usersResponse.data, unreadCountsResponse.data);
      setUsers(nextUsers);
      if (friendsResponse) setFriends(mergeUnreadCounts(friendsResponse.data, unreadCountsResponse.data));

      const selectedUserIdForUpdate = selectedUserIdRef.current;
      if (selectedUserIdForUpdate !== null) {
        const updatedSelectedUser = nextUsers.find((user) => user.id === selectedUserIdForUpdate);
        if (updatedSelectedUser && canOpenDirectConversation(updatedSelectedUser)) {
          setSelectedUser(updatedSelectedUser);
        } else if (!search || updatedSelectedUser) {
          selectedUserIdRef.current = null;
          setSelectedUser(null);
          resetMessagePagination();
          setMessages([]);
          setMessageInput('');
        }
      }
    } catch (error) {
      console.error('Failed to load users:', error);
      if (!options.silent && isCurrentSearch()) setUsersError('Unable to load friends.');
    } finally {
      if (!options.silent && isCurrentSearch()) setUsersLoading(false);
    }
  }, [
    canOpenDirectConversation,
    resetMessagePagination,
    setFriends,
    setMessageInput,
    setMessages,
    setSelectedUser,
    setUsers,
    setUsersError,
    setUsersLoading,
    selectedUserIdRef,
    userSearchQueryRef,
  ]);

  const loadIncomingFriendRequests = useCallback(async (options: LoadOptions = {}) => {
    if (!options.silent) setFriendRequestsLoading(true);
    setFriendRequestsError('');

    try {
      const response = await apiClient.get<Friendship[]>('/friend-requests/incoming');
      setIncomingFriendRequests(response.data);
    } catch (error) {
      console.error('Failed to load friend requests:', error);
      if (!options.silent) setFriendRequestsError('Unable to load requests.');
    } finally {
      if (!options.silent) setFriendRequestsLoading(false);
    }
  }, [
    setFriendRequestsError,
    setFriendRequestsLoading,
    setIncomingFriendRequests,
  ]);

  const loadFriendSummary = useCallback(async (options: LoadOptions = {}) => {
    try {
      const response = await apiClient.get<FriendshipSummary>('/friend-requests/summary');
      setFriendSummary(response.data);
    } catch (error) {
      console.error('Failed to load friend request summary:', error);
      if (!options.silent) setFriendSummary({ incomingCount: 0, outgoingCount: 0 });
    }
  }, [setFriendSummary]);

  const loadRooms = useCallback(async (options: LoadOptions = {}) => {
    if (!options.silent) setRoomsLoading(true);
    setRoomsError('');

    try {
      const response = await apiClient.get<ChatRoom[]>('/rooms');
      const nextRooms = sortRoomsByChatActivity(response.data);
      setRooms(nextRooms);
      if (
        selectedRoomIdRef.current !== null &&
        !nextRooms.some((room) => room.id === selectedRoomIdRef.current)
      ) {
        selectedRoomIdRef.current = null;
        setSelectedRoom(null);
        setMessages([]);
        resetMessagePagination();
        navigate(getChatRoute(), { replace: true });
      } else {
        setSelectedRoom((currentSelectedRoom) =>
          currentSelectedRoom
            ? nextRooms.find((room) => room.id === currentSelectedRoom.id) ?? currentSelectedRoom
            : null,
        );
      }
    } catch (error) {
      console.error('Failed to load rooms:', error);
      if (!options.silent) setRoomsError('Unable to load groups.');
    } finally {
      if (!options.silent) setRoomsLoading(false);
    }
  }, [
    navigate,
    resetMessagePagination,
    selectedRoomIdRef,
    setMessages,
    setRooms,
    setRoomsError,
    setRoomsLoading,
    setSelectedRoom,
  ]);

  return { loadUsers, loadIncomingFriendRequests, loadFriendSummary, loadRooms };
}

export default useConversationDirectory;
