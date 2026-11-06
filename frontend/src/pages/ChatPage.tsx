import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../config/constants';
import type {
  ChatRoom,
  Friendship,
  FriendshipSummary,
  GlobalMessageSearchItem,
  Message,
  User,
} from '../types';
import { apiClient } from '../services/api';
import { useAuth } from '../context/useAuth';
import { wsService } from '../services/websocket';
import { useChatRealtime, type ChatRealtimeHandlers } from '../hooks/useChatRealtime';
import { useConversationDirectory } from '../hooks/useConversationDirectory';
import { useMessageLoaders } from '../hooks/useMessageLoaders';
import { useMessageActions } from '../hooks/useMessageActions';
import { useMessageComposer } from '../hooks/useMessageComposer';
import { useMediaPicker } from '../hooks/useMediaPicker';
import { useMediaUpload } from '../hooks/useMediaUpload';
import { useVoiceMessage } from '../hooks/useVoiceMessage';
import { useMessageSending } from '../hooks/useMessageSending';
import { useMessageHistory } from '../hooks/useMessageHistory';
import { useMessageTransport } from '../hooks/useMessageTransport';
import { useProfileEditor } from '../hooks/useProfileEditor';
import { useRealtimeEventHandlers } from '../hooks/useRealtimeEventHandlers';
import { useIncomingMessageRecovery } from '../hooks/useIncomingMessageRecovery';
import { useIncomingMessageHandler } from '../hooks/useIncomingMessageHandler';
import { useFriendshipActions } from '../hooks/useFriendshipActions';
import { useCallFeature } from '../hooks/useCallFeature';
import { useRoomSummary } from '../hooks/useRoomSummary';
import { useChatNotifications } from '../hooks/useChatNotifications';
import { useChatInteractionSignals } from '../hooks/useChatInteractionSignals';
import { useMessageSearchControls } from '../hooks/useMessageSearchControls';
import { useMessageNavigation } from '../hooks/useMessageNavigation';
import { useMessageSearchLoader } from '../hooks/useMessageSearchLoader';
import { useMessageSearch } from '../hooks/useMessageSearch';
import { useSharedContentManager } from '../hooks/useSharedContentManager';
import { useMessageViewport } from '../hooks/useMessageViewport';
import { useConversationNavigation } from '../hooks/useConversationNavigation';
import { useProfileViewer } from '../hooks/useProfileViewer';
import { useTheme } from '../hooks/useTheme';
import { useHeaderPreferences } from '../hooks/useHeaderPreferences';
import { useConversationSettings } from '../hooks/useConversationSettings';
import { useGroupWorkspace } from '../hooks/useGroupWorkspace';
import { useMessageStateSync } from '../hooks/useMessageStateSync';
import { useMessageScrollLifecycle } from '../hooks/useMessageScrollLifecycle';
import { useMessageItemRenderers } from '../hooks/useMessageItemRenderers';
import { useWorkspaceEscapeKey } from '../hooks/useWorkspaceEscapeKey';
import { useConversationDrafts } from '../hooks/useConversationDrafts';
import {
  USER_SEARCH_DEBOUNCE_MS,
  READ_BOTTOM_THRESHOLD, AUTO_SCROLL_BOTTOM_THRESHOLD,
  MEDIA_ACCEPT,
  CONVERSATION_FILTERS,
} from '../constants/chatConstants';
import type {
  ChatMessage,
  PendingMedia,
  MainView, ConversationFilter,
} from '../types/chat.types';
import {
  getMessageType,
  createReplyFromMessage,
  getPendingMediaType, cloudinaryResultToMedia,
  getLatestSeenOutgoingMessageId, getLatestOutgoingMessageId,
  isMessagesContainerNearBottom,
} from '../utils/messageUtils';
import {
  getUserDisplayName,
  getAvatarUrl, getMediaUrl,
  applyProfileToUser, applyProfileToRoom,
  canChatWithUser,
  getTypingIndicatorLabel,

  shouldOpenConversationDetailsByDefault, matchesFriendSearch,
} from '../utils/userUtils';
import {
  hasPrivateConversation,
  buildSidebarConversationItems,
} from '../utils/conversationUtils';
import { getBrowserAwareConnectionStatus } from '../utils/callUtils';
import {
  getMediaSizeError,
  getFileFormat,
} from '../utils/mediaUtils';
import {
  getChatRoute, getFriendsRoute, getRequestsRoute,
  getUserChatRoute, getRoomChatRoute,
} from '../utils/routeUtils';
import AppHeader from '../components/chat/AppHeader';
import ConversationSidebar from '../components/chat/ConversationSidebar';
import RightConversationSidebar from '../components/chat/RightConversationSidebar';
import { FriendsPanel, FriendRequestsPanel } from '../components/chat/PeoplePanels';
import ProfileViewerModal from '../components/chat/ProfileViewerModal';
import BlockedUsersModal from '../components/chat/BlockedUsersModal';
import ProfileEditorModal from '../components/chat/ProfileEditorModal';
import CreateGroupModal from '../components/chat/CreateGroupModal';
import SidebarContent from '../components/chat/SidebarContent';
import ConversationPane from '../components/chat/ConversationPane';
import CallModalLayer from '../components/chat/CallModalLayer';
import ChatDialogLayer from '../components/chat/ChatDialogLayer';
import GlobalMessageSearchModal from '../components/chat/GlobalMessageSearchModal';
import type { LightboxMediaItem } from '../components/chat/MediaLightbox';
import type { ReactionDetailGroup } from '../components/chat/ReactionSummaryModal';
import { buildLatestRoomSeenByMessageId, buildMessageListItems } from '../utils/messageListUtils';
import { useBlockedUsers } from '../hooks/useBlockedUsers';
import { useEmojiPicker } from '../hooks/useEmojiPicker';
import { useOfflineCache } from '../hooks/useOfflineCache';
import './ChatPage.layout.css';
import './ChatPage.css';

export default function ChatPage() {
  const { isDark, toggleTheme } = useTheme();
  const { user: authenticatedUser, logout, updateCurrentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [messageToDeleteForMe, setMessageToDeleteForMe] = useState<ChatMessage | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const [mentionActiveIndex, setMentionActiveIndex] = useState<number>(0);
  const [slashCommandQuery, setSlashCommandQuery] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [mediaViewerMessage, setMediaViewerMessage] = useState<ChatMessage | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const {
    soundMuted,
    pushSubscribed,
    profileMenuOpen,
    setProfileMenuOpen,
    handleTogglePush,
    handleToggleSound,
    handleToggleProfileMenu,
  } = useHeaderPreferences(currentUser);
  const [remoteTypingUserIds, setRemoteTypingUserIds] = useState<number[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [roomsError, setRoomsError] = useState('');
  const [messagesError, setMessagesError] = useState('');
  const [friendRequestsError, setFriendRequestsError] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [friendRequestsLoading, setFriendRequestsLoading] = useState(true);
  const [mainView, setMainView] = useState<MainView>('chat');
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>('all');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<Friendship[]>([]);
  const [friendSummary, setFriendSummary] = useState<FriendshipSummary>({
    incomingCount: 0,
    outgoingCount: 0,
  });
  const [friendActionKeys, setFriendActionKeys] = useState<string[]>([]);
  const [rightSidebarTab, setRightSidebarTab] = useState<'details' | 'search'>('details');
  const {
    messageSearchQuery, setMessageSearchQuery,
    messageSearchSubmitted, setMessageSearchSubmitted,
    messageSearchInputRef, messageSearchItems, setMessageSearchItems,
    messageSearchLoading, setMessageSearchLoading,
    messageSearchError, setMessageSearchError,
    messageSearchHasMore, setMessageSearchHasMore,
    messageSearchNextBefore, setMessageSearchNextBefore,
    activeMessageSearchId, setActiveMessageSearchId,
    clearMessageSearch,
  } = useMessageSearch();
  const [roomSeenByByMessageId, setRoomSeenByByMessageId] = useState<Record<number, User[]>>({});
  const [seenByLoadingMessageIds, setSeenByLoadingMessageIds] = useState<number[]>([]);
  const [seenByPopupMessageId, setSeenByPopupMessageId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(shouldOpenConversationDetailsByDefault);
  const currentUserRef = useRef<User | null>(null);
  const currentUserIdRef = useRef<number | null>(null);
  const selectedUserIdRef = useRef<number | null>(null);
  const selectedRoomIdRef = useRef<number | null>(null);
  const selectedMessageRequestStateRef = useRef<{ userId: number; isRequest: boolean } | null>(null);
  const usersRef = useRef<User[]>([]);
  const friendsRef = useRef<User[]>([]);
  const roomsRef = useRef<ChatRoom[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const roomSeenByLoadedMessageIdsRef = useRef<Set<number>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const sendTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const userSearchQueryRef = useRef('');
  const messageSearchQueryRef = useRef('');
  const messageSearchRequestedQueryRef = useRef('');
  const optimisticMessageIdRef = useRef(-Date.now() * 1000);
  const hasConnectedRef = useRef(false);
  const realtimeActiveRef = useRef(false);
  const hasLoadedInitialUsersRef = useRef(false);
  const {
    roomSummary,
    roomSummaryRoomId,
    roomSummaryLoading,
    roomSummaryError,
    requestRoomSummary,
    setRoomSummary,
    setRoomSummaryRoomId,
    setRoomSummaryError,
  } = useRoomSummary({
    selectedRoomId: selectedRoom?.id ?? null,
    selectedRoomIdRef,
  });
  const {
    unreadDividerMessageId,
    unreadDividerMessageIdRef,
    pendingReadConversationRef,
    olderMessagesLoading,
    setOlderMessagesLoading,
    olderMessagesLoadingRef,
    hasMoreMessages,
    hasMoreMessagesRef,
    nextMessageBeforeRef,
    skipNextAutoScrollRef,
    pendingInitialMessageScrollRef,
    blockOlderMessagesAutoLoadRef,
    hasUserInteractedWithMessagesRef,
    messagesContainerRef,
    messagesEndRef,
    unreadDividerRef,
    highlightedMessageId,
    setHighlightedMessageId,
    forceScrollToLatestMessage,
    scrollToLatestMessage,
    releaseInitialScrollBlock,
    scrollToUnreadDivider,
    setUnreadDividerMessageId,
    clearPendingReadConversation,
    preparePendingReadConversation,
    applyPendingUnreadDivider,
    addPendingUnreadMessage,
    resetMessagePagination,
    applyMessagePagination,
    clearMessageJumpEffects,
    highlightMessageById,
  } = useMessageViewport({ currentUserIdRef });

  const canOpenDirectConversation = useCallback(
    (user: User) => user.id !== currentUserIdRef.current,
    []
  );
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageInputSelectionRef = useRef({ start: 0, end: 0 });
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const { emojiPickerOpen, setEmojiPickerOpen, emojiPickerRef, emojiButtonRef } = useEmojiPicker({
    messageInputRef,
  });
  const navigate = useNavigate();
  const location = useLocation();
  const {
    findKnownUserById,
    startIncomingCallRingtone,
    stopIncomingCallRingtone,
    notifyWithBrowserNotification,
    buildMessageNotification,
    buildFriendshipNotification,
  } = useChatNotifications({
    currentUser,
    currentUserRef,
    currentUserIdRef,
    usersRef,
    friendsRef,
    roomsRef,
    navigate,
  });
  const mutedPrivateConversationUserIds = useMemo(() => Array.from(new Set(
    [...users, ...friends]
      .filter((user) => user.muted)
      .map((user) => user.id)
  )), [friends, users]);
  const {
    activeCall,
    activeCallRef,
    callMinimized,
    callError,
    localCallStream,
    remoteCallStream,
    micMuted,
    cameraOff,
    screenSharing,
    remoteScreenSharing,
    screenShareError,
    callConnectionState,
    callElapsedSeconds,
    callDevicesLoading,
    callDeviceError,
    callPermissions,
    selectedAudioInputId,
    selectedVideoInputId,
    preCallSetup,
    preCallPreviewStream,
    preCallPreviewLoading,
    preCallError,
    preCallSubmitting,
    preCallPreviewVideoRef,
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
    audioInputDevices,
    videoInputDevices,
    preCallCanStart,
    refreshCallPermissions,
    stopPreCallPreview,
    stopCallMedia,
    sendActiveCallCloseSignal,
    handleCallSignal,
    openPreCallSetupForUser,
    handleStartCall,
    handleClosePreCallSetup,
    handlePreCallRetryPreview,
    handleConfirmStartCall,
    handlePreCallAudioInputChange,
    handlePreCallVideoInputChange,
    handlePreCallToggleMic,
    handlePreCallToggleCamera,
    handleToggleMic,
    handleToggleCamera,
    handleRetryActiveCall,
    handleAcceptCall,
    handleRejectCall,
    handleEndCall,
    handleStartScreenShare,
    handleStopScreenShare,
    handleAudioInputChange,
    handleVideoInputChange,
    handleMinimizeActiveCall,
    handleRestoreActiveCall,
  } = useCallFeature({
    currentUserRef,
    currentUserIdRef,
    selectedUser,
    mutedPrivateConversationUserIds,
    notifyWithBrowserNotification,
    startIncomingCallRingtone,
    stopIncomingCallRingtone,
  });
  const selectedUserId = selectedUser?.id ?? null;
  const selectedRoomId = selectedRoom?.id ?? null;
  const {
    sharedMediaExpanded,
    setSharedMediaExpanded,
    sharedFilesExpanded,
    setSharedFilesExpanded,
    sharedLinksExpanded,
    setSharedLinksExpanded,
    sharedMediaItems,
    sharedLinkItems,
    sharedMediaLoading,
    sharedLinksLoading,
    sharedMediaError,
    sharedLinksError,
    sharedMediaHasMore,
    sharedLinksHasMore,
    loadSharedContent,
    addIncomingSharedContent,
    updateSharedContentFromMessage,
    removeSharedContentMessage,
  } = useSharedContentManager({
    currentUserIdRef,
    selectedUserIdRef,
    selectedRoomIdRef,
    messageSearchQueryRef,
    selectedUserId,
    selectedRoomId,
    setMessageSearchItems,
  });
  const activeMessageSearchIndex = useMemo(
    () => {
      if (messageSearchItems.length === 0) {
        return -1;
      }

      const exactIndex =
        activeMessageSearchId === null
          ? -1
          : messageSearchItems.findIndex((message) => message.id === activeMessageSearchId);

      return exactIndex >= 0 ? exactIndex : 0;
    },
    [activeMessageSearchId, messageSearchItems]
  );
  const messageSearchResultIds = useMemo(
    () => new Set(messageSearchItems.map((message) => message.id)),
    [messageSearchItems]
  );

  useEffect(() => {
    currentUserRef.current = currentUser;
    currentUserIdRef.current = currentUser?.id ?? null;
  }, [currentUser]);

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
    setViewedProfileUser,
    viewedProfileLoading,
    viewedProfileError,
    profileActionError,
    setProfileActionError,
    activeViewedProfileUser,
    clearViewedProfile,
    handleOpenUserProfile,
    handleCloseUserProfile,
  } = useProfileViewer({
    users,
    friends,
    selectedUser,
    selectedRoom,
    setProfileMenuOpen,
  });

  const [lightboxState, setLightboxState] = useState<{ items: LightboxMediaItem[]; index: number } | null>(null);
  const [groupSeenModalMessage, setGroupSeenModalMessage] = useState<{ message: Message; seenUsers: User[] } | null>(null);
  const [reactionModalGroups, setReactionModalGroups] = useState<ReactionDetailGroup[] | null>(null);

  const { conversationDrafts } = useConversationDrafts({
    currentUserId: currentUser?.id ?? null,
    selectedUserId,
    selectedRoomId,
    messageInput,
    setMessageInput,
  });

  const conversationMediaGalleryItems = useMemo<LightboxMediaItem[]>(() => {
    const seenUrls = new Set<string>();
    const items: LightboxMediaItem[] = [];
    const candidates = [...messages, ...[...sharedMediaItems].reverse()];

    for (const message of candidates) {
      if (message.recalled) continue;
      const msgType = getMessageType(message);
      if (msgType !== 'IMAGE' && msgType !== 'VIDEO') continue;
      const url = getMediaUrl(message.mediaUrl);
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      items.push({
        url,
        type: msgType,
        fileName: message.content || (msgType === 'VIDEO' ? 'video' : 'image'),
      });
    }

    return items;
  }, [messages, sharedMediaItems]);

  const handleOpenLightbox = useCallback((url: string, type: 'IMAGE' | 'VIDEO', fileName?: string) => {
    const matchedIndex = conversationMediaGalleryItems.findIndex((item) => item.url === url);
    if (matchedIndex >= 0) {
      setLightboxState({
        items: conversationMediaGalleryItems,
        index: matchedIndex,
      });
      return;
    }
    setLightboxState({
      items: [{ url, type, fileName }],
      index: 0,
    });
  }, [conversationMediaGalleryItems]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Sync pinned message when switching conversations
  useEffect(() => {
    if (selectedRoom) {
      setPinnedMessage(selectedRoom.pinnedMessage ?? null);
    } else if (selectedUser) {
      setPinnedMessage(selectedUser.pinnedMessage ?? null);
    } else {
      setPinnedMessage(null);
    }
  }, [selectedRoom?.id, selectedUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useOfflineCache({
    currentUserId: currentUser?.id ?? null,
    rooms,
    users,
    messages,
    selectedUser,
    selectedRoom,
    setRooms,
    setUsers,
  });

  const resetMessageSearchState = useCallback(() => {
    messageSearchQueryRef.current = '';
    messageSearchRequestedQueryRef.current = '';
    clearMessageSearch();
    setActiveMessageSearchId(null);
    setHighlightedMessageId(null);
  }, [clearMessageSearch, setActiveMessageSearchId, setHighlightedMessageId]);

  const getNextOptimisticMessageId = useCallback(() => {
    optimisticMessageIdRef.current -= 1;
    return optimisticMessageIdRef.current;
  }, []);

  const updateMessageInputSelection = () => {
    const input = messageInputRef.current;
    if (!input) {
      return;
    }

    messageInputSelectionRef.current = {
      start: input.selectionStart,
      end: input.selectionEnd,
    };
  };

  const clearPendingMedia = () => {
    setPendingMedia(null);
    setMediaError('');
    if (mediaFileInputRef.current) {
      mediaFileInputRef.current.value = '';
    }
    if (docFileInputRef.current) {
      docFileInputRef.current.value = '';
    }
  };

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

  const { loadMessages, loadRoomMessages } = useMessageLoaders({
    currentUserIdRef, messagesRef,
    selectedUserIdRef,
    selectedRoomIdRef,
    resetMessagePagination,
    applyMessagePagination,
    applyPendingUnreadDivider,
    setMessages,
    setMessagesLoading,
    setMessagesError,
  });

  const { loadOlderMessages } = useMessageHistory({
    currentUser, selectedRoom, messages, currentUserIdRef, selectedUserIdRef, selectedRoomIdRef,
    roomSeenByLoadedMessageIdsRef, olderMessagesLoadingRef, hasMoreMessagesRef,
    nextMessageBeforeRef, skipNextAutoScrollRef, messagesContainerRef, applyMessagePagination,
    setMessages, setMessagesError, setOlderMessagesLoading, setRoomSeenByByMessageId,
    setSeenByLoadingMessageIds,
  });

  const loadMessageSearch = useMessageSearchLoader({
    selectedUserIdRef, selectedRoomIdRef, queryRef: messageSearchQueryRef,
    requestedQueryRef: messageSearchRequestedQueryRef, loading: messageSearchLoading,
    hasMore: messageSearchHasMore, nextBefore: messageSearchNextBefore,
    setItems: setMessageSearchItems, setLoading: setMessageSearchLoading,
    setError: setMessageSearchError, setHasMore: setMessageSearchHasMore,
    setNextBefore: setMessageSearchNextBefore, setActiveId: setActiveMessageSearchId,
  });

  useEffect(() => {
    roomSeenByLoadedMessageIdsRef.current.clear();
    setRoomSeenByByMessageId({});
    setSeenByLoadingMessageIds([]);
    setSeenByPopupMessageId(null);
  }, [selectedRoomId, selectedUserId]);

  useEffect(() => {
    clearMessageJumpEffects();
    resetMessageSearchState();
  }, [clearMessageJumpEffects, resetMessageSearchState, selectedRoomId, selectedUserId]);

  useEffect(() => {
    if (messageSearchItems.length === 0) {
      if (activeMessageSearchId !== null) {
        setActiveMessageSearchId(null);
      }
      return;
    }

    if (
      activeMessageSearchId === null ||
      !messageSearchItems.some((message) => message.id === activeMessageSearchId)
    ) {
      setActiveMessageSearchId(messageSearchItems[0].id);
    }
  }, [activeMessageSearchId, messageSearchItems, setActiveMessageSearchId]);

  useEffect(() => {
    if (!authenticatedUser) {
      return;
    }

    setCurrentUser((current) => ({
      ...authenticatedUser,
      online: current?.online ?? false,
    }));
    currentUserIdRef.current = authenticatedUser.id;
  }, [authenticatedUser]);

  useEffect(() => () => {
    if (pendingMedia?.previewUrl) {
      URL.revokeObjectURL(pendingMedia.previewUrl);
    }
  }, [pendingMedia?.previewUrl]);

  useEffect(() => {
    setEmojiPickerOpen(false);
    setReplyingToMessage(null);
    clearPendingMedia();
    setMediaUploading(false);
    setMediaViewerMessage(null);
  }, [selectedRoomId, selectedUserId, setEmojiPickerOpen]);

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

    void loadIncomingFriendRequests();
    void loadFriendSummary();
  }, [currentUser?.id, loadFriendSummary, loadIncomingFriendRequests]);

  const {
    clearTypingTimeout,
    clearRemoteTypingTimeout,
    clearOptimisticSendTimeout,
    clearOptimisticSendTimeouts,
    scheduleOptimisticSendTimeout,
    showRemoteTyping,
    hideRemoteTyping,
    publishTyping,
    stopTyping,
    publishRoomTyping,
    stopRoomTyping,
    markConversationAsRead,
    markRoomAsRead,
    applyRoomReadReceipt,
    completePendingReadIfAtBottom,
  } = useChatInteractionSignals({
    currentUserIdRef,
    selectedRoomIdRef,
    messagesRef,
    messagesContainerRef,
    pendingReadConversationRef,
    typingTimeoutRef,
    remoteTypingTimeoutsRef,
    sendTimeoutsRef,
    setMessages,
    setUsers,
    setFriends,
    setRooms,
    setSelectedRoom,
    setRemoteTypingUserIds,
    setRoomSeenByByMessageId,
    setUnreadDividerMessageId,
    findKnownUserById,
  });

  const {
    applyRoomMembershipUpdate,
    applyMessageUpdate,
    applyMessageHidden,
  } = useMessageStateSync({
    currentUserIdRef,
    selectedRoomIdRef,
    userSearchQueryRef,
    roomSeenByLoadedMessageIdsRef,
    navigate,
    resetMessagePagination,
    updateSharedContentFromMessage,
    removeSharedContentMessage,
    loadUsers,
    loadRooms,
    setRooms,
    setSelectedRoom,
    setUsers,
    setFriends,
    setSelectedUser,
    setMessages,
    setMessageInput,
    setMainView,
    setPinnedMessage,
    setRoomSeenByByMessageId,
    setSeenByPopupMessageId,
    setReplyingToMessage,
    setForwardingMessage,
    setEditingMessage,
    setMessageToDeleteForMe,
  });

  const {
    markMessagesScrollIntent,
    handleMessageAssetLoaded,
    handleMessagesScroll,
  } = useMessageScrollLifecycle({
    selectedUserId,
    selectedRoomId,
    selectedUserIdRef,
    selectedRoomIdRef,
    messagesLength: messages.length,
    messagesLoading,
    olderMessagesLoading,
    remoteTypingCount: remoteTypingUserIds.length,
    unreadDividerMessageId,
    unreadDividerMessageIdRef,
    pendingReadConversationRef,
    skipNextAutoScrollRef,
    pendingInitialMessageScrollRef,
    blockOlderMessagesAutoLoadRef,
    hasUserInteractedWithMessagesRef,
    messagesContainerRef,
    forceScrollToLatestMessage,
    scrollToLatestMessage,
    releaseInitialScrollBlock,
    scrollToUnreadDivider,
    completePendingReadIfAtBottom,
    loadOlderMessages,
  });

  const realtimeEventHandlers = useRealtimeEventHandlers({
    realtimeActiveRef, hasConnectedRef, currentUserIdRef, selectedUserIdRef, selectedRoomIdRef,
    messagesContainerRef, isMessagesContainerNearBottom, readBottomThreshold: READ_BOTTOM_THRESHOLD,
    setCurrentUser, setUsers, setFriends, setSelectedUser, setMessages, showRemoteTyping,
    hideRemoteTyping, getBrowserAwareConnectionStatus, loadUsers, loadRooms,
    loadIncomingFriendRequests, loadFriendSummary, loadMessages, loadRoomMessages,
    markConversationAsRead, markRoomAsRead, applyRoomMembershipUpdate,
    buildFriendshipNotification, notifyWithBrowserNotification, applyMessageUpdate,
    applyMessageHidden,
    applyRoomReadReceipt, handleCallSignal, clearTypingTimeout, clearRemoteTypingTimeout,
    clearOptimisticSendTimeouts, sendActiveCallCloseSignal, stopCallMedia,
  });

  const { restoreMissingRoom, restoreMissingDirectSender } = useIncomingMessageRecovery({
    realtimeActiveRef, usersRef, roomsRef, userSearchQueryRef, setUsers, setRooms,
  });

  const handleIncomingMessage = useIncomingMessageHandler({
    realtimeActiveRef, currentUserIdRef, selectedUserIdRef, selectedRoomIdRef, userSearchQueryRef,
    usersRef, friendsRef, roomsRef, messagesContainerRef, pendingReadConversationRef,
    autoScrollBottomThreshold: AUTO_SCROLL_BOTTOM_THRESHOLD,
    setMessages, setUsers, setFriends, setRooms, setSelectedUser, setSelectedRoom,
    isMessagesContainerNearBottom, addIncomingSharedContent, clearOptimisticSendTimeout,
    buildMessageNotification, notifyWithBrowserNotification, restoreMissingRoom,
    restoreMissingDirectSender, markConversationAsRead, markRoomAsRead, addPendingUnreadMessage,
  });

  const realtimeHandlers = useMemo<ChatRealtimeHandlers>(() => ({
    onConnect: () => {
      realtimeActiveRef.current = true;
      currentUserIdRef.current = currentUser?.id ?? null;
    },
    onMessage: handleIncomingMessage,
    ...realtimeEventHandlers,
  }), [
    currentUser?.id,
    handleIncomingMessage,
    realtimeEventHandlers,
  ]);

  useChatRealtime(currentUser?.id, realtimeHandlers);

  const { uploadPendingMedia } = useMediaUpload(
    getMediaUrl, getFileFormat, cloudinaryResultToMedia,
  );

  const { sendOptimisticMessage, sendOptimisticRoomMessage } = useMessageTransport({
    currentUserId: currentUser?.id, selectedUserIdRef, uploadPendingMedia,
    currentUserIdRef, selectedRoomIdRef, userSearchQueryRef, clearOptimisticSendTimeout,
    scheduleOptimisticSendTimeout, addIncomingSharedContent, setMessages, setUsers, setFriends,
    setSelectedUser, setRooms, setSelectedRoom,
  });

  const {
    navigateIfNeeded,
    clearSelectedConversation,
    activateUserConversation,
    activateRoomConversation,
  } = useConversationNavigation({
    currentUserId: currentUser?.id,
    pathname: location.pathname,
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
  });

  const {
    handleSendFriendRequest,
    handleAcceptFriendRequest,
    handleDeclineFriendRequest,
    handleCancelFriendRequest,
    handleUnfriend,
  } = useFriendshipActions({
    currentUserIdRef, setFriendActionKeys, setUsersError, setFriendRequestsError,
    setProfileActionError, setViewedProfileUser, loadUsers, loadIncomingFriendRequests,
    loadFriendSummary,
  });

  const handleOpenRequestsPanel = () => {
    navigateIfNeeded(getRequestsRoute());
    setMainView('requests');
    setProfileMenuOpen(false);
    void Promise.all([
      loadIncomingFriendRequests({ silent: incomingFriendRequests.length > 0 }),
      loadFriendSummary({ silent: true }),
    ]);
  };

  const handleUserSelect = async (user: User) => {
    if (!canOpenDirectConversation(user)) {
      return;
    }

    navigateIfNeeded(getUserChatRoute(user.username));
    await activateUserConversation(user);
  };

  const handleRoomSelect = async (room: ChatRoom) => {
    navigateIfNeeded(getRoomChatRoute(room.id));
    await activateRoomConversation(room);
  };

  const handleOpenActiveCallConversation = () => {
    const currentCall = activeCallRef.current;
    if (!currentCall) {
      return;
    }

    const knownPeer = findKnownUserById(currentCall.peer.id) ?? currentCall.peer;
    const peerForChat = canChatWithUser(knownPeer)
      ? knownPeer
      : { ...knownPeer, friendshipStatus: 'accepted' as const };
    navigateIfNeeded(getUserChatRoute(peerForChat.username));
    activateUserConversation(peerForChat);
    handleMinimizeActiveCall();
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

  const handleFriendSearchChange = (value: string) => {
    setFriendSearchQuery(value);
  };

  const handleClearFriendSearch = () => {
    setFriendSearchQuery('');
  };

  const handleOpenFriendsPanel = () => {
    navigateIfNeeded(getFriendsRoute());
    setMainView('friends');
    setProfileMenuOpen(false);

    if (userSearchQueryRef.current) {
      handleClearUserSearch();
    }

    void loadUsers({ silent: true, search: '' });
  };

  const handleUserBlocked = useCallback(async (blockedUser: User) => {
    setFriends((current) => current.filter((friend) => friend.id !== blockedUser.id));
    setUsers((current) => current.map((listedUser) => listedUser.id === blockedUser.id
      ? { ...listedUser, friendshipStatus: 'none', friendshipId: undefined }
      : listedUser));
    setSelectedUser((current) => current?.id === blockedUser.id
      ? { ...current, friendshipStatus: 'none', friendshipId: undefined }
      : current);
    setViewedProfileUser((current) => current?.id === blockedUser.id
      ? { ...current, friendshipStatus: 'none', friendshipId: undefined }
      : current);
    await Promise.all([
      loadUsers({ search: '', silent: true }),
      loadIncomingFriendRequests({ silent: true }),
      loadFriendSummary({ silent: true }),
    ]);
  }, [loadFriendSummary, loadIncomingFriendRequests, loadUsers, setViewedProfileUser]);

  const {
    blockedUsers,
    blockedUserIds,
    blockedUsersOpen,
    openBlockedUsers,
    closeBlockedUsers,
    blockedUsersLoading,
    blockedUsersError,
    blockActionPendingUserId,
    toggleUserBlock,
  } = useBlockedUsers({
    currentUserId: currentUser?.id ?? null,
    onUserBlocked: handleUserBlocked,
    onActionError: setProfileActionError,
  });

  const handleOpenBlockedUsers = () => {
    setProfileMenuOpen(false);
    openBlockedUsers();
  };

  const handleToggleConversationDetails = () => {
    setProfileMenuOpen(false);
    if (detailsOpen && rightSidebarTab === 'details') {
      setDetailsOpen(false);
    } else {
      setRightSidebarTab('details');
      setDetailsOpen(true);
    }
  };

  const handleToggleMessageSearch = () => {
    setProfileMenuOpen(false);
    if (detailsOpen && rightSidebarTab === 'search') {
      setDetailsOpen(false);
    } else {
      setRightSidebarTab('search');
      setDetailsOpen(true);
      setTimeout(() => {
        messageSearchInputRef.current?.focus();
      }, 100);
    }
  };

  const handleCloseConversationDetails = () => {
    setDetailsOpen(false);
  };

  const handleReturnToConversationList = () => {
    setDetailsOpen(false);
    navigateIfNeeded(getChatRoute());
  };

  const {
    openConversationMenuKey,
    setOpenConversationMenuKey,
    conversationSettingPendingKey,
    conversationSettingsError,
    setConversationSettingsError,
    conversationDeleteTarget,
    setConversationDeleteTarget,
    handleToggleConversationMenu,
    handleUpdateConversationSetting,
    handleDeleteConversation,
  } = useConversationSettings({
    conversationFilter,
    selectedRoomId,
    selectedUserId,
    userSearchQuery,
    selectedUserIdRef,
    selectedRoomIdRef,
    setUsers,
    setFriends,
    setSelectedUser,
    setRooms,
    setSelectedRoom,
    clearSelectedConversation,
    navigateToChatRoot: () => navigateIfNeeded(getChatRoute()),
  });

  const {
    createGroupOpen,
    groupName,
    setGroupName,
    selectedGroupMemberIds,
    groupCreating,
    groupError,
    setGroupError,
    groupSettingsName,
    setGroupSettingsName,
    isEditingGroupName,
    setIsEditingGroupName,
    selectedAddMemberIds,
    setSelectedAddMemberIds,
    addMembersModalOpen,
    setAddMembersModalOpen,
    groupMemberNicknames,
    openGroupMemberMenuId,
    setOpenGroupMemberMenuId,
    editingGroupMemberNicknameId,
    groupSettingsPendingAction,
    groupSettingsError,
    setGroupSettingsError,
    groupAvatarUploading,
    groupMembersExpanded,
    setGroupMembersExpanded,
    inviteModalOpen,
    setInviteModalOpen,
    inviteLoading,
    inviteRevoking,
    inviteCopied,
    inviteError,
    handleOpenInviteModal,
    handleRevokeInviteLink,
    getGroupInviteUrl,
    handleCopyInviteLink,
    handleOpenCreateGroup,
    handleCloseCreateGroup,
    handleToggleGroupMember,
    handleCreateGroup,
    handleToggleAddRoomMember,
    handleUpdateGroupSettingsName,
    handleAddRoomMembers,
    handleGroupMemberNicknameChange,
    handleToggleGroupMemberMenu,
    handleStartEditGroupMemberNickname,
    handleCancelEditGroupMemberNickname,
    handleUpdateRoomMemberNickname,
    handleKickRoomMember,
    handleTransferRoomOwner,
    handleLeaveSelectedGroup,
    handleUpdateMemberRole,
    handleDeleteSelectedGroup,
    handleGroupAvatarChange,
    groupMemberRequirementText,
    canCreateGroup,
    selectedRoomOwnerId,
    selectedRoomOwnerName,
    currentUserMemberRole,
    isCurrentUserOwner,
    isCurrentUserModerator,
    currentUserCanManageSelectedRoom,
    canManagePinnedMessages,
    groupSettingsSaving,
    addMemberCandidates,
    canSaveGroupSettingsName,
    canKickMember,
  } = useGroupWorkspace({
    currentUser,
    selectedRoom,
    friends,
    selectedUserIdRef,
    selectedRoomIdRef,
    stopTyping,
    stopRoomTyping,
    navigateIfNeeded,
    resetMessagePagination,
    uploadPendingMedia,
    applyRoomMembershipUpdate,
    setMainView,
    setProfileMenuOpen,
    setRooms,
    setSelectedUser,
    setSelectedRoom,
    setDetailsOpen,
    setMessages,
    setMessageInput,
  });

  useWorkspaceEscapeKey({
    lightboxState,
    setLightboxState,
    conversationDeleteTarget,
    conversationSettingPendingKey,
    setConversationDeleteTarget,
    groupSeenModalMessage,
    setGroupSeenModalMessage,
    reactionModalGroups,
    setReactionModalGroups,
    mediaViewerMessage,
    setMediaViewerMessage,
    forwardingMessage,
    setForwardingMessage,
    addMembersModalOpen,
    setAddMembersModalOpen,
    inviteModalOpen,
    setInviteModalOpen,
    activeViewedProfileUser,
    handleCloseUserProfile,
    detailsOpen,
    setDetailsOpen,
    profileMenuOpen,
    setProfileMenuOpen,
  });

  const {
    handleReplyToMessage, handleCancelReply, handleCopyMessage,
    handleEditMessage, saveEditedMessage, handleReactToMessage, handleRecallMessage, handlePinMessage,
    handleRequestDeleteMessageForMe, deleteMessageForMe,
    handleUnpinMessage, handleForwardMessage, sendForwardMessage,
    messageActionError, clearMessageActionError,
  } = useMessageActions({
    currentUser, selectedUser, selectedRoom, replyingToMessage, forwardingMessage, editingMessage,
    messageToDeleteForMe, messageInputRef, setReplyingToMessage, setForwardingMessage, setEditingMessage,
    setMessageToDeleteForMe, setPinnedMessage,
    setEmojiPickerOpen, setMessagesError, applyMessageUpdate, applyMessageHidden,
  });

  const {
    mentionCandidates, insertMention, insertSummaryCommand,
    handleMessageInputChange, handleToggleEmojiPicker, handleInsertEmoji, handleMessageInputKeyDown: handleComposerKeyDown,
  } = useMessageComposer({
    selectedUser, selectedRoom, currentUser, messageInput, mentionQuery, mentionStartIndex, mentionActiveIndex,
    messageInputRef, messageInputSelectionRef, typingTimeoutRef,
    setMessageInput, setMentionQuery, setMentionStartIndex, setMentionActiveIndex,
    setSlashCommandQuery, setEmojiPickerOpen, canChatWithUser, publishTyping,
    publishRoomTyping, stopTyping, stopRoomTyping,
  });

  const {
    handleOpenMediaPicker,
    handleOpenDocPicker,
    handleFileSelected,
    handleMediaFileChange,
    handleClipboardPaste,
  } = useMediaPicker({
    mediaFileInputRef, docFileInputRef, setEmojiPickerOpen, setMediaError, setPendingMedia,
    getPendingMediaType, getMediaSizeError,
  });

  const handleVoiceRecorded = useVoiceMessage(setPendingMedia);

  const handleMessageInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) =>
    handleComposerKeyDown(event, slashCommandQuery);

  const { handleSendMessage, handleRetryMessage } = useMessageSending({
    currentUser, selectedUser, selectedRoom, messageInput, pendingMedia, mediaUploading,
    replyingToMessage, roomSummaryLoading, requestRoomSummary, userSearchQueryRef,
    selectedUserIdRef, selectedRoomIdRef, getNextOptimisticMessageId, clearPendingMedia, stopTyping, stopRoomTyping,
    sendOptimisticMessage, sendOptimisticRoomMessage, setMessageInput, setEmojiPickerOpen,
    setReplyingToMessage, setMediaUploading, setMediaError, setMessagesError, setMessages,
    setUsers, setFriends, setSelectedUser, setRooms, setSelectedRoom,
  });

  const {
    handleMessageSearchChange,
    handleClearMessageSearch,
    handleMessageSearchSubmit,
  } = useMessageSearchControls({
    query: messageSearchQuery, queryRef: messageSearchQueryRef,
    requestedQueryRef: messageSearchRequestedQueryRef, inputRef: messageSearchInputRef,
    loadMessageSearch, setQuery: setMessageSearchQuery, setSubmitted: setMessageSearchSubmitted,
    setItems: setMessageSearchItems, setError: setMessageSearchError,
    setHasMore: setMessageSearchHasMore, setNextBefore: setMessageSearchNextBefore,
    setActiveId: setActiveMessageSearchId,
  });

  const {
    handleJumpToMessage,
    handleJumpToSearchResult,
    handleMessageSearchInputKeyDown,
  } = useMessageNavigation({
    selectedUserIdRef, selectedRoomIdRef, skipNextAutoScrollRef,
    pendingInitialMessageScrollRef, blockOlderMessagesAutoLoadRef, messageSearchItems,
    activeMessageSearchIndex, handleMessageSearchSubmit, applyMessagePagination,
    highlightMessageById, releaseInitialScrollBlock, setMessages, setMessagesError,
    setMessageSearchError, setActiveMessageSearchId,
  });

  const handleOpenGlobalSearchResult = async (item: GlobalMessageSearchItem) => {
    if (item.roomId !== null && item.roomId !== undefined) {
      const knownRoom = rooms.find((candidate) => candidate.id === item.roomId);
      let room = knownRoom;
      if (!room) {
        const roomResponse = await apiClient.get<ChatRoom[]>('/rooms');
        setRooms(roomResponse.data);
        room = roomResponse.data.find((candidate) => candidate.id === item.roomId);
      }
      if (!room) throw new Error('The group conversation is no longer available.');
      await handleRoomSelect(room);
    } else if (item.otherUserId !== null && item.otherUserId !== undefined && item.otherUsername) {
      const knownUser = findKnownUserById(item.otherUserId);
      const user = knownUser ?? (await apiClient.get<User>(
        `/users/${encodeURIComponent(item.otherUsername)}`
      )).data;
      if (!knownUser) {
        setUsers((currentUsers) => currentUsers.some((currentUser) => currentUser.id === user.id)
          ? currentUsers
          : [...currentUsers, user]);
      }
      await handleUserSelect(user);
    } else {
      throw new Error('The conversation could not be resolved.');
    }

    if (!await handleJumpToMessage(item.message.id)) {
      throw new Error('The message is no longer available.');
    }
    setGlobalSearchOpen(false);
  };

  const applyUpdatedCurrentUserProfile = (updatedUser: User) => {
    const nextCurrentUser = currentUser
      ? { ...applyProfileToUser(currentUser, updatedUser), online: currentUser.online }
      : updatedUser;

    setCurrentUser(nextCurrentUser);
    currentUserIdRef.current = nextCurrentUser.id;
    updateCurrentUser(nextCurrentUser);
    setUsers((currentUsers) =>
      currentUsers.map((user) => applyProfileToUser(user, nextCurrentUser))
    );
    setFriends((currentFriends) =>
      currentFriends.map((friend) => applyProfileToUser(friend, nextCurrentUser))
    );
    setSelectedUser((currentSelectedUser) =>
      currentSelectedUser ? applyProfileToUser(currentSelectedUser, nextCurrentUser) : null
    );
    setRooms((currentRooms) =>
      currentRooms.map((room) => applyProfileToRoom(room, nextCurrentUser))
    );
    setSelectedRoom((currentSelectedRoom) =>
      currentSelectedRoom ? applyProfileToRoom(currentSelectedRoom, nextCurrentUser) : null
    );
  };

  const {
    profileFullName,
    setProfileFullName,
    profileBio,
    setProfileBio,
    profileAvatarPreview,
    profileSaving,
    profileError,
    setProfileError,
    handleOpenProfileEditor,
    handleCloseProfileEditor,
    handleProfileAvatarChange,
    handleUpdateProfile,
  } = useProfileEditor({
    currentUser,
    getAvatarUrl,
    applyUpdatedCurrentUserProfile,
    setProfileMenuOpen,
    setProfileEditorOpen,
  });

  const handleLogout = async () => {
    if (selectedUserIdRef.current !== null) {
      stopTyping(selectedUserIdRef.current);
    }

    if (selectedRoomIdRef.current !== null) {
      stopRoomTyping(selectedRoomIdRef.current);
    }

    sendActiveCallCloseSignal();
    stopPreCallPreview();

    wsService.disconnect();
    await logout();
    navigate(ROUTES.HOME, { replace: true });
  };

  const currentUserDisplayName = getUserDisplayName(currentUser) || 'Profile';
  const activeProfileUserIsBlocked = Boolean(activeViewedProfileUser &&
    blockedUsers.some((blockedUser) => blockedUser.id === activeViewedProfileUser.id));
  const selectedUserIsBlocked = Boolean(selectedUser &&
    blockedUsers.some((blockedUser) => blockedUser.id === selectedUser.id));
  const currentUserOnline = Boolean(currentUser?.online);
  const activeCallConversationOpen = Boolean(
    activeCall &&
    selectedUser?.id === activeCall.peer.id &&
    !selectedRoom &&
    mainView === 'chat'
  );
  const canStartPrivateCall = Boolean(selectedUser && canChatWithUser(selectedUser) && !activeCall);
  const normalizedUserSearchQuery = userSearchQuery.trim();
  const normalizedFriendSearchQuery = friendSearchQuery.trim();
  const hasUserSearch = Boolean(normalizedUserSearchQuery);
  const conversationUsers = users.filter(hasPrivateConversation);
  const sidebarConversationItems = buildSidebarConversationItems(
    conversationUsers,
    rooms,
    conversationFilter
  );
  const filteredFriends = friends.filter((friend) =>
    matchesFriendSearch(friend, normalizedFriendSearchQuery)
  );
  const friendRequestBadgeCount = friendSummary.incomingCount;
  const usersEmptyMessage = normalizedUserSearchQuery
    ? `No username matches "${normalizedUserSearchQuery}".`
    : 'No friends yet. Search username to add friends.';
  const selectedConversationName = selectedRoom
    ? selectedRoom.name
    : selectedUser
      ? getUserDisplayName(selectedUser)
      : '';
  const selectedConversationOpen = Boolean(selectedUser || selectedRoom);
  const sidebarBusy = hasUserSearch ? usersLoading : usersLoading || roomsLoading;
  const messageListItems = useMemo(
    () => buildMessageListItems(
      messages,
      selectedRoom,
      currentUser?.id ?? null,
      unreadDividerMessageId
    ),
    [currentUser?.id, messages, selectedRoom, unreadDividerMessageId]
  );
  const remoteTypingUsers = useMemo(
    () =>
      remoteTypingUserIds
        .map((userId) =>
          selectedRoom?.participants.find((participant) => participant.id === userId) ??
          (selectedUser?.id === userId ? selectedUser : null) ??
          findKnownUserById(userId)
        )
        .filter(Boolean) as User[],
    [findKnownUserById, remoteTypingUserIds, selectedRoom?.participants, selectedUser]
  );
  const typingIndicatorLabel = getTypingIndicatorLabel(remoteTypingUsers);
  const latestSeenOutgoingMessageId = useMemo(
    () => getLatestSeenOutgoingMessageId(
      messages,
      currentUser?.id ?? null,
      selectedUser?.id ?? null
    ),
    [currentUser?.id, messages, selectedUser?.id]
  );
  const latestOutgoingMessageId = useMemo(
    () => getLatestOutgoingMessageId(messages, currentUser?.id ?? null),
    [currentUser?.id, messages]
  );
  const latestRoomSeenByByMessageId = useMemo(() => {
    if (!selectedRoom || Object.keys(roomSeenByByMessageId).length === 0) {
      return {};
    }
    return buildLatestRoomSeenByMessageId(messages, roomSeenByByMessageId);
  }, [messages, roomSeenByByMessageId, selectedRoom]);
  const mediaViewerUrl = getMediaUrl(mediaViewerMessage?.mediaUrl);
  const mediaViewerType = mediaViewerMessage ? getMessageType(mediaViewerMessage) : 'IMAGE';
  const activeReplyPreview = createReplyFromMessage(replyingToMessage);

  const { messageListProps } = useMessageItemRenderers({
    currentUser,
    selectedUser,
    selectedRoom,
    hasActiveCall: Boolean(activeCall),
    pinnedMessage,
    canManagePinnedMessages,
    seenByPopupMessageId,
    messageListItems,
    unreadDividerRef,
    latestSeenOutgoingMessageId,
    latestOutgoingMessageId,
    latestRoomSeenByByMessageId,
    seenByLoadingMessageIds,
    detailsOpen,
    rightSidebarTab,
    messageSearchQuery,
    messageSearchResultIds,
    highlightedMessageId,
    findKnownUserById,
    openPreCallSetupForUser,
    handleOpenUserProfile,
    handleOpenLightbox,
    handleMessageAssetLoaded,
    handleJumpToMessage,
    handleReactToMessage,
    handleReplyToMessage,
    handleCopyMessage,
    handleEditMessage,
    handleRequestDeleteMessageForMe,
    handleRecallMessage,
    handlePinMessage,
    handleForwardMessage,
    handleRetryMessage,
    setReactionModalGroups,
    setGroupSeenModalMessage,
  });

  return (
    <div className="chat-page">
      <AppHeader
        isDark={isDark}
        mainView={mainView}
        soundMuted={soundMuted}
        friendRequestBadgeCount={friendRequestBadgeCount}
        profileMenuOpen={profileMenuOpen}
        currentUser={currentUser}
        currentUserDisplayName={currentUserDisplayName}
        currentUserOnline={currentUserOnline}
        onToggleTheme={toggleTheme}
        onOpenFriends={handleOpenFriendsPanel}
        onOpenGlobalSearch={() => setGlobalSearchOpen(true)}
        onToggleSound={handleToggleSound}
        pushSubscribed={pushSubscribed}
        onTogglePush={handleTogglePush}
        onOpenRequests={handleOpenRequestsPanel}
        onToggleProfileMenu={handleToggleProfileMenu}
        onOpenProfileEditor={handleOpenProfileEditor}
        onOpenBlockedUsers={handleOpenBlockedUsers}
        onOpenAdmin={() => {
          setProfileMenuOpen(false);
          navigate(ROUTES.ADMIN);
        }}
        onLogout={() => void handleLogout()}
      />

      {globalSearchOpen ? (
        <GlobalMessageSearchModal
          onClose={() => setGlobalSearchOpen(false)}
          onOpenResult={handleOpenGlobalSearchResult}
        />
      ) : null}

      <div className={`chat-container ${mainView === 'chat' && selectedConversationOpen ? 'conversation-open' : ''} ${mainView === 'chat' && selectedConversationOpen && detailsOpen ? 'details-open' : ''}`}>
        <ConversationSidebar
          userSearchQuery={userSearchQuery}
          onUserSearchChange={handleUserSearchChange}
          onClearUserSearch={handleClearUserSearch}
          hasUserSearch={hasUserSearch}
          conversationFilters={CONVERSATION_FILTERS}
          conversationFilter={conversationFilter}
          onConversationFilterChange={setConversationFilter}
          conversationSettingsError={conversationSettingsError}
          sidebarBusy={sidebarBusy}
          onOpenCreateGroup={handleOpenCreateGroup}
        >
          <SidebarContent
            hasUserSearch={hasUserSearch}
            users={users}
            usersLoading={usersLoading}
            usersError={usersError}
            userSearchQuery={userSearchQuery}
            usersEmptyMessage={usersEmptyMessage}
            rooms={rooms}
            roomsError={roomsError}
            sidebarBusy={sidebarBusy}
            conversationFilter={conversationFilter}
            conversationItems={sidebarConversationItems}
            currentUser={currentUser}
            selectedUserId={selectedUserId}
            selectedRoomId={selectedRoomId}
            friendActionKeys={friendActionKeys}
            blockedUserIds={blockedUserIds}
            openConversationMenuKey={openConversationMenuKey}
            pendingConversationKey={conversationSettingPendingKey}
            conversationDrafts={conversationDrafts}
            onLoadUsers={(options) => void loadUsers(options)}
            onLoadRooms={() => void loadRooms()}
            onSelectUser={handleUserSelect}
            onSelectRoom={handleRoomSelect}
            onOpenProfile={(user) => {
              setOpenConversationMenuKey(null);
              void handleOpenUserProfile(user);
            }}
            onSendFriendRequest={(user) => void handleSendFriendRequest(user)}
            onAcceptFriendRequest={(requestId, actionKey) => void handleAcceptFriendRequest(requestId, actionKey)}
            onCancelFriendRequest={(user) => void handleCancelFriendRequest(user)}
            onToggleConversationMenu={handleToggleConversationMenu}
            onUpdateConversationSetting={(target, patch) => void handleUpdateConversationSetting(target, patch)}
            onRequestDelete={(target) => {
              setConversationSettingsError('');
              setConversationDeleteTarget(target);
              setOpenConversationMenuKey(null);
            }}
          />
        </ConversationSidebar>

        <main className={`chat-area ${mainView !== 'chat' ? 'main-view-open' : ''}`}>
          {mainView === 'friends' ? (
            <FriendsPanel
              friends={friends}
              filteredFriends={filteredFriends}
              searchQuery={friendSearchQuery}
              loading={usersLoading}
              error={usersError}
              onSearchChange={handleFriendSearchChange}
              onClearSearch={handleClearFriendSearch}
              onRefresh={() => void loadUsers({ search: '', silent: true })}
              onRetry={() => void loadUsers({ search: '' })}
              onOpenProfile={(user) => void handleOpenUserProfile(user)}
              onOpenChat={handleUserSelect}
            />
          ) : mainView === 'requests' ? (
            <FriendRequestsPanel
              incomingRequests={incomingFriendRequests}
              pendingCount={friendRequestBadgeCount}
              loading={friendRequestsLoading}
              error={friendRequestsError}
              pendingActionKeys={friendActionKeys}
              onRefresh={() => void Promise.all([
                loadIncomingFriendRequests(),
                loadFriendSummary({ silent: true }),
              ])}
              onRetry={() => void loadIncomingFriendRequests()}
              onAccept={(requestId, actionKey) => void handleAcceptFriendRequest(requestId, actionKey)}
              onDecline={(requestId, actionKey) => void handleDeclineFriendRequest(requestId, actionKey)}
            />
          ) : (
            <ConversationPane
              open={selectedConversationOpen}
              isMessageRequest={Boolean(selectedUser?.messageRequest)}
              header={{
                selectedUser,
                selectedRoom,
                selectedConversationName,
                canStartPrivateCall,
                canAddMembers: currentUserCanManageSelectedRoom,
                detailsOpen,
                rightSidebarTab,
                onBackToChatList: handleReturnToConversationList,
                onStartCall: handleStartCall,
                onOpenUserProfile: (user) => void handleOpenUserProfile(user),
                onOpenAddMembers: () => {
                  setGroupSettingsError('');
                  setSelectedAddMemberIds([]);
                  setAddMembersModalOpen(true);
                },
                onToggleMessageSearch: handleToggleMessageSearch,
                onToggleConversationDetails: handleToggleConversationDetails,
              }}
              pinnedMessage={pinnedMessage}
              messages={messages}
              messagesLoading={messagesLoading}
              messagesError={messagesError}
              messageActionError={forwardingMessage ? '' : messageActionError}
              onDismissMessageActionError={clearMessageActionError}
              hasMoreMessages={hasMoreMessages}
              olderMessagesLoading={olderMessagesLoading}
              messageListProps={messageListProps}
              messageInputProps={{
                onSubmit: handleSendMessage,
                mediaFileInputRef,
                docFileInputRef,
                mediaAccept: MEDIA_ACCEPT,
                onFileChange: handleMediaFileChange,
                replyPreview: activeReplyPreview,
                onCancelReply: handleCancelReply,
                pendingMedia,
                mediaError,
                mediaUploading,
                canAttachMedia: Boolean(selectedRoom || (selectedUser && canChatWithUser(selectedUser))),
                blocked: selectedUserIsBlocked,
                onClearPendingMedia: clearPendingMedia,
                onOpenMediaPicker: handleOpenMediaPicker,
                onOpenDocumentPicker: handleOpenDocPicker,
                onVoiceRecorded: handleVoiceRecorded,
                emojiButtonRef,
                emojiPickerOpen,
                onToggleEmojiPicker: handleToggleEmojiPicker,
                messageInputRef,
                messageInput,
                onMessageInputChange: handleMessageInputChange,
                onMessageInputKeyDown: handleMessageInputKeyDown,
                onUpdateMessageInputSelection: updateMessageInputSelection,
                onPaste: handleClipboardPaste,
                onFileDrop: handleFileSelected,
                selectedConversationName,
                mentionQuery,
                mentionCandidates,
                mentionActiveIndex,
                onInsertMention: insertMention,
                slashCommandQuery,
                onInsertSummaryCommand: insertSummaryCommand,
                emojiPickerRef,
                onInsertEmoji: handleInsertEmoji,
              }}
              messagesContainerRef={messagesContainerRef}
              messagesEndRef={messagesEndRef}
              isDraggingFile={isDraggingFile}
              onSetDraggingFile={setIsDraggingFile}
              onMarkScrollIntent={markMessagesScrollIntent}
              onMessagesScroll={handleMessagesScroll}
              onFileSelected={handleFileSelected}
              onRetryMessages={() => {
                if (selectedUser) {
                  void loadMessages(selectedUser.id);
                } else if (selectedRoom) {
                  void loadRoomMessages(selectedRoom.id);
                }
              }}
              onLoadOlderMessages={() => void loadOlderMessages()}
              onGoToPinnedMessage={() => {
                if (pinnedMessage) {
                  void handleJumpToMessage(pinnedMessage.id);
                }
              }}
              onUnpinMessage={canManagePinnedMessages ? () => void handleUnpinMessage() : undefined}
              typingIndicatorLabel={typingIndicatorLabel}
              roomSummaryRoomId={roomSummaryRoomId}
              selectedRoomId={selectedRoom?.id ?? null}
              roomSummary={roomSummary}
              roomSummaryLoading={roomSummaryLoading}
              roomSummaryError={roomSummaryError}
              onDismissRoomSummary={() => {
                setRoomSummary(null);
                setRoomSummaryRoomId(null);
                setRoomSummaryError('');
              }}
            />
          )}
        </main>

        <RightConversationSidebar
          open={mainView === 'chat' && selectedConversationOpen && detailsOpen}
          rightSidebarTab={rightSidebarTab}
          currentUserId={currentUser?.id ?? null}
          selectedUser={selectedUser}
          selectedRoom={selectedRoom}
          handleCloseConversationDetails={handleCloseConversationDetails}
          handleOpenUserProfile={handleOpenUserProfile}
          findKnownUserById={findKnownUserById}
          handleJumpToMessage={handleJumpToMessage}
          handleOpenLightbox={handleOpenLightbox}
          setMediaViewerMessage={setMediaViewerMessage}
          messageSearchInputRef={messageSearchInputRef}
          messageSearchQuery={messageSearchQuery}
          messageSearchSubmitted={messageSearchSubmitted}
          messageSearchLoading={messageSearchLoading}
          messageSearchError={messageSearchError}
          messageSearchItems={messageSearchItems}
          messageSearchHasMore={messageSearchHasMore}
          activeMessageSearchId={activeMessageSearchId}
          handleMessageSearchSubmit={handleMessageSearchSubmit}
          handleMessageSearchChange={handleMessageSearchChange}
          handleMessageSearchInputKeyDown={handleMessageSearchInputKeyDown}
          handleClearMessageSearch={handleClearMessageSearch}
          loadMessageSearch={loadMessageSearch}
          handleJumpToSearchResult={handleJumpToSearchResult}
          sharedMediaExpanded={sharedMediaExpanded}
          setSharedMediaExpanded={setSharedMediaExpanded}
          sharedFilesExpanded={sharedFilesExpanded}
          setSharedFilesExpanded={setSharedFilesExpanded}
          sharedLinksExpanded={sharedLinksExpanded}
          setSharedLinksExpanded={setSharedLinksExpanded}
          sharedMediaItems={sharedMediaItems}
          sharedLinkItems={sharedLinkItems}
          sharedMediaLoading={sharedMediaLoading}
          sharedLinksLoading={sharedLinksLoading}
          sharedMediaError={sharedMediaError}
          sharedLinksError={sharedLinksError}
          sharedMediaHasMore={sharedMediaHasMore}
          sharedLinksHasMore={sharedLinksHasMore}
          loadSharedContent={loadSharedContent}
          selectedRoomOwnerId={selectedRoomOwnerId}
          selectedRoomOwnerName={selectedRoomOwnerName}
          currentUserMemberRole={currentUserMemberRole}
          isCurrentUserOwner={isCurrentUserOwner}
          isCurrentUserModerator={isCurrentUserModerator}
          currentUserCanManageSelectedRoom={currentUserCanManageSelectedRoom}
          groupAvatarUploading={groupAvatarUploading}
          groupSettingsSaving={groupSettingsSaving}
          groupSettingsPendingAction={groupSettingsPendingAction}
          groupSettingsName={groupSettingsName}
          setGroupSettingsName={setGroupSettingsName}
          isEditingGroupName={isEditingGroupName}
          setIsEditingGroupName={setIsEditingGroupName}
          canSaveGroupSettingsName={canSaveGroupSettingsName}
          groupSettingsError={groupSettingsError}
          setGroupSettingsError={setGroupSettingsError}
          groupMembersExpanded={groupMembersExpanded}
          setGroupMembersExpanded={setGroupMembersExpanded}
          groupMemberNicknames={groupMemberNicknames}
          openGroupMemberMenuId={openGroupMemberMenuId}
          setOpenGroupMemberMenuId={setOpenGroupMemberMenuId}
          editingGroupMemberNicknameId={editingGroupMemberNicknameId}
          canKickMember={canKickMember}
          handleGroupAvatarChange={handleGroupAvatarChange}
          handleUpdateGroupSettingsName={handleUpdateGroupSettingsName}
          handleOpenInviteModal={handleOpenInviteModal}
          handleToggleGroupMemberMenu={handleToggleGroupMemberMenu}
          handleStartEditGroupMemberNickname={handleStartEditGroupMemberNickname}
          handleUpdateMemberRole={handleUpdateMemberRole}
          handleTransferRoomOwner={handleTransferRoomOwner}
          handleKickRoomMember={handleKickRoomMember}
          handleGroupMemberNicknameChange={handleGroupMemberNicknameChange}
          handleUpdateRoomMemberNickname={handleUpdateRoomMemberNickname}
          handleCancelEditGroupMemberNickname={handleCancelEditGroupMemberNickname}
          handleDeleteSelectedGroup={handleDeleteSelectedGroup}
          handleLeaveSelectedGroup={handleLeaveSelectedGroup}
        />
      </div>

      <CallModalLayer
        callPermissions={callPermissions}
        onRefreshCallPermissions={refreshCallPermissions}
        preCall={{
          setup: preCallSetup,
          previewStream: preCallPreviewStream,
          previewVideoRef: preCallPreviewVideoRef,
          previewLoading: preCallPreviewLoading,
          submitting: preCallSubmitting,
          canStart: preCallCanStart,
          error: preCallError,
          micMuted,
          cameraOff,
          audioInputDevices,
          videoInputDevices,
          selectedAudioInputId,
          selectedVideoInputId,
          devicesLoading: callDevicesLoading,
          deviceError: callDeviceError,
          onClose: handleClosePreCallSetup,
          onToggleMic: handlePreCallToggleMic,
          onToggleCamera: handlePreCallToggleCamera,
          onAudioInputChange: handlePreCallAudioInputChange,
          onVideoInputChange: handlePreCallVideoInputChange,
          onRetryPreview: handlePreCallRetryPreview,
          onStart: handleConfirmStartCall,
        }}
        active={{
          call: activeCall,
          minimized: callMinimized,
          connectionState: callConnectionState,
          elapsedSeconds: callElapsedSeconds,
          localStream: localCallStream,
          remoteStream: remoteCallStream,
          remoteAudioRef,
          remoteVideoRef,
          localVideoRef,
          isConversationOpen: activeCallConversationOpen,
          micMuted,
          cameraOff,
          screenSharing,
          remoteScreenSharing,
          screenShareError,
          error: callError,
          audioInputDevices,
          videoInputDevices,
          selectedAudioInputId,
          selectedVideoInputId,
          devicesLoading: callDevicesLoading,
          deviceError: callDeviceError,
          onRestore: handleRestoreActiveCall,
          onMinimize: handleMinimizeActiveCall,
          onOpenConversation: handleOpenActiveCallConversation,
          onToggleMic: handleToggleMic,
          onToggleCamera: handleToggleCamera,
          onStartScreenShare: handleStartScreenShare,
          onStopScreenShare: handleStopScreenShare,
          onEnd: handleEndCall,
          onAccept: handleAcceptCall,
          onReject: handleRejectCall,
          onRetry: handleRetryActiveCall,
          onAudioInputChange: handleAudioInputChange,
          onVideoInputChange: handleVideoInputChange,
        }}
      />

      <ProfileViewerModal
        user={activeViewedProfileUser}
        loading={viewedProfileLoading}
        error={viewedProfileError}
        actionError={profileActionError}
        pendingActionKeys={friendActionKeys}
        callActive={Boolean(activeCall)}
        blockedByCurrentUser={activeProfileUserIsBlocked}
        blockActionPending={blockActionPendingUserId === activeViewedProfileUser?.id}
        onClose={handleCloseUserProfile}
        onOpenChat={(user) => {
          handleCloseUserProfile();
          handleUserSelect(user);
        }}
        onStartCall={(user, callType) => {
          handleCloseUserProfile();
          openPreCallSetupForUser(user, callType);
        }}
        onSendFriendRequest={(user) => void handleSendFriendRequest(user)}
        onAcceptFriendRequest={(requestId, actionKey) => void handleAcceptFriendRequest(requestId, actionKey)}
        onDeclineFriendRequest={(requestId, actionKey) => void handleDeclineFriendRequest(requestId, actionKey)}
        onCancelFriendRequest={(user) => void handleCancelFriendRequest(user)}
        onUnfriend={(user) => void handleUnfriend(user)}
        onToggleBlock={(user) => void toggleUserBlock(user)}
      />

      <BlockedUsersModal
        open={blockedUsersOpen}
        users={blockedUsers}
        loading={blockedUsersLoading}
        error={blockedUsersError}
        pendingUserId={blockActionPendingUserId}
        onClose={closeBlockedUsers}
        onUnblock={(user) => void toggleUserBlock(user)}
      />

      <ProfileEditorModal
        open={profileEditorOpen}
        currentUser={currentUser}
        fullName={profileFullName}
        bio={profileBio}
        avatarPreview={profileAvatarPreview}
        saving={profileSaving}
        error={profileError}
        onClose={handleCloseProfileEditor}
        onSubmit={handleUpdateProfile}
        onAvatarChange={handleProfileAvatarChange}
        onFullNameChange={(value) => {
          setProfileFullName(value);
          setProfileError('');
        }}
        onBioChange={(value) => {
          setProfileBio(value);
          setProfileError('');
        }}
      />

      <CreateGroupModal
        open={createGroupOpen}
        friends={friends}
        groupName={groupName}
        selectedMemberIds={selectedGroupMemberIds}
        requirementText={groupMemberRequirementText}
        creating={groupCreating}
        canCreate={canCreateGroup}
        error={groupError}
        onClose={handleCloseCreateGroup}
        onSubmit={handleCreateGroup}
        onGroupNameChange={(value) => {
          setGroupName(value);
          setGroupError('');
        }}
        onToggleMember={handleToggleGroupMember}
      />

      <ChatDialogLayer
        mediaViewerMessage={mediaViewerMessage}
        mediaViewerUrl={mediaViewerUrl}
        mediaViewerType={mediaViewerType}
        onCloseMediaViewer={() => setMediaViewerMessage(null)}
        conversationDeleteTarget={conversationDeleteTarget}
        conversationSettingPendingKey={conversationSettingPendingKey}
        conversationSettingsError={conversationSettingsError}
        onCloseConversationDelete={() => setConversationDeleteTarget(null)}
        onDeleteConversation={() => void handleDeleteConversation()}
        forwardingMessage={forwardingMessage}
        messageActionError={messageActionError}
        onDismissMessageActionError={clearMessageActionError}
        editingMessage={editingMessage}
        onCloseEditMessage={() => setEditingMessage(null)}
        onSaveEditMessage={saveEditedMessage}
        messageToDeleteForMe={messageToDeleteForMe}
        onCloseDeleteForMe={() => setMessageToDeleteForMe(null)}
        onConfirmDeleteForMe={deleteMessageForMe}
        friends={friends}
        rooms={rooms}
        onCloseForward={() => setForwardingMessage(null)}
        onForward={(targetUserId, targetRoomId) => void sendForwardMessage(targetUserId, targetRoomId)}
        addMembersModalOpen={addMembersModalOpen}
        selectedRoom={selectedRoom}
        addMemberCandidates={addMemberCandidates}
        selectedAddMemberIds={selectedAddMemberIds}
        groupSettingsSaving={groupSettingsSaving}
        groupSettingsError={groupSettingsError}
        onCloseAddMembers={() => {
          setSelectedAddMemberIds([]);
          setAddMembersModalOpen(false);
        }}
        onToggleAddMember={handleToggleAddRoomMember}
        onAddMembers={handleAddRoomMembers}
        inviteModalOpen={inviteModalOpen}
        inviteLoading={inviteLoading}
        inviteCopied={inviteCopied}
        inviteError={inviteError}
        inviteRevoking={inviteRevoking}
        canManageInvite={currentUserCanManageSelectedRoom}
        getInviteUrl={getGroupInviteUrl}
        onCloseInvite={() => setInviteModalOpen(false)}
        onCopyInvite={() => void handleCopyInviteLink()}
        onRevokeInvite={() => void handleRevokeInviteLink()}
        lightboxState={lightboxState}
        onCloseLightbox={() => setLightboxState(null)}
        onSelectLightboxIndex={(index) => setLightboxState((current) => current ? { ...current, index } : null)}
        groupSeenModalMessage={groupSeenModalMessage}
        onCloseGroupSeen={() => setGroupSeenModalMessage(null)}
        reactionModalGroups={reactionModalGroups}
        onCloseReactionSummary={() => setReactionModalGroups(null)}
      />

    </div>
  );
}
