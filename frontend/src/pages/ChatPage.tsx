import {
  lazy,
  Suspense,
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
  Message,
  User,
} from '../types';
import { useAuth } from '../context/useAuth';
import { wsService } from '../services/websocket';
import { useDirectoryWorkspace } from '../hooks/useDirectoryWorkspace';
import { useMessageLoaders } from '../hooks/useMessageLoaders';
import { useMessageActions } from '../hooks/useMessageActions';
import { useMessageComposer } from '../hooks/useMessageComposer';
import { useMediaWorkspace } from '../hooks/useMediaWorkspace';
import { useMessageSending } from '../hooks/useMessageSending';
import { useMessageHistory } from '../hooks/useMessageHistory';
import { useMessageTransport } from '../hooks/useMessageTransport';
import { useFriendshipActions } from '../hooks/useFriendshipActions';
import { useCallFeature } from '../hooks/useCallFeature';
import { useRoomSummary } from '../hooks/useRoomSummary';
import { useChatNotifications } from '../hooks/useChatNotifications';
import { useChatRealtimeWorkspace } from '../hooks/useChatRealtimeWorkspace';
import { useConversationSearchWorkspace } from '../hooks/useConversationSearchWorkspace';
import { useSharedContentManager } from '../hooks/useSharedContentManager';
import { useMessageViewport } from '../hooks/useMessageViewport';
import { useConversationNavigation } from '../hooks/useConversationNavigation';
import { useUserProfileWorkspace } from '../hooks/useUserProfileWorkspace';
import { useTheme } from '../hooks/useTheme';
import { useHeaderPreferences } from '../hooks/useHeaderPreferences';
import { useConversationSettings } from '../hooks/useConversationSettings';
import { useGroupWorkspace } from '../hooks/useGroupWorkspace';
import { useMessageStateSync } from '../hooks/useMessageStateSync';
import { useMessageScrollLifecycle } from '../hooks/useMessageScrollLifecycle';
import { useMessageItemRenderers } from '../hooks/useMessageItemRenderers';
import { useWorkspaceEscapeKey } from '../hooks/useWorkspaceEscapeKey';
import { useWorkspaceShortcuts } from '../hooks/useWorkspaceShortcuts';
import { useConversationDrafts } from '../hooks/useConversationDrafts';
import {
  MEDIA_ACCEPT,
  CONVERSATION_FILTERS,
} from '../constants/chatConstants';
import type {
  ChatMessage,
  MainView,
} from '../types/chat.types';
import {
  createReplyFromMessage,
  getLatestSeenOutgoingMessageId, getLatestOutgoingMessageId,
} from '../utils/messageUtils';
import {
  getUserDisplayName,
  canChatWithUser,
  getTypingIndicatorLabel,

  shouldOpenConversationDetailsByDefault,
} from '../utils/userUtils';
import {
  getChatRoute, getFriendsRoute, getRequestsRoute,
  getUserChatRoute, getRoomChatRoute,
} from '../utils/routeUtils';
import AppHeader from '../components/chat/AppHeader';
import ConversationSidebar from '../components/chat/ConversationSidebar';
import SidebarContent from '../components/chat/SidebarContent';
import ConversationPane from '../components/chat/ConversationPane';
import CallModalLayer from '../components/chat/CallModalLayer';
import WorkspaceModals from '../components/chat/WorkspaceModals';

const RightConversationSidebar = lazy(() => import('../components/chat/RightConversationSidebar'));
const FriendsPanel = lazy(() =>
  import('../components/chat/PeoplePanels').then((module) => ({ default: module.FriendsPanel }))
);
const FriendRequestsPanel = lazy(() =>
  import('../components/chat/PeoplePanels').then((module) => ({ default: module.FriendRequestsPanel }))
);
import type { ReactionDetailGroup } from '../components/chat/ReactionSummaryModal';
import { buildLatestRoomSeenByMessageId, buildMessageListItems } from '../utils/messageListUtils';
import { useEmojiPicker } from '../hooks/useEmojiPicker';
import { useOfflineCache } from '../hooks/useOfflineCache';
import './ChatPage.layout.css';
import './ChatPage.css';

export default function ChatPage() {
  const { isDark, toggleTheme } = useTheme();
  const { user: authenticatedUser, logout, updateCurrentUser } = useAuth();
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
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [mainView, setMainView] = useState<MainView>('chat');
  const [rightSidebarTab, setRightSidebarTab] = useState<'details' | 'search'>('details');
  const [roomSeenByByMessageId, setRoomSeenByByMessageId] = useState<Record<number, User[]>>({});
  const [seenByLoadingMessageIds, setSeenByLoadingMessageIds] = useState<number[]>([]);
  const [seenByPopupMessageId, setSeenByPopupMessageId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(shouldOpenConversationDetailsByDefault);
  const currentUserRef = useRef<User | null>(null);
  const currentUserIdRef = useRef<number | null>(null);
  const selectedUserIdRef = useRef<number | null>(null);
  const selectedRoomIdRef = useRef<number | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const roomSeenByLoadedMessageIdsRef = useRef<Set<number>>(new Set());
  const optimisticMessageIdRef = useRef(-Date.now() * 1000);
  const selectedUserId = selectedUser?.id ?? null;
  const selectedRoomId = selectedRoom?.id ?? null;
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
    selectedRoomId,
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
  const { emojiPickerOpen, setEmojiPickerOpen, emojiPickerRef, emojiButtonRef } = useEmojiPicker({
    messageInputRef,
  });
  const navigate = useNavigate();
  const location = useLocation();
  const {
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
  } = useDirectoryWorkspace({
    currentUserId: currentUser?.id ?? null,
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
  });
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
  const {
    globalSearchOpen,
    setGlobalSearchOpen,
    messageSearchQueryRef,
    messageSearchQuery,
    messageSearchSubmitted,
    messageSearchInputRef,
    messageSearchItems,
    setMessageSearchItems,
    messageSearchLoading,
    messageSearchError,
    messageSearchHasMore,
    activeMessageSearchId,
    messageSearchResultIds,
    loadMessageSearch,
    handleMessageSearchChange,
    handleClearMessageSearch,
    handleMessageSearchSubmit,
    handleJumpToMessage,
    handleJumpToSearchResult,
    handleMessageSearchInputKeyDown,
    createGlobalSearchResultHandler,
  } = useConversationSearchWorkspace({
    selectedUserId,
    selectedRoomId,
    selectedUserIdRef,
    selectedRoomIdRef,
    skipNextAutoScrollRef,
    pendingInitialMessageScrollRef,
    blockOlderMessagesAutoLoadRef,
    applyMessagePagination,
    clearMessageJumpEffects,
    highlightMessageById,
    releaseInitialScrollBlock,
    setHighlightedMessageId,
    setMessages,
    setMessagesError,
  });
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

  useEffect(() => {
    currentUserRef.current = currentUser;
    currentUserIdRef.current = currentUser?.id ?? null;
  }, [currentUser]);

  const [groupSeenModalMessage, setGroupSeenModalMessage] = useState<{ message: Message; seenUsers: User[] } | null>(null);
  const [reactionModalGroups, setReactionModalGroups] = useState<ReactionDetailGroup[] | null>(null);

  const { conversationDrafts } = useConversationDrafts({
    currentUserId: currentUser?.id ?? null,
    selectedUserId,
    selectedRoomId,
    messageInput,
    setMessageInput,
  });

  const {
    pendingMedia,
    mediaUploading,
    setMediaUploading,
    mediaError,
    setMediaError,
    mediaViewerMessage,
    setMediaViewerMessage,
    mediaViewerUrl,
    mediaViewerType,
    lightboxState,
    setLightboxState,
    isDraggingFile,
    setIsDraggingFile,
    mediaFileInputRef,
    docFileInputRef,
    clearPendingMedia,
    handleOpenLightbox,
    handleOpenMediaPicker,
    handleOpenDocPicker,
    handleFileSelected,
    handleMediaFileChange,
    handleClipboardPaste,
    handleVoiceRecorded,
    uploadPendingMedia,
  } = useMediaWorkspace({
    selectedRoomId,
    selectedUserId,
    messages,
    sharedMediaItems,
    setEmojiPickerOpen,
  });

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

  const {
    profileEditorOpen,
    setViewedProfileUser,
    viewedProfileLoading,
    viewedProfileError,
    profileActionError,
    setProfileActionError,
    activeViewedProfileUser,
    clearViewedProfile,
    handleOpenUserProfile,
    handleCloseUserProfile,
    blockedUsers,
    blockedUserIds,
    blockedUsersOpen,
    closeBlockedUsers,
    blockedUsersLoading,
    blockedUsersError,
    blockActionPendingUserId,
    toggleUserBlock,
    handleOpenBlockedUsers,
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
    activeProfileUserIsBlocked,
    selectedUserIsBlocked,
  } = useUserProfileWorkspace({
    currentUser,
    currentUserIdRef,
    users,
    friends,
    selectedUser,
    selectedRoom,
    updateCurrentUser,
    setCurrentUser,
    setUsers,
    setFriends,
    setSelectedUser,
    setRooms,
    setSelectedRoom,
    setProfileMenuOpen,
    loadUsers,
    loadIncomingFriendRequests,
    loadFriendSummary,
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

  useEffect(() => {
    roomSeenByLoadedMessageIdsRef.current.clear();
    setRoomSeenByByMessageId({});
    setSeenByLoadingMessageIds([]);
    setSeenByPopupMessageId(null);
  }, [selectedRoomId, selectedUserId]);

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

  useEffect(() => {
    setEmojiPickerOpen(false);
    setReplyingToMessage(null);
  }, [selectedRoomId, selectedUserId, setEmojiPickerOpen]);

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
    typingTimeoutRef,
    clearOptimisticSendTimeout,
    scheduleOptimisticSendTimeout,
    hideRemoteTyping,
    publishTyping,
    stopTyping,
    publishRoomTyping,
    stopRoomTyping,
    completePendingReadIfAtBottom,
  } = useChatRealtimeWorkspace({
    currentUserId: currentUser?.id ?? null,
    currentUserIdRef,
    selectedUserIdRef,
    selectedRoomIdRef,
    userSearchQueryRef,
    usersRef,
    friendsRef,
    roomsRef,
    messagesRef,
    messagesContainerRef,
    pendingReadConversationRef,
    setCurrentUser,
    setUsers,
    setFriends,
    setRooms,
    setSelectedUser,
    setSelectedRoom,
    setMessages,
    setRemoteTypingUserIds,
    setRoomSeenByByMessageId,
    setUnreadDividerMessageId,
    findKnownUserById,
    loadUsers,
    loadRooms,
    loadIncomingFriendRequests,
    loadFriendSummary,
    loadMessages,
    loadRoomMessages,
    applyRoomMembershipUpdate,
    applyMessageUpdate,
    applyMessageHidden,
    addIncomingSharedContent,
    addPendingUnreadMessage,
    buildMessageNotification,
    buildFriendshipNotification,
    notifyWithBrowserNotification,
    handleCallSignal,
    sendActiveCallCloseSignal,
    stopCallMedia,
  });

  const {
    showScrollToBottom,
    markMessagesScrollIntent,
    handleMessageAssetLoaded,
    handleMessagesScroll,
    handleScrollToBottom,
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

  const handleOpenFriendsPanel = () => {
    navigateIfNeeded(getFriendsRoute());
    setMainView('friends');
    setProfileMenuOpen(false);

    if (userSearchQueryRef.current) {
      handleClearUserSearch();
    }

    void loadUsers({ silent: true, search: '' });
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
    selectedUser, selectedRoom, currentUser, messages, onEditMessage: handleEditMessage,
    hasActiveReply: Boolean(replyingToMessage), onCancelReply: handleCancelReply,
    messageInput, mentionQuery, mentionStartIndex, mentionActiveIndex,
    messageInputRef, messageInputSelectionRef, typingTimeoutRef,
    setMessageInput, setMentionQuery, setMentionStartIndex, setMentionActiveIndex,
    setSlashCommandQuery, setEmojiPickerOpen, canChatWithUser, publishTyping,
    publishRoomTyping, stopTyping, stopRoomTyping,
  });

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

  const handleOpenGlobalSearchResult = createGlobalSearchResultHandler({
    rooms,
    setRooms,
    setUsers,
    findKnownUserById,
    handleRoomSelect,
    handleUserSelect,
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
  const currentUserOnline = Boolean(currentUser?.online);
  const activeCallConversationOpen = Boolean(
    activeCall &&
    selectedUser?.id === activeCall.peer.id &&
    !selectedRoom &&
    mainView === 'chat'
  );
  const canStartPrivateCall = Boolean(selectedUser && canChatWithUser(selectedUser) && !activeCall);
  const selectedConversationName = selectedRoom
    ? selectedRoom.name
    : selectedUser
      ? getUserDisplayName(selectedUser)
      : '';
  const selectedConversationOpen = Boolean(selectedUser || selectedRoom);

  const handleNavigateConversation = (direction: 'prev' | 'next') => {
    if (sidebarConversationItems.length === 0) return;
    const currentIndex = sidebarConversationItems.findIndex((item) =>
      item.type === 'user'
        ? item.user.id === selectedUserId
        : item.room.id === selectedRoomId
    );
    const nextIndex = currentIndex < 0
      ? (direction === 'next' ? 0 : sidebarConversationItems.length - 1)
      : (currentIndex + (direction === 'next' ? 1 : -1) + sidebarConversationItems.length) % sidebarConversationItems.length;
    const targetItem = sidebarConversationItems[nextIndex];
    if (!targetItem) return;
    if (targetItem.type === 'user') {
      void handleUserSelect(targetItem.user);
    } else {
      void handleRoomSelect(targetItem.room);
    }
  };

  useWorkspaceShortcuts({
    selectedConversationOpen,
    setGlobalSearchOpen,
    handleToggleMessageSearch,
    onNavigateConversation: handleNavigateConversation,
  });
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
            <Suspense fallback={null}>
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
            </Suspense>
          ) : mainView === 'requests' ? (
            <Suspense fallback={null}>
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
            </Suspense>
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
              showScrollToBottom={showScrollToBottom}
              unreadCount={(selectedUser?.unreadCount ?? selectedRoom?.unreadCount ?? 0)}
              onScrollToBottom={handleScrollToBottom}
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

        {mainView === 'chat' && selectedConversationOpen && detailsOpen ? (
          <Suspense fallback={null}>
            <RightConversationSidebar
              open={true}
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
          </Suspense>
        ) : null}
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

      <WorkspaceModals
        globalSearchOpen={globalSearchOpen}
        onCloseGlobalSearch={() => setGlobalSearchOpen(false)}
        onOpenGlobalSearchResult={handleOpenGlobalSearchResult}
        activeViewedProfileUser={activeViewedProfileUser}
        viewedProfileLoading={viewedProfileLoading}
        viewedProfileError={viewedProfileError}
        profileActionError={profileActionError}
        friendActionKeys={friendActionKeys}
        callActive={Boolean(activeCall)}
        activeProfileUserIsBlocked={activeProfileUserIsBlocked}
        blockActionPendingUserId={blockActionPendingUserId}
        onCloseUserProfile={handleCloseUserProfile}
        onOpenChatFromProfile={(user) => {
          handleCloseUserProfile();
          void handleUserSelect(user);
        }}
        onStartCallFromProfile={(user, callType) => {
          handleCloseUserProfile();
          openPreCallSetupForUser(user, callType);
        }}
        onSendFriendRequest={(user) => void handleSendFriendRequest(user)}
        onAcceptFriendRequest={(requestId, actionKey) => void handleAcceptFriendRequest(requestId, actionKey)}
        onDeclineFriendRequest={(requestId, actionKey) => void handleDeclineFriendRequest(requestId, actionKey)}
        onCancelFriendRequest={(user) => void handleCancelFriendRequest(user)}
        onUnfriend={(user) => void handleUnfriend(user)}
        onToggleBlock={(user) => void toggleUserBlock(user)}
        blockedUsersOpen={blockedUsersOpen}
        blockedUsers={blockedUsers}
        blockedUsersLoading={blockedUsersLoading}
        blockedUsersError={blockedUsersError}
        onCloseBlockedUsers={closeBlockedUsers}
        profileEditorOpen={profileEditorOpen}
        currentUser={currentUser}
        profileFullName={profileFullName}
        profileBio={profileBio}
        profileAvatarPreview={profileAvatarPreview}
        profileSaving={profileSaving}
        profileError={profileError}
        onCloseProfileEditor={handleCloseProfileEditor}
        onUpdateProfile={handleUpdateProfile}
        onProfileAvatarChange={handleProfileAvatarChange}
        onProfileFullNameChange={(value) => {
          setProfileFullName(value);
          setProfileError('');
        }}
        onProfileBioChange={(value) => {
          setProfileBio(value);
          setProfileError('');
        }}
        createGroupOpen={createGroupOpen}
        friends={friends}
        rooms={rooms}
        groupName={groupName}
        selectedGroupMemberIds={selectedGroupMemberIds}
        groupMemberRequirementText={groupMemberRequirementText}
        groupCreating={groupCreating}
        canCreateGroup={canCreateGroup}
        groupError={groupError}
        onCloseCreateGroup={handleCloseCreateGroup}
        onCreateGroup={handleCreateGroup}
        onGroupNameChange={(value) => {
          setGroupName(value);
          setGroupError('');
        }}
        onToggleGroupMember={handleToggleGroupMember}
        dialogProps={{
          mediaViewerMessage,
          mediaViewerUrl,
          mediaViewerType,
          onCloseMediaViewer: () => setMediaViewerMessage(null),
          conversationDeleteTarget,
          conversationSettingPendingKey,
          conversationSettingsError,
          onCloseConversationDelete: () => setConversationDeleteTarget(null),
          onDeleteConversation: () => void handleDeleteConversation(),
          forwardingMessage,
          messageActionError,
          onDismissMessageActionError: clearMessageActionError,
          editingMessage,
          onCloseEditMessage: () => setEditingMessage(null),
          onSaveEditMessage: saveEditedMessage,
          messageToDeleteForMe,
          onCloseDeleteForMe: () => setMessageToDeleteForMe(null),
          onConfirmDeleteForMe: deleteMessageForMe,
          friends,
          rooms,
          onCloseForward: () => setForwardingMessage(null),
          onForward: sendForwardMessage,
          addMembersModalOpen,
          selectedRoom,
          addMemberCandidates,
          selectedAddMemberIds,
          groupSettingsSaving,
          groupSettingsError,
          onCloseAddMembers: () => {
            setSelectedAddMemberIds([]);
            setAddMembersModalOpen(false);
          },
          onToggleAddMember: handleToggleAddRoomMember,
          onAddMembers: handleAddRoomMembers,
          inviteModalOpen,
          inviteLoading,
          inviteCopied,
          inviteError,
          inviteRevoking,
          canManageInvite: currentUserCanManageSelectedRoom,
          getInviteUrl: getGroupInviteUrl,
          onCloseInvite: () => setInviteModalOpen(false),
          onCopyInvite: () => void handleCopyInviteLink(),
          onRevokeInvite: () => void handleRevokeInviteLink(),
          lightboxState,
          onCloseLightbox: () => setLightboxState(null),
          onSelectLightboxIndex: (index) => setLightboxState((current) => current ? { ...current, index } : null),
          groupSeenModalMessage,
          onCloseGroupSeen: () => setGroupSeenModalMessage(null),
          reactionModalGroups,
          onCloseReactionSummary: () => setReactionModalGroups(null),
        }}
      />

    </div>
  );
}
