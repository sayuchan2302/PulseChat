import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  ChatRoom,
  ConnectionStatus,
  Message,
  PresenceEvent,
  ReadReceiptEvent,
  TypingEvent,
  UnreadCount,
  User,
} from '../types';
import { apiClient } from '../services/api';
import { wsService } from '../services/websocket';
import './ChatPage.css';

const PRIVATE_MESSAGE_DESTINATION = '/app/chat.send';
const GROUP_MESSAGE_DESTINATION_PREFIX = '/app/rooms';
const TYPING_DESTINATION = '/app/chat.typing';
const READ_RECEIPT_DESTINATION = '/app/chat.read';
const STOP_TYPING_DELAY_MS = 1500;
const USER_SEARCH_DEBOUNCE_MS = 300;
const REMOTE_TYPING_VISIBLE_MS = 2500;
const OPTIMISTIC_SEND_TIMEOUT_MS = 10000;
const USER_SKELETON_KEYS = ['user-skeleton-1', 'user-skeleton-2', 'user-skeleton-3'];
const MESSAGE_SKELETON_KEYS = [
  'message-skeleton-1',
  'message-skeleton-2',
  'message-skeleton-3',
  'message-skeleton-4',
];

type DeliveryStatus = 'sending' | 'sent' | 'failed';

type ChatMessage = Message & {
  deliveryStatus?: DeliveryStatus;
};

type SendMessagePayload = {
  receiverId: number;
  content: string;
  clientId: string;
};

type SendRoomMessagePayload = {
  content: string;
  clientId: string;
};

type LoadOptions = {
  silent?: boolean;
  search?: string;
};

type SidebarTab = 'users' | 'groups';

function toDeliveredMessage(message: Message): ChatMessage {
  return {
    ...message,
    deliveryStatus: 'sent',
  };
}

function appendOrReconcileMessage(messages: ChatMessage[], incomingMessage: Message) {
  const deliveredMessage = toDeliveredMessage(incomingMessage);
  const existingMessageIndex = messages.findIndex((message) => message.id === incomingMessage.id);

  if (existingMessageIndex >= 0) {
    return messages.map((message, index) =>
      index === existingMessageIndex ? { ...message, ...deliveredMessage } : message
    );
  }

  if (incomingMessage.clientId) {
    const optimisticMessageIndex = messages.findIndex(
      (message) => message.clientId === incomingMessage.clientId
    );

    if (optimisticMessageIndex >= 0) {
      return messages.map((message, index) =>
        index === optimisticMessageIndex ? deliveredMessage : message
      );
    }
  }

  return [...messages, deliveredMessage];
}

function appendOptimisticMessage(messages: ChatMessage[], optimisticMessage: ChatMessage) {
  const alreadyExists = messages.some((message) => message.clientId === optimisticMessage.clientId);
  return alreadyExists ? messages : [...messages, optimisticMessage];
}

function appendOrUpdateRoom(rooms: ChatRoom[], incomingRoom: ChatRoom) {
  const existingRoom = rooms.some((room) => room.id === incomingRoom.id);
  return existingRoom
    ? rooms.map((room) => (room.id === incomingRoom.id ? incomingRoom : room))
    : [incomingRoom, ...rooms];
}

function mergeServerMessagesWithPending(
  currentMessages: ChatMessage[],
  serverMessages: Message[]
) {
  const deliveredMessages = serverMessages.map(toDeliveredMessage);
  const deliveredClientIds = new Set(
    deliveredMessages
      .map((message) => message.clientId)
      .filter((clientId): clientId is string => Boolean(clientId))
  );
  const pendingMessages = currentMessages.filter(
    (message) =>
      message.id < 0 &&
      message.clientId &&
      !deliveredClientIds.has(message.clientId) &&
      (message.deliveryStatus === 'sending' || message.deliveryStatus === 'failed')
  );

  return [...deliveredMessages, ...pendingMessages];
}

function isConversationMessage(
  message: Message,
  currentUserId: number | null,
  selectedUserId: number | null
) {
  if (currentUserId === null || selectedUserId === null) {
    return false;
  }

  return (
    (message.senderId === currentUserId && message.receiverId === selectedUserId) ||
    (message.senderId === selectedUserId && message.receiverId === currentUserId)
  );
}

function isActiveConversationMessage(
  message: Message,
  currentUserId: number | null,
  selectedUserId: number | null,
  selectedRoomId: number | null
) {
  if (message.chatRoomId) {
    return selectedRoomId === message.chatRoomId;
  }

  return isConversationMessage(message, currentUserId, selectedUserId);
}

function applyPresenceToUser(user: User, presence: PresenceEvent) {
  return user.id === presence.userId ? { ...user, online: presence.online } : user;
}

function isTypingFromSelectedUser(typing: TypingEvent, selectedUserId: number | null) {
  return selectedUserId !== null && typing.senderId === selectedUserId;
}

function mergeUnreadCounts(users: User[], unreadCounts: UnreadCount[]) {
  const unreadCountByUserId = new Map(
    unreadCounts.map((unreadCount) => [unreadCount.userId, unreadCount.unreadCount])
  );

  return users.map((user) => ({
    ...user,
    unreadCount: unreadCountByUserId.get(user.id) ?? 0,
  }));
}

function incrementUnreadCount(users: User[], senderId: number) {
  return users.map((user) =>
    user.id === senderId ? { ...user, unreadCount: (user.unreadCount ?? 0) + 1 } : user
  );
}

function resetUnreadCount(users: User[], userId: number) {
  return users.map((user) => (user.id === userId ? { ...user, unreadCount: 0 } : user));
}

function applyReadReceipt(messages: ChatMessage[], receipt: ReadReceiptEvent) {
  return messages.map((message) =>
    message.id > 0 && message.senderId === receipt.senderId && message.receiverId === receipt.readerId
      ? { ...message, read: true, deliveryStatus: 'sent' as const }
      : message
  );
}

function createClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createOptimisticMessage(
  tempId: number,
  senderId: number,
  receiverId: number,
  content: string,
  clientId: string
): ChatMessage {
  return {
    id: tempId,
    content,
    senderId,
    receiverId,
    timestamp: new Date().toISOString(),
    read: false,
    clientId,
    deliveryStatus: 'sending',
  };
}

function createOptimisticRoomMessage(
  tempId: number,
  sender: User,
  chatRoomId: number,
  content: string,
  clientId: string
): ChatMessage {
  return {
    id: tempId,
    content,
    senderId: sender.id,
    senderUsername: sender.username,
    senderFullName: getUserDisplayName(sender),
    receiverId: null,
    chatRoomId,
    timestamp: new Date().toISOString(),
    read: false,
    clientId,
    deliveryStatus: 'sending',
  };
}

function markOptimisticMessageSending(messages: ChatMessage[], clientId: string) {
  return messages.map((message) =>
    message.clientId === clientId ? { ...message, deliveryStatus: 'sending' as const } : message
  );
}

function markOptimisticMessageFailed(messages: ChatMessage[], clientId: string) {
  return messages.map((message) =>
    message.clientId === clientId && message.deliveryStatus === 'sending'
      ? { ...message, deliveryStatus: 'failed' as const }
      : message
  );
}

function getDeliveryStatusLabel(message: ChatMessage) {
  if (message.deliveryStatus === 'sending') {
    return 'Sending';
  }

  if (message.deliveryStatus === 'failed') {
    return 'Failed';
  }

  return message.read ? 'Read' : 'Sent';
}

function getBrowserAwareConnectionStatus(status: ConnectionStatus): ConnectionStatus {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'offline';
  }

  return status;
}

function getUserDisplayName(user: User | null) {
  return user?.fullName?.trim() || user?.username || '';
}

function getUserInitial(user: User) {
  return getUserDisplayName(user).charAt(0).toUpperCase();
}

function shouldShowUsername(user: User) {
  return getUserDisplayName(user) !== user.username;
}

function getRoomInitial(room: ChatRoom) {
  return room.name.trim().charAt(0).toUpperCase();
}

function getRoomMemberSummary(room: ChatRoom, currentUserId?: number | null) {
  const otherMembers = room.participants.filter((participant) => participant.id !== currentUserId);
  const visibleNames = otherMembers.slice(0, 2).map(getUserDisplayName);
  const remainingCount = otherMembers.length - visibleNames.length;

  if (visibleNames.length === 0) {
    return 'Only you';
  }

  return remainingCount > 0
    ? `${visibleNames.join(', ')} +${remainingCount}`
    : visibleNames.join(', ');
}

function getMessageSenderName(message: ChatMessage, selectedRoom: ChatRoom | null) {
  if (message.senderFullName?.trim()) {
    return message.senderFullName;
  }

  const participant = selectedRoom?.participants.find((user) => user.id === message.senderId);
  return participant ? getUserDisplayName(participant) : message.senderUsername ?? 'Unknown';
}

export default function ChatPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [typingUserId, setTypingUserId] = useState<number | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [roomsError, setRoomsError] = useState('');
  const [messagesError, setMessagesError] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('users');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<number[]>([]);
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupError, setGroupError] = useState('');
  const currentUserIdRef = useRef<number | null>(null);
  const selectedUserIdRef = useRef<number | null>(null);
  const selectedRoomIdRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const userSearchQueryRef = useRef('');
  const optimisticMessageIdRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const hasLoadedInitialUsersRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const selectedUserId = selectedUser?.id ?? null;
  const selectedRoomId = selectedRoom?.id ?? null;

  const scrollToLatestMessage = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({
      behavior,
      block: 'end',
    });
  }, []);

  const getNextOptimisticMessageId = () => {
    optimisticMessageIdRef.current -= 1;
    return optimisticMessageIdRef.current;
  };

  const loadUsers = useCallback(async (options: LoadOptions = {}) => {
    const search = (options.search ?? userSearchQueryRef.current).trim();
    const isCurrentSearch = () => userSearchQueryRef.current.trim() === search;

    if (!options.silent) {
      setUsersLoading(true);
    }
    setUsersError('');

    try {
      const [usersResponse, unreadCountsResponse] = await Promise.all([
        apiClient.get<User[]>('/users', {
          params: search ? { username: search } : undefined,
        }),
        apiClient.get<UnreadCount[]>('/messages/unread-counts'),
      ]);
      if (!isCurrentSearch()) {
        return;
      }

      const nextUsers = mergeUnreadCounts(usersResponse.data, unreadCountsResponse.data);
      setUsers(nextUsers);
      setSelectedUser((currentSelectedUser) =>
        currentSelectedUser
          ? nextUsers.find((user) => user.id === currentSelectedUser.id) ?? currentSelectedUser
          : null
      );
    } catch (error) {
      console.error('Failed to load users:', error);
      if (!options.silent && isCurrentSearch()) {
        setUsersError('Unable to load users.');
      }
    } finally {
      if (!options.silent && isCurrentSearch()) {
        setUsersLoading(false);
      }
    }
  }, []);

  const loadRooms = useCallback(async (options: LoadOptions = {}) => {
    if (!options.silent) {
      setRoomsLoading(true);
    }
    setRoomsError('');

    try {
      const response = await apiClient.get<ChatRoom[]>('/rooms');
      setRooms(response.data);
      setSelectedRoom((currentSelectedRoom) =>
        currentSelectedRoom
          ? response.data.find((room) => room.id === currentSelectedRoom.id) ?? currentSelectedRoom
          : null
      );
    } catch (error) {
      console.error('Failed to load rooms:', error);
      if (!options.silent) {
        setRoomsError('Unable to load groups.');
      }
    } finally {
      if (!options.silent) {
        setRoomsLoading(false);
      }
    }
  }, []);

  const loadMessages = useCallback(async (userId: number, options: LoadOptions = {}) => {
    if (!options.silent) {
      setMessages([]);
      setMessagesLoading(true);
    }
    setMessagesError('');

    try {
      const response = await apiClient.get<Message[]>(`/messages/${userId}`);
      if (selectedUserIdRef.current === userId) {
        setMessages((currentMessages) =>
          mergeServerMessagesWithPending(currentMessages, response.data)
        );
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      if (!options.silent && selectedUserIdRef.current === userId) {
        setMessagesError('Unable to load messages.');
      }
    } finally {
      if (!options.silent && selectedUserIdRef.current === userId) {
        setMessagesLoading(false);
      }
    }
  }, []);

  const loadRoomMessages = useCallback(async (roomId: number, options: LoadOptions = {}) => {
    if (!options.silent) {
      setMessages([]);
      setMessagesLoading(true);
    }
    setMessagesError('');

    try {
      const response = await apiClient.get<Message[]>(`/rooms/${roomId}/messages`);
      if (selectedRoomIdRef.current === roomId) {
        setMessages((currentMessages) =>
          mergeServerMessagesWithPending(currentMessages, response.data)
        );
      }
    } catch (error) {
      console.error('Failed to load room messages:', error);
      if (!options.silent && selectedRoomIdRef.current === roomId) {
        setMessagesError('Unable to load group messages.');
      }
    } finally {
      if (!options.silent && selectedRoomIdRef.current === roomId) {
        setMessagesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      navigate('/');
      return;
    }

    try {
      const parsedUser = JSON.parse(user) as User;
      setCurrentUser({ ...parsedUser, online: false });
      currentUserIdRef.current = parsedUser.id;
    } catch (error) {
      console.error('Failed to read current user:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/');
    }
  }, [navigate]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    userSearchQueryRef.current = userSearchQuery;
    const isInitialLoad = !hasLoadedInitialUsersRef.current;
    const timeout = setTimeout(() => {
      hasLoadedInitialUsersRef.current = true;
      void loadUsers({ search: userSearchQuery });
    }, isInitialLoad ? 0 : USER_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [currentUser?.id, loadUsers, userSearchQuery]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    void loadRooms();
  }, [currentUser?.id, loadRooms]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    currentUserIdRef.current = currentUser.id;
    let active = true;

    wsService
      .connect(
        (incomingMessage) => {
          if (!active) {
            return;
          }

          setMessages((currentMessages) => {
            if (
              !isActiveConversationMessage(
                incomingMessage,
                currentUserIdRef.current,
                selectedUserIdRef.current,
                selectedRoomIdRef.current
              )
            ) {
              return currentMessages;
            }

            return appendOrReconcileMessage(currentMessages, incomingMessage);
          });

          if (incomingMessage.clientId) {
            clearOptimisticSendTimeout(incomingMessage.clientId);
          }

          if (incomingMessage.chatRoomId) {
            return;
          }

          if (
            incomingMessage.senderId !== currentUserIdRef.current &&
            incomingMessage.senderId === selectedUserIdRef.current
          ) {
            markConversationAsRead(incomingMessage.senderId);
            return;
          }

          if (incomingMessage.senderId !== currentUserIdRef.current) {
            setUsers((currentUsers) => incrementUnreadCount(currentUsers, incomingMessage.senderId));
          }
        },
        (presence) => {
          if (!active) {
            return;
          }

          setUsers((currentUsers) =>
            currentUsers.map((user) => applyPresenceToUser(user, presence))
          );
          setSelectedUser((currentSelectedUser) =>
            currentSelectedUser ? applyPresenceToUser(currentSelectedUser, presence) : null
          );
          if (presence.userId === currentUserIdRef.current) {
            setCurrentUser((currentAccount) =>
              currentAccount ? applyPresenceToUser(currentAccount, presence) : null
            );
          }
        },
        (typing) => {
          if (!active || !isTypingFromSelectedUser(typing, selectedUserIdRef.current)) {
            return;
          }

          if (typing.typing) {
            showRemoteTyping(typing.senderId);
          } else {
            hideRemoteTyping();
          }
        },
        (receipt) => {
          if (!active) {
            return;
          }

          setMessages((currentMessages) => applyReadReceipt(currentMessages, receipt));
          if (receipt.readerId === currentUserIdRef.current) {
            setUsers((currentUsers) => resetUnreadCount(currentUsers, receipt.senderId));
          }
        },
        (status) => {
          if (!active) {
            return;
          }

          const browserAwareStatus = getBrowserAwareConnectionStatus(status);
          const isOnline = browserAwareStatus === 'connected';
          setCurrentUser((currentAccount) =>
            currentAccount ? { ...currentAccount, online: isOnline } : null
          );

          if (!isOnline) {
            return;
          }

          if (!hasConnectedRef.current) {
            hasConnectedRef.current = true;
            return;
          }

          const selectedUserIdForResync = selectedUserIdRef.current;
          const selectedRoomIdForResync = selectedRoomIdRef.current;
          Promise.all([
            loadUsers({ silent: true }),
            loadRooms({ silent: true }),
            selectedUserIdForResync !== null
              ? loadMessages(selectedUserIdForResync, { silent: true })
            : selectedRoomIdForResync !== null
              ? loadRoomMessages(selectedRoomIdForResync, { silent: true })
              : Promise.resolve(),
          ])
            .then(() => {
              if (
                selectedUserIdForResync !== null &&
                selectedUserIdRef.current === selectedUserIdForResync
              ) {
                void markConversationAsRead(selectedUserIdForResync);
              }
            })
            .catch((error) => {
              console.error('Failed to resync chat state:', error);
            });
        },
        (room) => {
          if (!active) {
            return;
          }

          setRooms((currentRooms) => appendOrUpdateRoom(currentRooms, room));
          setSelectedRoom((currentSelectedRoom) =>
            currentSelectedRoom?.id === room.id ? room : currentSelectedRoom
          );
        }
      )
      .catch((error) => {
        console.error('Failed to connect WebSocket:', error);
      });

    return () => {
      active = false;
      hasConnectedRef.current = false;
      clearTypingTimeout();
      clearRemoteTypingTimeout();
      clearOptimisticSendTimeouts();
      wsService.disconnect();
    };
  }, [currentUser?.id, loadMessages, loadRoomMessages, loadRooms, loadUsers]);

  useEffect(() => {
    if ((selectedUserId === null && selectedRoomId === null) || messagesLoading) {
      return;
    }

    scrollToLatestMessage('smooth');
  }, [
    messages.length,
    messagesLoading,
    scrollToLatestMessage,
    selectedRoomId,
    selectedUserId,
    typingUserId,
  ]);

  const clearTypingTimeout = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  const clearRemoteTypingTimeout = () => {
    if (remoteTypingTimeoutRef.current) {
      clearTimeout(remoteTypingTimeoutRef.current);
      remoteTypingTimeoutRef.current = null;
    }
  };

  const clearOptimisticSendTimeout = (clientId: string) => {
    const timeout = sendTimeoutsRef.current.get(clientId);
    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    sendTimeoutsRef.current.delete(clientId);
  };

  const clearOptimisticSendTimeouts = () => {
    sendTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    sendTimeoutsRef.current.clear();
  };

  const scheduleOptimisticSendTimeout = (clientId: string) => {
    clearOptimisticSendTimeout(clientId);

    const timeout = setTimeout(() => {
      sendTimeoutsRef.current.delete(clientId);
      setMessages((currentMessages) => markOptimisticMessageFailed(currentMessages, clientId));
    }, OPTIMISTIC_SEND_TIMEOUT_MS);

    sendTimeoutsRef.current.set(clientId, timeout);
  };

  const showRemoteTyping = (senderId: number) => {
    setTypingUserId(senderId);
    clearRemoteTypingTimeout();
    remoteTypingTimeoutRef.current = setTimeout(() => {
      setTypingUserId(null);
      remoteTypingTimeoutRef.current = null;
    }, REMOTE_TYPING_VISIBLE_MS);
  };

  const hideRemoteTyping = () => {
    clearRemoteTypingTimeout();
    setTypingUserId(null);
  };

  const publishTyping = (receiverId: number, typing: boolean) => {
    wsService.sendMessage(TYPING_DESTINATION, {
      receiverId,
      typing,
    });
  };

  const stopTyping = (receiverId: number) => {
    clearTypingTimeout();
    publishTyping(receiverId, false);
  };

  const sendOptimisticMessage = async (payload: SendMessagePayload) => {
    const sentRealtime = wsService.sendMessage(PRIVATE_MESSAGE_DESTINATION, payload);
    if (sentRealtime) {
      scheduleOptimisticSendTimeout(payload.clientId);
      return;
    }

    try {
      const response = await apiClient.post<Message>('/messages', payload);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((currentMessages) => appendOrReconcileMessage(currentMessages, response.data));
    } catch (error) {
      console.error('Failed to send message:', error);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((currentMessages) => markOptimisticMessageFailed(currentMessages, payload.clientId));
    }
  };

  const sendOptimisticRoomMessage = async (roomId: number, payload: SendRoomMessagePayload) => {
    const sentRealtime = wsService.sendMessage(
      `${GROUP_MESSAGE_DESTINATION_PREFIX}/${roomId}/send`,
      payload
    );
    if (sentRealtime) {
      scheduleOptimisticSendTimeout(payload.clientId);
      return;
    }

    try {
      const response = await apiClient.post<Message>(`/rooms/${roomId}/messages`, payload);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((currentMessages) => appendOrReconcileMessage(currentMessages, response.data));
    } catch (error) {
      console.error('Failed to send group message:', error);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((currentMessages) => markOptimisticMessageFailed(currentMessages, payload.clientId));
    }
  };

  const markConversationAsRead = async (senderId: number) => {
    setUsers((currentUsers) => resetUnreadCount(currentUsers, senderId));

    const sentRealtime = wsService.sendMessage(READ_RECEIPT_DESTINATION, {
      senderId,
    });

    if (!sentRealtime) {
      try {
        const response = await apiClient.patch<ReadReceiptEvent>(`/messages/${senderId}/read`);
        setMessages((currentMessages) => applyReadReceipt(currentMessages, response.data));
      } catch (error) {
        console.error('Failed to mark conversation as read:', error);
      }
    }
  };

  const handleUserSelect = (user: User) => {
    if (selectedUserIdRef.current !== null) {
      stopTyping(selectedUserIdRef.current);
    }

    setSelectedRoom(null);
    selectedRoomIdRef.current = null;
    setSelectedUser(user);
    selectedUserIdRef.current = user.id;
    hideRemoteTyping();
    void loadMessages(user.id);
    void markConversationAsRead(user.id);
  };

  const handleRoomSelect = (room: ChatRoom) => {
    if (selectedUserIdRef.current !== null) {
      stopTyping(selectedUserIdRef.current);
    }

    setSelectedUser(null);
    selectedUserIdRef.current = null;
    setSelectedRoom(room);
    selectedRoomIdRef.current = room.id;
    hideRemoteTyping();
    void loadRoomMessages(room.id);
  };

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

  const handleOpenCreateGroup = () => {
    setSidebarTab('groups');
    setCreateGroupOpen(true);
    setGroupError('');
  };

  const handleCloseCreateGroup = () => {
    if (groupCreating) {
      return;
    }

    setCreateGroupOpen(false);
    setGroupName('');
    setSelectedGroupMemberIds([]);
    setGroupError('');
  };

  const handleToggleGroupMember = (userId: number) => {
    setSelectedGroupMemberIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((currentId) => currentId !== userId)
        : [...currentIds, userId]
    );
  };

  const handleCreateGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name || selectedGroupMemberIds.length === 0) {
      return;
    }

    setGroupCreating(true);
    setGroupError('');

    try {
      const response = await apiClient.post<ChatRoom>('/rooms', {
        name,
        participantIds: selectedGroupMemberIds,
      });
      const room = response.data;
      if (selectedUserIdRef.current !== null) {
        stopTyping(selectedUserIdRef.current);
      }
      setRooms((currentRooms) => appendOrUpdateRoom(currentRooms, room));
      setSelectedUser(null);
      selectedUserIdRef.current = null;
      setSelectedRoom(room);
      selectedRoomIdRef.current = room.id;
      setMessages([]);
      setMessageInput('');
      setCreateGroupOpen(false);
      setGroupName('');
      setSelectedGroupMemberIds([]);
    } catch (error) {
      console.error('Failed to create group:', error);
      setGroupError('Unable to create group.');
    } finally {
      setGroupCreating(false);
    }
  };

  const handleMessageInputChange = (value: string) => {
    setMessageInput(value);
    if (!selectedUser) {
      return;
    }

    if (!value.trim()) {
      stopTyping(selectedUser.id);
      return;
    }

    publishTyping(selectedUser.id, true);
    clearTypingTimeout();
    typingTimeoutRef.current = setTimeout(() => {
      publishTyping(selectedUser.id, false);
      typingTimeoutRef.current = null;
    }, STOP_TYPING_DELAY_MS);
  };

  const handleMessageInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = messageInput.trim();
    if (!content || !currentUser || (!selectedUser && !selectedRoom)) return;

    const clientId = createClientId();
    setMessagesError('');
    setMessageInput('');

    if (selectedUser) {
      const optimisticMessage = createOptimisticMessage(
        getNextOptimisticMessageId(),
        currentUser.id,
        selectedUser.id,
        content,
        clientId
      );
      const payload = {
        receiverId: selectedUser.id,
        content,
        clientId,
      };

      stopTyping(selectedUser.id);
      setMessages((currentMessages) => appendOptimisticMessage(currentMessages, optimisticMessage));
      void sendOptimisticMessage(payload);
      return;
    }

    if (selectedRoom) {
      const optimisticMessage = createOptimisticRoomMessage(
        getNextOptimisticMessageId(),
        currentUser,
        selectedRoom.id,
        content,
        clientId
      );
      const payload = {
        content,
        clientId,
      };

      setMessages((currentMessages) => appendOptimisticMessage(currentMessages, optimisticMessage));
      void sendOptimisticRoomMessage(selectedRoom.id, payload);
    }
  };

  const handleRetryMessage = (message: ChatMessage) => {
    const clientId = message.clientId;
    if (!clientId) {
      return;
    }

    if (message.chatRoomId) {
      const payload = {
        content: message.content,
        clientId,
      };

      setMessages((currentMessages) => markOptimisticMessageSending(currentMessages, clientId));
      void sendOptimisticRoomMessage(message.chatRoomId, payload);
      return;
    }

    if (!message.receiverId) {
      return;
    }

    const payload = {
      receiverId: message.receiverId,
      content: message.content,
      clientId,
    };

    setMessages((currentMessages) => markOptimisticMessageSending(currentMessages, clientId));
    void sendOptimisticMessage(payload);
  };

  const handleLogout = () => {
    if (selectedUserIdRef.current !== null) {
      stopTyping(selectedUserIdRef.current);
    }

    wsService.disconnect();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const currentUserDisplayName = getUserDisplayName(currentUser);
  const currentUserOnline = Boolean(currentUser?.online);
  const normalizedUserSearchQuery = userSearchQuery.trim();
  const usersEmptyMessage = normalizedUserSearchQuery
    ? `No username matches "${normalizedUserSearchQuery}".`
    : 'No users available.';
  const selectedConversationName = selectedRoom
    ? selectedRoom.name
    : selectedUser
      ? getUserDisplayName(selectedUser)
      : '';
  const selectedConversationOpen = Boolean(selectedUser || selectedRoom);
  const canCreateGroup = Boolean(groupName.trim()) && selectedGroupMemberIds.length > 0 && !groupCreating;

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div className="header-left">
          <h2>💬 Chat App</h2>
        </div>
        <div className="header-right">
          <span
            className={`account-status ${currentUserOnline ? 'online' : 'offline'}`}
            aria-live="polite"
            title={currentUserOnline ? 'Online' : 'Offline'}
          >
            <span className="account-status-dot" aria-hidden="true" />
            {currentUserOnline ? 'Online' : 'Offline'}
          </span>
          <span className="account-name" title={currentUser?.username}>
            {currentUserDisplayName}
          </span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </header>

      <div className="chat-container">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-title-row">
              <h3>Chats</h3>
              <button type="button" className="new-group-btn" onClick={handleOpenCreateGroup}>
                New group
              </button>
            </div>
            <div className="sidebar-tabs" role="tablist" aria-label="Chat sections">
              <button
                type="button"
                className={`sidebar-tab ${sidebarTab === 'users' ? 'active' : ''}`}
                onClick={() => setSidebarTab('users')}
                role="tab"
                aria-selected={sidebarTab === 'users'}
              >
                Users
              </button>
              <button
                type="button"
                className={`sidebar-tab ${sidebarTab === 'groups' ? 'active' : ''}`}
                onClick={() => setSidebarTab('groups')}
                role="tab"
                aria-selected={sidebarTab === 'groups'}
              >
                Groups
              </button>
            </div>
            {sidebarTab === 'users' ? (
              <div className="user-search" role="search">
                <input
                  type="search"
                  value={userSearchQuery}
                  onChange={(event) => handleUserSearchChange(event.target.value)}
                  className="user-search-input"
                  placeholder="Search username"
                  aria-label="Search users by username"
                  autoComplete="off"
                  spellCheck={false}
                />
                {userSearchQuery ? (
                  <button
                    type="button"
                    className="user-search-clear"
                    onClick={handleClearUserSearch}
                    aria-label="Clear user search"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="user-list" aria-busy={sidebarTab === 'users' ? usersLoading : roomsLoading}>
            {sidebarTab === 'users' ? (
              usersLoading ? (
                USER_SKELETON_KEYS.map((key) => (
                  <div key={key} className="user-item user-item-skeleton" aria-hidden="true">
                    <div className="skeleton-avatar" />
                    <div className="skeleton-user-info">
                      <div className="skeleton-line name" />
                      <div className="skeleton-line status" />
                    </div>
                  </div>
                ))
              ) : usersError ? (
                <div className="list-state error-state">
                  <span>{usersError}</span>
                  <button
                    type="button"
                    className="retry-btn"
                    onClick={() => void loadUsers({ search: userSearchQuery })}
                  >
                    Retry
                  </button>
                </div>
              ) : users.length === 0 ? (
                <div className="list-state">{usersEmptyMessage}</div>
              ) : (
                users.map((user) => (
                  <button
                    type="button"
                    key={user.id}
                    className={`user-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                    onClick={() => handleUserSelect(user)}
                  >
                    <div className="user-avatar">
                      {getUserInitial(user)}
                    </div>
                    <div className="user-info">
                      <div className="user-name">{getUserDisplayName(user)}</div>
                      <div className="user-meta">
                        <span className={`user-status ${user.online ? 'online' : 'offline'}`}>
                          {user.online ? 'Online' : 'Offline'}
                        </span>
                        {shouldShowUsername(user) ? (
                          <span className="user-username">@{user.username}</span>
                        ) : null}
                      </div>
                    </div>
                    {(user.unreadCount ?? 0) > 0 ? (
                      <div className="unread-badge">{user.unreadCount}</div>
                    ) : null}
                  </button>
                ))
              )
            ) : roomsLoading ? (
              USER_SKELETON_KEYS.map((key) => (
                <div key={key} className="user-item user-item-skeleton" aria-hidden="true">
                  <div className="skeleton-avatar" />
                  <div className="skeleton-user-info">
                    <div className="skeleton-line name" />
                    <div className="skeleton-line status" />
                  </div>
                </div>
              ))
            ) : roomsError ? (
              <div className="list-state error-state">
                <span>{roomsError}</span>
                <button type="button" className="retry-btn" onClick={() => void loadRooms()}>
                  Retry
                </button>
              </div>
            ) : rooms.length === 0 ? (
              <div className="list-state empty-groups-state">
                <span>No groups yet.</span>
                <button type="button" className="retry-btn" onClick={handleOpenCreateGroup}>
                  Create group
                </button>
              </div>
            ) : (
              rooms.map((room) => (
                <button
                  type="button"
                  key={room.id}
                  className={`user-item room-item ${selectedRoom?.id === room.id ? 'active' : ''}`}
                  onClick={() => handleRoomSelect(room)}
                >
                  <div className="user-avatar room-avatar">
                    {getRoomInitial(room)}
                  </div>
                  <div className="user-info">
                    <div className="user-name">{room.name}</div>
                    <div className="user-meta">
                      <span className="user-status">{room.participants.length} members</span>
                      <span className="user-username">
                        {getRoomMemberSummary(room, currentUser?.id)}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="chat-area">
          {selectedConversationOpen ? (
            <>
              <div className="chat-area-header">
                <div className="selected-user">
                  <div className="user-avatar">
                    {selectedRoom ? getRoomInitial(selectedRoom) : getUserInitial(selectedUser!)}
                  </div>
                  <div>
                    <div className="user-name">{selectedConversationName}</div>
                    {selectedRoom ? (
                      <div className="user-meta">
                        <span className="user-status">
                          {selectedRoom.participants.length} members
                        </span>
                        <span className="user-username">
                          {getRoomMemberSummary(selectedRoom, currentUser?.id)}
                        </span>
                      </div>
                    ) : selectedUser ? (
                      <div className="user-meta">
                        <span className={`user-status ${selectedUser.online ? 'online' : 'offline'}`}>
                          {selectedUser.online ? 'Online' : 'Offline'}
                        </span>
                        {shouldShowUsername(selectedUser) ? (
                          <span className="user-username">@{selectedUser.username}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="messages-container" aria-busy={messagesLoading}>
                {messagesLoading ? (
                  MESSAGE_SKELETON_KEYS.map((key, index) => (
                    <div
                      key={key}
                      className={`message message-skeleton ${index % 2 === 0 ? 'received' : 'sent'}`}
                      aria-hidden="true"
                    >
                      <div className="skeleton-bubble" />
                    </div>
                  ))
                ) : messagesError ? (
                  <div className="message-state error-state">
                    <span>{messagesError}</span>
                    <button
                      type="button"
                      className="retry-btn"
                      onClick={() => {
                        if (selectedUser) {
                          void loadMessages(selectedUser.id);
                        } else if (selectedRoom) {
                          void loadRoomMessages(selectedRoom.id);
                        }
                      }}
                    >
                      Retry
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="message-state">No messages yet.</div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.clientId ?? message.id}
                      className={`message ${message.senderId === currentUser?.id ? 'sent' : 'received'} ${message.deliveryStatus ?? ''}`}
                    >
                      {selectedRoom && message.senderId !== currentUser?.id ? (
                        <div className="message-sender">
                          {getMessageSenderName(message, selectedRoom)}
                        </div>
                      ) : null}
                      <div className="message-content">{message.content}</div>
                      <div className="message-time">
                        <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                        {message.senderId === currentUser?.id ? (
                          <>
                            <span className={`message-read-status ${message.deliveryStatus ?? ''}`}>
                              {getDeliveryStatusLabel(message)}
                            </span>
                            {message.deliveryStatus === 'failed' ? (
                              <button
                                type="button"
                                className="message-retry-btn"
                                onClick={() => handleRetryMessage(message)}
                              >
                                Retry
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
                {!messagesLoading && selectedUser && typingUserId === selectedUser.id ? (
                  <div className="typing-indicator">
                    {getUserDisplayName(selectedUser)} is typing...
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="message-input-form">
                <textarea
                  value={messageInput}
                  onChange={(e) => handleMessageInputChange(e.target.value)}
                  onKeyDown={handleMessageInputKeyDown}
                  placeholder={`Message ${selectedConversationName}`}
                  className="message-input"
                  rows={1}
                />
                <button type="submit" className="send-btn" disabled={!messageInput.trim()}>
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="no-chat-selected">
              <p>Select a user or group to start chatting</p>
            </div>
          )}
        </main>
      </div>

      {createGroupOpen ? (
        <div className="modal-backdrop">
          <div
            className="group-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-group-title"
          >
            <form onSubmit={handleCreateGroup} className="group-form">
              <div className="group-modal-header">
                <div>
                  <h3 id="create-group-title">New group</h3>
                  <p>{selectedGroupMemberIds.length} selected</p>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={handleCloseCreateGroup}
                  aria-label="Close create group"
                >
                  ×
                </button>
              </div>

              <label className="group-field">
                <span>Group name</span>
                <input
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Weekend plans"
                  maxLength={100}
                  autoFocus
                />
              </label>

              <div className="group-field">
                <span>Members</span>
                <div className="group-member-list">
                  {users.length === 0 ? (
                    <div className="list-state">No users available.</div>
                  ) : (
                    users.map((user) => (
                      <label key={user.id} className="group-member-option">
                        <input
                          type="checkbox"
                          checked={selectedGroupMemberIds.includes(user.id)}
                          onChange={() => handleToggleGroupMember(user.id)}
                        />
                        <span className="user-avatar small-avatar">{getUserInitial(user)}</span>
                        <span className="group-member-copy">
                          <span>{getUserDisplayName(user)}</span>
                          {shouldShowUsername(user) ? <small>@{user.username}</small> : null}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {groupError ? <div className="group-error">{groupError}</div> : null}

              <div className="group-modal-actions">
                <button type="button" className="secondary-btn" onClick={handleCloseCreateGroup}>
                  Cancel
                </button>
                <button type="submit" className="send-btn" disabled={!canCreateGroup}>
                  {groupCreating ? 'Creating' : 'Create group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
