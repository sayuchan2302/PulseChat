import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../config/constants';
import type {
  ChatRoom,
  ConversationSetting,
  Friendship,
  FriendshipSummary,
  GroupInviteResponse,
  GroupMemberRole,
  Message,
  User,
} from '../types';
import { apiClient } from '../services/api';
import { useAuth } from '../context/useAuth';
import { wsService } from '../services/websocket';
import { soundService } from '../services/soundService';
import { dbService } from '../services/dbService';
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
import { useGroupInvite } from '../hooks/useGroupInvite';
import { useRealtimeEventHandlers } from '../hooks/useRealtimeEventHandlers';
import { useIncomingMessageRecovery } from '../hooks/useIncomingMessageRecovery';
import { useIncomingMessageHandler } from '../hooks/useIncomingMessageHandler';
import { useFriendshipActions } from '../hooks/useFriendshipActions';
import { useGroupMemberActions } from '../hooks/useGroupMemberActions';
import { useGroupAvatar } from '../hooks/useGroupAvatar';
import { useGroupSettingsActions } from '../hooks/useGroupSettingsActions';
import { useGroupCreation } from '../hooks/useGroupCreation';
import { useCallFeature } from '../hooks/useCallFeature';
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
import {
  USER_SEARCH_DEBOUNCE_MS,
  LOAD_OLDER_SCROLL_THRESHOLD, READ_BOTTOM_THRESHOLD, AUTO_SCROLL_BOTTOM_THRESHOLD,
  MIN_GROUP_MEMBERS, MIN_GROUP_INVITED_MEMBERS,
  MAX_AVATAR_SIZE_BYTES, MAX_AVATAR_SIZE_MB,
  ACCEPTED_AVATAR_TYPES, MEDIA_ACCEPT,
  CONVERSATION_FILTERS,
} from '../constants/chatConstants';
import type {
  ChatMessage,
  PendingMedia,
  MainView, ConversationFilter, RoomSummaryResponse,
  ConversationTarget,
} from '../types/chat.types';
import {
  toDeliveredMessage,
  mergeKnownMessageUpdate,
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
  applyConversationSettingToUser, applyConversationSettingToRoom,
  canChatWithUser,
  getTypingIndicatorLabel,

  shouldOpenConversationDetailsByDefault, matchesFriendSearch,
} from '../utils/userUtils';
import {
  hasPrivateConversation,
  sortRoomsByChatActivity, buildSidebarConversationItems,
  isRoomParticipant, appendOrUpdateRoom, compareUsersByChatActivity,
  applyRoomPreviewToRoom,
  applyConversationPreviewToUser, applyConversationPreviewToUsers,
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
import DetailsSidebar from '../components/chat/DetailsSidebar';
import { FriendsPanel, FriendRequestsPanel } from '../components/chat/PeoplePanels';
import ProfileViewerModal from '../components/chat/ProfileViewerModal';
import ProfileEditorModal from '../components/chat/ProfileEditorModal';
import CreateGroupModal from '../components/chat/CreateGroupModal';
import SidebarContent from '../components/chat/SidebarContent';
import GroupMemberListItem from '../components/chat/GroupMemberListItem';
import ConversationPane from '../components/chat/ConversationPane';
import CallModalLayer from '../components/chat/CallModalLayer';
import ChatDialogLayer from '../components/chat/ChatDialogLayer';
import MessageContent from '../components/chat/MessageContent';
import SearchSidebar from '../components/chat/SearchSidebar';
import MessageReactions from '../components/chat/MessageReactions';
import CallMessageBody from '../components/chat/CallMessageBody';
import MessageActions from '../components/chat/MessageActions';
import GroupSeenBy from '../components/chat/GroupSeenBy';
import SharedContentSections from '../components/chat/SharedContentSections';
import type { LightboxMediaItem } from '../components/chat/MediaLightbox';
import type { ReactionDetailGroup } from '../components/chat/ReactionSummaryModal';
import { buildMessageListItems } from '../utils/messageListUtils';
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
  const [roomSummary, setRoomSummary] = useState<RoomSummaryResponse | null>(null);
  const [roomSummaryRoomId, setRoomSummaryRoomId] = useState<number | null>(null);
  const [roomSummaryLoading, setRoomSummaryLoading] = useState(false);
  const [roomSummaryError, setRoomSummaryError] = useState('');
  const roomSummaryRequestRef = useRef(0);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const [mentionActiveIndex, setMentionActiveIndex] = useState<number>(0);
  const [slashCommandQuery, setSlashCommandQuery] = useState<string | null>(null);
  const [soundMuted, setSoundMuted] = useState(() => soundService.isMuted());

  useEffect(() => {
    return soundService.onMuteChange((muted) => setSoundMuted(muted));
  }, []);

  useEffect(() => {
    roomSummaryRequestRef.current += 1;
    setRoomSummary(null);
    setRoomSummaryRoomId(null);
    setRoomSummaryLoading(false);
    setRoomSummaryError('');
  }, [selectedRoom?.id]);

  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [mediaViewerMessage, setMediaViewerMessage] = useState<ChatMessage | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
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
  const [openConversationMenuKey, setOpenConversationMenuKey] = useState<string | null>(null);
  const [conversationSettingPendingKey, setConversationSettingPendingKey] = useState<string | null>(null);
  const [conversationSettingsError, setConversationSettingsError] = useState('');
  const [conversationDeleteTarget, setConversationDeleteTarget] = useState<ConversationTarget | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<Friendship[]>([]);
  const [friendSummary, setFriendSummary] = useState<FriendshipSummary>({
    incomingCount: 0,
    outgoingCount: 0,
  });
  const [friendActionKeys, setFriendActionKeys] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<number[]>([]);
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [groupSettingsName, setGroupSettingsName] = useState('');
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState<number[]>([]);
  const [addMembersModalOpen, setAddMembersModalOpen] = useState(false);
  const [groupMemberNicknames, setGroupMemberNicknames] = useState<Record<number, string>>({});
  const [openGroupMemberMenuId, setOpenGroupMemberMenuId] = useState<number | null>(null);
  const [editingGroupMemberNicknameId, setEditingGroupMemberNicknameId] = useState<number | null>(
    null
  );
  const [groupSettingsPendingAction, setGroupSettingsPendingAction] = useState<string | null>(null);
  const [groupSettingsError, setGroupSettingsError] = useState('');
  const [groupAvatarUploading, setGroupAvatarUploading] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [groupInviteData, setGroupInviteData] = useState<GroupInviteResponse | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteRevoking, setInviteRevoking] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [groupMembersExpanded, setGroupMembersExpanded] = useState(false);
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
  const [profileFullName, setProfileFullName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [profileAvatarPreview, setProfileAvatarPreview] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(shouldOpenConversationDetailsByDefault);
  const currentUserRef = useRef<User | null>(null);
  const currentUserIdRef = useRef<number | null>(null);
  const selectedUserIdRef = useRef<number | null>(null);
  const selectedRoomIdRef = useRef<number | null>(null);
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
  const optimisticMessageIdRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const realtimeActiveRef = useRef(false);
  const hasLoadedInitialUsersRef = useRef(false);
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
    scrollToMessageById,
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
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
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

  const handleOpenLightbox = useCallback((url: string, type: 'IMAGE' | 'VIDEO', fileName?: string) => {
    setLightboxState({
      items: [{ url, type, fileName }],
      index: 0,
    });
  }, []);

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

  useEffect(() => {
    setGroupSettingsName(selectedRoom?.name ?? '');
    setIsEditingGroupName(false);
    setSelectedAddMemberIds([]);
    setGroupMemberNicknames(
      Object.fromEntries(
        selectedRoom?.participants.map((participant) => [
          participant.id,
          participant.nickname ?? '',
        ]) ?? []
      )
    );
    setOpenGroupMemberMenuId(null);
    setEditingGroupMemberNicknameId(null);
    setGroupSettingsError('');
  }, [selectedRoom?.id, selectedRoom?.name, selectedRoom?.participants]);

  useEffect(() => {
    dbService.getConversationsCache('conversations_cache').then((cached) => {
      if (cached && cached.rooms && cached.users) {
        setRooms((prev) => (prev.length === 0 ? cached.rooms : prev));
        setUsers((prev) => (prev.length === 0 ? cached.users : prev));
      }
    }).catch(() => { });
  }, []);

  useEffect(() => {
    if (rooms.length > 0 || users.length > 0) {
      void dbService.saveConversationsCache('conversations_cache', { rooms, users });
    }
  }, [rooms, users]);

  useEffect(() => {
    if (messages.length > 0) {
      const key = selectedUser ? `user_${selectedUser.id}` : selectedRoom ? `room_${selectedRoom.id}` : null;
      if (key) {
        void dbService.saveMessagesCache(key, messages);
      }
    }
  }, [messages, selectedUser, selectedRoom]);

  const resetMessageSearchState = useCallback(() => {
    messageSearchQueryRef.current = '';
    messageSearchRequestedQueryRef.current = '';
    clearMessageSearch();
    setActiveMessageSearchId(null);
    setHighlightedMessageId(null);
  }, [clearMessageSearch, setActiveMessageSearchId, setHighlightedMessageId]);

  const getNextOptimisticMessageId = () => {
    optimisticMessageIdRef.current -= 1;
    return optimisticMessageIdRef.current;
  };

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

  const markMessagesScrollIntent = useCallback(() => {
    hasUserInteractedWithMessagesRef.current = true;
  }, [hasUserInteractedWithMessagesRef]);

  const handleMessageAssetLoaded = useCallback(() => {
    if (
      hasUserInteractedWithMessagesRef.current ||
      pendingReadConversationRef.current ||
      (selectedUserIdRef.current === null && selectedRoomIdRef.current === null)
    ) {
      return;
    }

    forceScrollToLatestMessage();
    if (blockOlderMessagesAutoLoadRef.current) {
      releaseInitialScrollBlock();
    }
  }, [
    blockOlderMessagesAutoLoadRef,
    forceScrollToLatestMessage,
    hasUserInteractedWithMessagesRef,
    pendingReadConversationRef,
    releaseInitialScrollBlock,
  ]);

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (container) {
      completePendingReadIfAtBottom();
    }

    if (
      !container ||
      !hasUserInteractedWithMessagesRef.current ||
      blockOlderMessagesAutoLoadRef.current ||
      messagesLoading ||
      olderMessagesLoading ||
      container.scrollTop > LOAD_OLDER_SCROLL_THRESHOLD
    ) {
      return;
    }

    void loadOlderMessages();
  };

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) {
      return undefined;
    }

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

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
    if (profileAvatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(profileAvatarPreview);
    }
  }, [profileAvatarPreview]);

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
  }, [selectedRoomId, selectedUserId]);

  useEffect(() => {
    if (!emojiPickerOpen) {
      return;
    }

    const handleOutsidePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        emojiPickerRef.current?.contains(target) ||
        emojiButtonRef.current?.contains(target)
      ) {
        return;
      }

      setEmojiPickerOpen(false);
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEmojiPickerOpen(false);
        messageInputRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleOutsidePointerDown);
    document.addEventListener('touchstart', handleOutsidePointerDown);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('mousedown', handleOutsidePointerDown);
      document.removeEventListener('touchstart', handleOutsidePointerDown);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [emojiPickerOpen]);

  useEffect(() => {
    if (!openConversationMenuKey) {
      return undefined;
    }

    const closeConversationMenu = () => setOpenConversationMenuKey(null);
    const handleConversationMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenConversationMenuKey(null);
      }
    };

    document.addEventListener('click', closeConversationMenu);
    document.addEventListener('keydown', handleConversationMenuKeyDown);

    return () => {
      document.removeEventListener('click', closeConversationMenu);
      document.removeEventListener('keydown', handleConversationMenuKeyDown);
    };
  }, [openConversationMenuKey]);

  useEffect(() => {
    setOpenConversationMenuKey(null);
  }, [conversationFilter, selectedRoomId, selectedUserId, userSearchQuery]);

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

  const applyRoomMembershipUpdate = useCallback((room: ChatRoom) => {
    if (!isRoomParticipant(room, currentUserIdRef.current)) {
      setRooms((currentRooms) => currentRooms.filter((currentRoom) => currentRoom.id !== room.id));

      if (selectedRoomIdRef.current === room.id) {
        selectedRoomIdRef.current = null;
        setSelectedRoom(null);
        setMessages([]);
        setMessageInput('');
        setMainView('chat');
        resetMessagePagination();
        navigate(getChatRoute(), { replace: true });
      }

      return;
    }

    setRooms((currentRooms) => appendOrUpdateRoom(currentRooms, room));
    setSelectedRoom((currentSelectedRoom) =>
      currentSelectedRoom?.id === room.id ? room : currentSelectedRoom
    );
  }, [navigate, resetMessagePagination]);

  const applyMessageUpdate = useCallback((updatedMessage: Message) => {
    setMessages((currentMessages) => mergeKnownMessageUpdate(currentMessages, updatedMessage));
    updateSharedContentFromMessage(updatedMessage);
    if (updatedMessage.recalled && updatedMessage.chatRoomId) {
      roomSeenByLoadedMessageIdsRef.current.delete(updatedMessage.id);
      setRoomSeenByByMessageId((currentSeenBy) => {
        if (!currentSeenBy[updatedMessage.id]) {
          return currentSeenBy;
        }

        const nextSeenBy = { ...currentSeenBy };
        delete nextSeenBy[updatedMessage.id];
        return nextSeenBy;
      });
      setSeenByPopupMessageId((currentMessageId) =>
        currentMessageId === updatedMessage.id ? null : currentMessageId
      );
    }
    setReplyingToMessage((currentReplyingMessage) =>
      currentReplyingMessage?.id === updatedMessage.id
        ? { ...currentReplyingMessage, ...toDeliveredMessage(updatedMessage) }
        : currentReplyingMessage
    );

    if (updatedMessage.chatRoomId) {
      setRooms((currentRooms) => {
        let didUpdate = false;
        const nextRooms = currentRooms.map((room) => {
          const nextRoom = applyRoomPreviewToRoom(room, updatedMessage);
          didUpdate ||= nextRoom !== room;
          return nextRoom;
        });

        return didUpdate ? sortRoomsByChatActivity(nextRooms) : currentRooms;
      });
      setSelectedRoom((currentSelectedRoom) =>
        currentSelectedRoom ? applyRoomPreviewToRoom(currentSelectedRoom, updatedMessage) : null
      );
      return;
    }

    setUsers((currentUsers) =>
      applyConversationPreviewToUsers(
        currentUsers,
        updatedMessage,
        currentUserIdRef.current,
        !userSearchQueryRef.current.trim()
      )
    );
    setFriends((currentFriends) =>
      applyConversationPreviewToUsers(currentFriends, updatedMessage, currentUserIdRef.current, true)
    );
    setSelectedUser((currentSelectedUser) =>
      currentSelectedUser
        ? applyConversationPreviewToUser(currentSelectedUser, updatedMessage, currentUserIdRef.current)
        : null
    );
  }, [updateSharedContentFromMessage]);

  const applyConversationSetting = useCallback((setting: ConversationSetting) => {
    if (setting.targetUserId) {
      setUsers((currentUsers) =>
        [...currentUsers.map((user) => applyConversationSettingToUser(user, setting))]
          .sort(compareUsersByChatActivity)
      );
      setFriends((currentFriends) =>
        [...currentFriends.map((friend) => applyConversationSettingToUser(friend, setting))]
          .sort(compareUsersByChatActivity)
      );
      setSelectedUser((currentSelectedUser) =>
        currentSelectedUser
          ? applyConversationSettingToUser(currentSelectedUser, setting)
          : currentSelectedUser
      );
      return;
    }

    if (setting.chatRoomId) {
      setRooms((currentRooms) =>
        sortRoomsByChatActivity(
          currentRooms.map((room) => applyConversationSettingToRoom(room, setting))
        )
      );
      setSelectedRoom((currentSelectedRoom) =>
        currentSelectedRoom
          ? applyConversationSettingToRoom(currentSelectedRoom, setting)
          : currentSelectedRoom
      );
    }
  }, []);

  const realtimeEventHandlers = useRealtimeEventHandlers({
    realtimeActiveRef, hasConnectedRef, currentUserIdRef, selectedUserIdRef, selectedRoomIdRef,
    messagesContainerRef, isMessagesContainerNearBottom, readBottomThreshold: READ_BOTTOM_THRESHOLD,
    setCurrentUser, setUsers, setFriends, setSelectedUser, setMessages, showRemoteTyping,
    hideRemoteTyping, getBrowserAwareConnectionStatus, loadUsers, loadRooms,
    loadIncomingFriendRequests, loadFriendSummary, loadMessages, loadRoomMessages,
    markConversationAsRead, markRoomAsRead, applyRoomMembershipUpdate,
    buildFriendshipNotification, notifyWithBrowserNotification, applyMessageUpdate,
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

  useLayoutEffect(() => {
    if (
      (selectedUserId === null && selectedRoomId === null) ||
      messagesLoading ||
      olderMessagesLoading
    ) {
      return;
    }

    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }

    const isInitialScroll = pendingInitialMessageScrollRef.current;
    if (isInitialScroll) {
      const scrolledToUnread =
        unreadDividerMessageIdRef.current !== null && scrollToUnreadDivider();
      if (!scrolledToUnread) {
        forceScrollToLatestMessage();
      }

      pendingInitialMessageScrollRef.current = false;
      releaseInitialScrollBlock();
      window.requestAnimationFrame(() => {
        completePendingReadIfAtBottom();
      });
      return;
    }

    const container = messagesContainerRef.current;
    const shouldAutoScroll =
      (!hasUserInteractedWithMessagesRef.current && !pendingReadConversationRef.current) ||
      isMessagesContainerNearBottom(container, AUTO_SCROLL_BOTTOM_THRESHOLD);

    if (!shouldAutoScroll) {
      completePendingReadIfAtBottom();
      return;
    }

    scrollToLatestMessage('smooth');
    window.requestAnimationFrame(() => {
      completePendingReadIfAtBottom();
    });
  }, [
    completePendingReadIfAtBottom,
    forceScrollToLatestMessage,
    releaseInitialScrollBlock,
    messages.length,
    messagesLoading,
    olderMessagesLoading,
    scrollToLatestMessage,
    scrollToUnreadDivider,
    selectedRoomId,
    selectedUserId,
    remoteTypingUserIds.length,
    unreadDividerMessageId,
    hasUserInteractedWithMessagesRef,
    messagesContainerRef,
    pendingInitialMessageScrollRef,
    pendingReadConversationRef,
    skipNextAutoScrollRef,
    unreadDividerMessageIdRef,
  ]);

  const { sendOptimisticMessage, sendOptimisticRoomMessage } = useMessageTransport({
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

  const handleUserSelect = (user: User) => {
    if (!canOpenDirectConversation(user)) {
      return;
    }

    navigateIfNeeded(getUserChatRoute(user.username));
    activateUserConversation(user);
  };

  const handleRoomSelect = (room: ChatRoom) => {
    navigateIfNeeded(getRoomChatRoute(room.id));
    activateRoomConversation(room);
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

  const getCallMessagePeer = useCallback((message: ChatMessage) => {
    if (message.chatRoomId) {
      return null;
    }

    if (
      selectedUser &&
      (message.senderId === selectedUser.id || message.receiverId === selectedUser.id)
    ) {
      return selectedUser;
    }

    const currentAccountId = currentUser?.id ?? null;
    const peerId =
      currentAccountId !== null && message.senderId === currentAccountId
        ? message.receiverId
        : message.senderId;

    return peerId ? findKnownUserById(peerId) : null;
  }, [currentUser?.id, findKnownUserById, selectedUser]);

  const handleCallBackFromMessage = useCallback((message: ChatMessage) => {
    const peer = getCallMessagePeer(message);
    if (!peer) {
      return;
    }

    openPreCallSetupForUser(peer, message.callType ?? 'AUDIO');
  }, [getCallMessagePeer, openPreCallSetupForUser]);

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

  const handleToggleProfileMenu = () => {
    setProfileMenuOpen((currentOpen) => !currentOpen);
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

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }

      if (lightboxState) {
        setLightboxState(null);
      } else if (conversationDeleteTarget && conversationSettingPendingKey === null) {
        setConversationDeleteTarget(null);
      } else if (groupSeenModalMessage) {
        setGroupSeenModalMessage(null);
      } else if (reactionModalGroups) {
        setReactionModalGroups(null);
      } else if (mediaViewerMessage) {
        setMediaViewerMessage(null);
      } else if (forwardingMessage) {
        setForwardingMessage(null);
      } else if (addMembersModalOpen) {
        setAddMembersModalOpen(false);
      } else if (inviteModalOpen) {
        setInviteModalOpen(false);
      } else if (detailsOpen) {
        setDetailsOpen(false);
      } else if (profileMenuOpen) {
        setProfileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [
    detailsOpen,
    addMembersModalOpen,
    conversationDeleteTarget,
    conversationSettingPendingKey,
    forwardingMessage,
    groupSeenModalMessage,
    inviteModalOpen,
    lightboxState,
    mediaViewerMessage,
    profileMenuOpen,
    reactionModalGroups,
  ]);

  const handleOpenCreateGroup = () => {
    navigateIfNeeded(getChatRoute());
    setMainView('chat');
    setProfileMenuOpen(false);
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
    setGroupError('');
    setSelectedGroupMemberIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((currentId) => currentId !== userId)
        : [...currentIds, userId]
    );
  };

  const handleCreateGroup = useGroupCreation({
    name: groupName, memberIds: selectedGroupMemberIds, minimumInvitedMembers: MIN_GROUP_INVITED_MEMBERS,
    selectedUserIdRef, selectedRoomIdRef, stopTyping, stopRoomTyping,
    navigateToRoom: (roomId) => navigateIfNeeded(getRoomChatRoute(roomId)),
    shouldOpenDetails: shouldOpenConversationDetailsByDefault, resetMessagePagination,
    setRooms, setSelectedUser, setSelectedRoom, setDetailsOpen, setMessages, setMessageInput,
    setOpen: setCreateGroupOpen, setName: setGroupName, setMemberIds: setSelectedGroupMemberIds,
    setCreating: setGroupCreating, setError: setGroupError,
  });

  const handleToggleAddRoomMember = (userId: number) => {
    setGroupSettingsError('');
    setSelectedAddMemberIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((currentId) => currentId !== userId)
        : [...currentIds, userId]
    );
  };

  const { handleUpdateGroupSettingsName, handleAddRoomMembers } = useGroupSettingsActions({
    selectedRoom, pendingAction: groupSettingsPendingAction, groupName: groupSettingsName,
    selectedAddMemberIds, applyRoomMembershipUpdate, setPendingAction: setGroupSettingsPendingAction,
    setError: setGroupSettingsError, setEditingName: setIsEditingGroupName,
    setSelectedAddMemberIds, setAddMembersModalOpen,
  });

  const {
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
  } = useGroupMemberActions({
    selectedRoom, groupSettingsPendingAction, groupMemberNicknames, selectedRoomIdRef,
    setGroupSettingsError, setGroupSettingsPendingAction, setOpenGroupMemberMenuId,
    setEditingGroupMemberNicknameId, setGroupMemberNicknames, setRooms, setSelectedRoom,
    setMessages, applyRoomMembershipUpdate, navigateToChat: () => navigateIfNeeded(getChatRoute()),
  });

  const handleToggleConversationMenu = (
    targetKey: string,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    setConversationSettingsError('');
    setOpenConversationMenuKey((currentKey) => (currentKey === targetKey ? null : targetKey));
  };

  const handleUpdateConversationSetting = async (
    target: ConversationTarget,
    patch: Partial<Pick<ConversationSetting, 'pinned' | 'muted' | 'archived'>>
  ) => {
    const targetKey =
      target.type === 'user'
        ? `user-${target.user.id}`
        : `room-${target.room.id}`;
    const endpoint =
      target.type === 'user'
        ? `/conversation-settings/private/${target.user.id}`
        : `/conversation-settings/rooms/${target.room.id}`;

    setConversationSettingPendingKey(targetKey);
    setConversationSettingsError('');

    try {
      const response = await apiClient.patch<ConversationSetting>(endpoint, patch);
      applyConversationSetting(response.data);
      setOpenConversationMenuKey(null);
    } catch (error) {
      console.error('Failed to update conversation setting:', error);
      setConversationSettingsError('Unable to update conversation settings.');
    } finally {
      setConversationSettingPendingKey(null);
    }
  };

  const {
    handleOpenInviteModal,
    handleRevokeInviteLink,
    getGroupInviteUrl,
    handleCopyInviteLink,
  } = useGroupInvite({
    selectedRoom, groupInviteData, inviteRevoking, setInviteModalOpen, setInviteLoading,
    setInviteRevoking, setInviteError, setInviteCopied, setGroupInviteData,
  });

  const {
    handleReplyToMessage, handleCancelReply, handleCopyMessage,
    handleReactToMessage, handleRecallMessage, handlePinMessage,
    handleUnpinMessage, handleForwardMessage, sendForwardMessage,
  } = useMessageActions({
    currentUser, selectedUser, selectedRoom, replyingToMessage, forwardingMessage,
    messageInputRef, setReplyingToMessage, setForwardingMessage, setPinnedMessage,
    setEmojiPickerOpen, setMessagesError, applyMessageUpdate,
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
    handleOpenMediaPicker, handleOpenDocPicker, handleFileSelected, handleMediaFileChange,
  } = useMediaPicker({
    mediaFileInputRef, docFileInputRef, setEmojiPickerOpen, setMediaError, setPendingMedia,
    getPendingMediaType, getMediaSizeError,
  });

  const { uploadPendingMedia } = useMediaUpload(
    getMediaUrl, getFileFormat, cloudinaryResultToMedia,
  );

  const handleGroupAvatarChange = useGroupAvatar({
    selectedRoom, groupSettingsPendingAction, acceptedTypes: ACCEPTED_AVATAR_TYPES,
    maxBytes: MAX_AVATAR_SIZE_BYTES, maxSizeMb: MAX_AVATAR_SIZE_MB, uploadPendingMedia,
    applyRoomMembershipUpdate, setUploading: setGroupAvatarUploading, setError: setGroupSettingsError,
  });

  const handleVoiceRecorded = useVoiceMessage(setPendingMedia);

  const handleMessageInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) =>
    handleComposerKeyDown(event, slashCommandQuery);

  const { handleSendMessage, handleRetryMessage } = useMessageSending({
    currentUser, selectedUser, selectedRoom, messageInput, pendingMedia, mediaUploading,
    replyingToMessage, roomSummaryLoading, roomSummaryRequestRef, userSearchQueryRef,
    uploadPendingMedia, getNextOptimisticMessageId, clearPendingMedia, stopTyping, stopRoomTyping,
    sendOptimisticMessage, sendOptimisticRoomMessage, setMessageInput, setEmojiPickerOpen,
    setReplyingToMessage, setMediaUploading, setMediaError, setMessagesError, setMessages,
    setUsers, setFriends, setSelectedUser, setRooms, setSelectedRoom, setRoomSummary,
    setRoomSummaryRoomId, setRoomSummaryError, setRoomSummaryLoading,
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
    handleOpenProfileEditor,
    handleCloseProfileEditor,
    handleProfileAvatarChange,
    handleUpdateProfile,
  } = useProfileEditor({
    currentUser, profileFullName, profileBio, profileAvatarFile, profileSaving, getAvatarUrl,
    applyUpdatedCurrentUserProfile, setProfileFullName, setProfileBio, setProfileAvatarFile,
    setProfileAvatarPreview, setProfileSaving, setProfileError, setProfileMenuOpen,
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
  const selectedInvitedMemberCount = selectedGroupMemberIds.length;
  const hasMinimumInvitedMembers = selectedInvitedMemberCount >= MIN_GROUP_INVITED_MEMBERS;
  const groupMemberRequirementText = hasMinimumInvitedMembers
    ? `${selectedInvitedMemberCount + 1} members total`
    : `${selectedInvitedMemberCount} of ${MIN_GROUP_INVITED_MEMBERS} friends selected`;
  const canCreateGroup = Boolean(groupName.trim()) && hasMinimumInvitedMembers && !groupCreating;
  const selectedRoomOwnerId = selectedRoom?.ownerId ?? null;
  const selectedRoomOwner = selectedRoom?.participants.find(
    (participant) => participant.id === selectedRoomOwnerId
  );
  const selectedRoomOwnerName =
    getUserDisplayName(selectedRoomOwner ?? null) ||
    selectedRoom?.ownerFullName?.trim() ||
    selectedRoom?.ownerUsername ||
    '';
  const currentUserMemberRole = useMemo<GroupMemberRole | null>(() => {
    if (!selectedRoom || !currentUser) return null;
    if (selectedRoom.ownerId === currentUser.id) return 'OWNER';
    const member = selectedRoom.participants.find((participant) => participant.id === currentUser.id);
    return member?.role ?? 'MEMBER';
  }, [selectedRoom, currentUser]);

  const isCurrentUserOwner = currentUserMemberRole === 'OWNER';
  const isCurrentUserModerator = currentUserMemberRole === 'MODERATOR';
  const currentUserCanManageSelectedRoom = isCurrentUserOwner || isCurrentUserModerator;
  const groupSettingsSaving = groupSettingsPendingAction !== null;
  const selectedRoomParticipantIds = new Set(
    selectedRoom?.participants.map((participant) => participant.id) ?? []
  );
  const addMemberCandidates = friends.filter(
    (friend) => !selectedRoomParticipantIds.has(friend.id)
  );
  const canSaveGroupSettingsName = Boolean(
    currentUserCanManageSelectedRoom &&
    groupSettingsName.trim() &&
    selectedRoom &&
    groupSettingsName.trim() !== selectedRoom.name.trim() &&
    !groupSettingsSaving
  );
  const canKickMember = useCallback(
    (user: User) => {
      if (!selectedRoom || !currentUser || groupSettingsSaving) return false;
      if (user.id === currentUser.id) return false;
      if (selectedRoom.participants.length <= MIN_GROUP_MEMBERS) return false;
      if (isCurrentUserOwner) return true;
      if (isCurrentUserModerator) {
        return user.role !== 'OWNER' && user.role !== 'MODERATOR' && user.id !== selectedRoom.ownerId;
      }
      return false;
    },
    [selectedRoom, currentUser, groupSettingsSaving, isCurrentUserOwner, isCurrentUserModerator]
  );
  const sidebarBusy = hasUserSearch ? usersLoading : usersLoading || roomsLoading;
  const messageListItems = buildMessageListItems(
    messages,
    selectedRoom,
    currentUser?.id ?? null,
    unreadDividerMessageId
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

    const result: Record<number, User[]> = {};
    const placedUserIds = new Set<number>();

    // Iterate backwards through messages so only the latest read message claims each reader's avatar
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const msg = messages[index];
      if (!msg || msg.id <= 0 || msg.recalled) {
        continue;
      }

      const readers = roomSeenByByMessageId[msg.id];
      if (!readers || readers.length === 0) {
        continue;
      }

      const uniqueLatestReaders: User[] = [];
      for (const reader of readers) {
        if (!placedUserIds.has(reader.id)) {
          placedUserIds.add(reader.id);
          uniqueLatestReaders.push(reader);
        }
      }

      if (uniqueLatestReaders.length > 0) {
        result[msg.id] = uniqueLatestReaders;
      }
    }

    return result;
  }, [messages, roomSeenByByMessageId, selectedRoom]);
  const mediaViewerUrl = getMediaUrl(mediaViewerMessage?.mediaUrl);
  const mediaViewerType = mediaViewerMessage ? getMessageType(mediaViewerMessage) : 'IMAGE';
  const activeReplyPreview = createReplyFromMessage(replyingToMessage);

  const handleOpenReactionSummary = (message: ChatMessage) => {
    if (!message.reactions || message.reactions.length === 0) return;
    const map = new Map<string, User[]>();
    for (const r of message.reactions) {
      const userObj: User = {
        id: r.userId,
        username: r.username,
        fullName: r.fullName,
        email: '',
        online: false,
        createdAt: r.createdAt,
      };
      const list = map.get(r.emoji) || [];
      list.push(userObj);
      map.set(r.emoji, list);
    }
    const groups: ReactionDetailGroup[] = Array.from(map.entries()).map(([emoji, users]) => ({
      emoji,
      users,
    }));
    setReactionModalGroups(groups);
  };

  const renderMessageReactions = (message: ChatMessage) => (
    <MessageReactions
      message={message}
      currentUserId={currentUser?.id ?? null}
      onReact={(target, emoji) => void handleReactToMessage(target, emoji)}
      onOpenSummary={handleOpenReactionSummary}
    />
  );

  const renderMessageActions = (message: ChatMessage, isSentByCurrentUser: boolean) => (
    <MessageActions
      message={message} isSentByCurrentUser={isSentByCurrentUser}
      currentUserId={currentUser?.id ?? null} pinnedMessage={pinnedMessage}
      onReact={(target, emoji) => void handleReactToMessage(target, emoji)}
      onReply={handleReplyToMessage} onCopy={(target) => void handleCopyMessage(target)}
      onRecall={(target) => void handleRecallMessage(target)} onPin={(target) => void handlePinMessage(target)}
      onForward={handleForwardMessage}
    />
  );

  const renderCallMessageBody = (message: ChatMessage) => {
    const peer = getCallMessagePeer(message);
    return (
      <CallMessageBody
        message={message}
        peer={peer}
        canCallBack={Boolean(peer && canChatWithUser(peer) && !activeCall)}
        onCallBack={handleCallBackFromMessage}
      />
    );
  };

  const renderMessageBody = (message: ChatMessage) => (
    <MessageContent
      message={message}
      onOpenLightbox={handleOpenLightbox}
      onAssetLoaded={handleMessageAssetLoaded}
    />
  );

  const renderGroupSeenBy = (message: ChatMessage, users: User[]) => (
    <GroupSeenBy
      message={message}
      users={users}
      open={seenByPopupMessageId === message.id}
      onOpenModal={(target, seenUsers) => setGroupSeenModalMessage({ message: target, seenUsers })}
    />
  );

  const handleDeleteConversation = async () => {
    if (!conversationDeleteTarget) {
      return;
    }

    const target = conversationDeleteTarget;
    const targetKey = target.type === 'user' ? `user-${target.user.id}` : `room-${target.room.id}`;
    const endpoint = target.type === 'user'
      ? `/conversation-settings/private/${target.user.id}`
      : `/conversation-settings/rooms/${target.room.id}`;

    setConversationSettingPendingKey(targetKey);
    setConversationSettingsError('');

    try {
      await apiClient.delete(endpoint);
      setOpenConversationMenuKey(null);
      setConversationDeleteTarget(null);

      if (target.type === 'user') {
        setUsers((currentUsers) => currentUsers.filter((user) => user.id !== target.user.id));
        if (selectedUserIdRef.current === target.user.id) {
          clearSelectedConversation();
          navigateIfNeeded(getChatRoute());
        }
      } else {
        setRooms((currentRooms) => currentRooms.filter((room) => room.id !== target.room.id));
        if (selectedRoomIdRef.current === target.room.id) {
          clearSelectedConversation();
          navigateIfNeeded(getChatRoute());
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      setConversationSettingsError('Unable to delete this conversation.');
    } finally {
      setConversationSettingPendingKey(null);
    }
  };

  const renderDetailsMemberItem = (user: User) => (
    <GroupMemberListItem
      key={user.id}
      user={user}
      currentUserId={currentUser?.id ?? null}
      ownerId={selectedRoomOwnerId}
      currentUserIsOwner={isCurrentUserOwner}
      saving={groupSettingsSaving}
      pendingAction={groupSettingsPendingAction}
      nicknameValue={groupMemberNicknames[user.id] ?? ''}
      menuOpen={openGroupMemberMenuId === user.id}
      editingNickname={editingGroupMemberNicknameId === user.id}
      canKick={canKickMember(user)}
      onToggleMenu={handleToggleGroupMemberMenu}
      onOpenProfile={(member) => {
        setOpenGroupMemberMenuId(null);
        void handleOpenUserProfile(member);
      }}
      onStartEditNickname={handleStartEditGroupMemberNickname}
      onUpdateRole={(member, role) => void handleUpdateMemberRole(member, role)}
      onTransferOwner={(member) => void handleTransferRoomOwner(member)}
      onKick={(member) => void handleKickRoomMember(member)}
      onNicknameChange={handleGroupMemberNicknameChange}
      onSaveNickname={(member) => void handleUpdateRoomMemberNickname(member)}
      onCancelNicknameEdit={handleCancelEditGroupMemberNickname}
    />
  );

  const renderSearchSidebar = () => {
    const query = messageSearchQuery.trim();
    const showInitialSearchLoading =
      messageSearchLoading && messageSearchItems.length === 0;
    const conversationName = selectedUser
      ? getUserDisplayName(selectedUser)
      : selectedRoom?.name || 'conversation';

    return (
      <SearchSidebar
        conversationName={conversationName}
        handleCloseConversationDetails={handleCloseConversationDetails}
        handleMessageSearchSubmit={handleMessageSearchSubmit}
        messageSearchInputRef={messageSearchInputRef}
        messageSearchQuery={messageSearchQuery}
        handleMessageSearchChange={handleMessageSearchChange}
        handleMessageSearchInputKeyDown={handleMessageSearchInputKeyDown}
        handleClearMessageSearch={handleClearMessageSearch}
        messageSearchSubmitted={messageSearchSubmitted}
        query={query}
        showInitialSearchLoading={showInitialSearchLoading}
        messageSearchError={messageSearchError}
        messageSearchItems={messageSearchItems}
        messageSearchHasMore={messageSearchHasMore}
        messageSearchLoading={messageSearchLoading}
        loadMessageSearch={loadMessageSearch}
        selectedRoom={selectedRoom}
        findKnownUserById={findKnownUserById}
        activeMessageSearchId={activeMessageSearchId}
        handleJumpToSearchResult={handleJumpToSearchResult}
      />
    );
  };

  const renderSharedContentSections = () => (
    <SharedContentSections
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
      onOpenMedia={setMediaViewerMessage}
      onJumpToMessage={handleJumpToMessage}
    />
  );

  const renderConversationDetails = () => {
    return (
      <DetailsSidebar
        selectedUser={selectedUser}
        selectedRoom={selectedRoom}
        handleCloseConversationDetails={handleCloseConversationDetails}
        renderSharedContentSections={renderSharedContentSections}
        currentUserCanManageSelectedRoom={currentUserCanManageSelectedRoom}
        groupAvatarUploading={groupAvatarUploading}
        groupSettingsSaving={groupSettingsSaving}
        handleGroupAvatarChange={handleGroupAvatarChange}
        isEditingGroupName={isEditingGroupName}
        handleUpdateGroupSettingsName={handleUpdateGroupSettingsName}
        groupSettingsName={groupSettingsName}
        setGroupSettingsError={setGroupSettingsError}
        setGroupSettingsName={setGroupSettingsName}
        canSaveGroupSettingsName={canSaveGroupSettingsName}
        groupSettingsPendingAction={groupSettingsPendingAction}
        setIsEditingGroupName={setIsEditingGroupName}
        currentUserMemberRole={currentUserMemberRole}
        isCurrentUserOwner={isCurrentUserOwner}
        isCurrentUserModerator={isCurrentUserModerator}
        handleOpenInviteModal={handleOpenInviteModal}
        selectedRoomOwnerName={selectedRoomOwnerName}
        groupSettingsError={groupSettingsError}
        groupMembersExpanded={groupMembersExpanded}
        setGroupMembersExpanded={setGroupMembersExpanded}
        renderDetailsMemberItem={renderDetailsMemberItem}
        handleDeleteSelectedGroup={handleDeleteSelectedGroup}
        handleLeaveSelectedGroup={handleLeaveSelectedGroup}
      />
    );
  };

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
        onToggleSound={() => soundService.toggleMuted()}
        onOpenRequests={handleOpenRequestsPanel}
        onToggleProfileMenu={handleToggleProfileMenu}
        onOpenProfileEditor={handleOpenProfileEditor}
        onLogout={() => void handleLogout()}
      />

      <div className={`chat-container ${mainView === 'chat' && selectedConversationOpen ? 'conversation-open' : ''}`}>
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
            openConversationMenuKey={openConversationMenuKey}
            pendingConversationKey={conversationSettingPendingKey}
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
              hasMoreMessages={hasMoreMessages}
              olderMessagesLoading={olderMessagesLoading}
              messageListProps={{
                items: messageListItems,
                currentUser,
                selectedUser,
                selectedRoom,
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
                renderCallMessageBody,
                findKnownUserById,
                handleOpenUserProfile,
                renderMessageActions,
                renderMessageBody,
                renderMessageReactions,
                handleRetryMessage,
                renderGroupSeenBy,
              }}
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
                const message = messages.find((item) => item.id === pinnedMessage?.id);
                if (message) scrollToMessageById(message.id);
              }}
              onUnpinMessage={() => void handleUnpinMessage()}
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
          <>
            <button
              type="button"
              className="details-backdrop"
              onClick={handleCloseConversationDetails}
              aria-label="Close conversation details"
            />
            {rightSidebarTab === 'search' ? renderSearchSidebar() : renderConversationDetails()}
          </>
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

      <ProfileViewerModal
        user={activeViewedProfileUser}
        loading={viewedProfileLoading}
        error={viewedProfileError}
        actionError={profileActionError}
        pendingActionKeys={friendActionKeys}
        callActive={Boolean(activeCall)}
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
