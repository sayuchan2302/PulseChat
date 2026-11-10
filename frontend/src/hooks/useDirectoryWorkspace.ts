import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { USER_SEARCH_DEBOUNCE_MS } from '../constants/chatConstants';
import type { ChatRoom, Friendship, FriendshipSummary, User } from '../types';
import type { ChatMessage, ConversationFilter } from '../types/chat.types';
import { buildSidebarConversationItems, hasPrivateConversation } from '../utils/conversationUtils';
import { matchesFriendSearch } from '../utils/userUtils';
import { useConversationDirectory } from './useConversationDirectory';

interface UseDirectoryWorkspaceOptions {
  currentUserId: number | null;
  selectedUser: User | null;
  selectedUserId: number | null;
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  canOpenDirectConversation: (user: User) => boolean;
  resetMessagePagination: () => void;
  navigate: NavigateFunction;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessageInput: Dispatch<SetStateAction<string>>;
}

export function useDirectoryWorkspace({
  currentUserId,
  selectedUser,
  selectedUserId,
  selectedUserIdRef,
  selectedRoomIdRef,
  canOpenDirectConversation,
  resetMessagePagination,
  navigate,
  setSelectedUser,
  setSelectedRoom,
  setMessages,
  setMessageInput,
}: UseDirectoryWorkspaceOptions) {
  const [users, setUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [friendRequestsLoading, setFriendRequestsLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [roomsError, setRoomsError] = useState('');
  const [friendRequestsError, setFriendRequestsError] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>('all');
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<Friendship[]>([]);
  const [friendSummary, setFriendSummary] = useState<FriendshipSummary>({
    incomingCount: 0,
    outgoingCount: 0,
  });
  const [friendActionKeys, setFriendActionKeys] = useState<string[]>([]);

  const selectedMessageRequestStateRef = useRef<{ userId: number; isRequest: boolean } | null>(null);
  const usersRef = useRef<User[]>([]);
  const friendsRef = useRef<User[]>([]);
  const roomsRef = useRef<ChatRoom[]>([]);
  const userSearchQueryRef = useRef('');
  const hasLoadedInitialUsersRef = useRef(false);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  const {
    loadUsers,
    loadIncomingFriendRequests,
    loadFriendSummary,
    loadRooms,
  } = useConversationDirectory({
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
  });

  const selectedUserMessageRequest = selectedUser?.messageRequest;

  useEffect(() => {
    const previousState = selectedMessageRequestStateRef.current;
    if (
      conversationFilter === 'requests' &&
      selectedUserMessageRequest === false &&
      previousState?.userId === selectedUserId &&
      previousState.isRequest
    ) {
      setConversationFilter('all');
    }
    selectedMessageRequestStateRef.current = selectedUserId
      ? { userId: selectedUserId, isRequest: Boolean(selectedUserMessageRequest) }
      : null;
  }, [conversationFilter, selectedUserId, selectedUserMessageRequest]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    userSearchQueryRef.current = userSearchQuery;
    const isInitialLoad = !hasLoadedInitialUsersRef.current;
    const timeout = setTimeout(() => {
      hasLoadedInitialUsersRef.current = true;
      void loadUsers({ search: userSearchQuery });
    }, isInitialLoad ? 0 : USER_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [currentUserId, loadUsers, userSearchQuery]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    void loadRooms();
  }, [currentUserId, loadRooms]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    void loadIncomingFriendRequests();
    void loadFriendSummary();
  }, [currentUserId, loadFriendSummary, loadIncomingFriendRequests]);

  const handleUserSearchChange = (value: string) => {
    userSearchQueryRef.current = value;
    setUserSearchQuery(value);
    setUsersError('');
  };

  const handleClearUserSearch = () => {
    userSearchQueryRef.current = '';
    setUserSearchQuery('');
    setUsersError('');
  };

  const handleFriendSearchChange = (value: string) => {
    setFriendSearchQuery(value);
  };

  const handleClearFriendSearch = () => {
    setFriendSearchQuery('');
  };

  const mutedPrivateConversationUserIds = useMemo(
    () =>
      Array.from(
        new Set(
          [...users, ...friends]
            .filter((user) => user.muted)
            .map((user) => user.id)
        )
      ),
    [friends, users]
  );

  const normalizedUserSearchQuery = userSearchQuery.trim();
  const normalizedFriendSearchQuery = friendSearchQuery.trim();
  const hasUserSearch = Boolean(normalizedUserSearchQuery);

  const conversationUsers = useMemo(
    () => users.filter(hasPrivateConversation),
    [users]
  );

  const sidebarConversationItems = useMemo(
    () =>
      buildSidebarConversationItems(
        conversationUsers,
        rooms,
        conversationFilter
      ),
    [conversationFilter, conversationUsers, rooms]
  );

  const filteredFriends = useMemo(
    () =>
      friends.filter((friend) =>
        matchesFriendSearch(friend, normalizedFriendSearchQuery)
      ),
    [friends, normalizedFriendSearchQuery]
  );

  const friendRequestBadgeCount = friendSummary.incomingCount;
  const usersEmptyMessage = normalizedUserSearchQuery
    ? `No username matches "${normalizedUserSearchQuery}".`
    : 'No friends yet. Search username to add friends.';
  const sidebarBusy = hasUserSearch ? usersLoading : usersLoading || roomsLoading;

  return {
    users,
    setUsers,
    friends,
    setFriends,
    rooms,
    setRooms,
    usersLoading,
    roomsLoading,
    friendRequestsLoading,
    usersError,
    setUsersError,
    roomsError,
    friendRequestsError,
    setFriendRequestsError,
    userSearchQuery,
    setUserSearchQuery,
    friendSearchQuery,
    conversationFilter,
    setConversationFilter,
    incomingFriendRequests,
    friendActionKeys,
    setFriendActionKeys,
    usersRef,
    friendsRef,
    roomsRef,
    userSearchQueryRef,
    loadUsers,
    loadIncomingFriendRequests,
    loadFriendSummary,
    loadRooms,
    handleUserSearchChange,
    handleClearUserSearch,
    handleFriendSearchChange,
    handleClearFriendSearch,
    mutedPrivateConversationUserIds,
    hasUserSearch,
    sidebarConversationItems,
    filteredFriends,
    friendRequestBadgeCount,
    usersEmptyMessage,
    sidebarBusy,
  };
}

