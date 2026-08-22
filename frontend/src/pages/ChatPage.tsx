import {
  type ChangeEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CALL_RINGING_TIMEOUT_MS, ROUTES, RTC_ICE_SERVERS } from '../config/constants';
import type {
  CallSignalEvent,
  CallSignalPayload,
  CallType,
  ChatRoom,
  CloudinaryUploadSignature,
  ConversationSetting,
  Friendship,
  FriendshipSummary,
  GroupInviteResponse,
  GroupMemberRole,
  MediaAttachment,
  Message,
  MessagePage,
  MessageReply,
  MessageSeenByResponse,
  MessageType,
  ReadReceiptEvent,
  RoomReadReceiptEvent,
  UnreadCount,
  User,
} from '../types';
import { apiClient } from '../services/api';
import { useAuth } from '../context/useAuth';
import { wsService } from '../services/websocket';
import { soundService } from '../services/soundService';
import { dbService } from '../services/dbService';
import { useCallSession } from '../hooks/useCallSession';
import { useTheme } from '../hooks/useTheme';
import {
  STOP_TYPING_DELAY_MS, USER_SEARCH_DEBOUNCE_MS, REMOTE_TYPING_VISIBLE_MS,
  OPTIMISTIC_SEND_TIMEOUT_MS,
  MESSAGE_PAGE_SIZE, SHARED_CONTENT_PAGE_SIZE, MESSAGE_SEARCH_PAGE_SIZE,
  MESSAGE_AROUND_PAGE_SIZE, MESSAGE_JUMP_HIGHLIGHT_MS,
  LOAD_OLDER_SCROLL_THRESHOLD, READ_BOTTOM_THRESHOLD, AUTO_SCROLL_BOTTOM_THRESHOLD,
  BROWSER_NOTIFICATION_CLOSE_MS, CALL_RECONNECT_TIMEOUT_MS,
  MIN_GROUP_MEMBERS, MIN_GROUP_INVITED_MEMBERS, BIO_MAX_LENGTH,
  MAX_AVATAR_SIZE_BYTES, MAX_AVATAR_SIZE_MB,
  ACCEPTED_AVATAR_TYPES, AVATAR_ACCEPT, MEDIA_ACCEPT,
  USER_SKELETON_KEYS, MESSAGE_SKELETON_KEYS,
  CONVERSATION_FILTERS, QUICK_REACTION_EMOJIS,
} from '../constants/chatConstants';
import type {
  ChatMessage, ActiveCall, CallConnectionState,
  CallPermissionSnapshot, PreCallSetup,
  SendMessagePayload, SendRoomMessagePayload,
  PendingMedia, CloudinaryUploadResult, LocalMediaUploadResult,
  LoadOptions, SharedContentLoadOptions, MessageSearchLoadOptions,
  MainView, ConversationFilter, SharedContentKind, MessageListItem, RoomSummaryResponse,
  PendingReadConversation, ChatBrowserNotification, ConversationTarget,
} from '../types/chat.types';
import {
  FriendsIcon, FriendRequestIcon, RefreshIcon,
  PhoneIcon, VideoCallIcon,
  JumpIcon, CloseIcon,
  DocumentIcon, DownloadIcon, PaperclipIcon,
  ReplyIcon, CopyIcon, ForwardIcon, RecallIcon, MoreIcon,
  PinIcon, MutedIcon, ArchiveIcon, TrashIcon, ChevronDownIcon, ProfileIcon, MediaIcon,
} from '../icons/ChatIcons';
import {
  toDeliveredMessage, appendOrReconcileMessage,
  mergeKnownMessageUpdate, appendOptimisticMessage, mergeServerMessagesWithPending,
  isActiveConversationMessage, getMessageType,
  applyReadReceipt, getUnreadDividerCandidateId,
  markOptimisticMessageSending, markOptimisticMessageFailed,
  getGroupedMessageReactions, hasCurrentUserReaction,
  canUseMessageActions, getMessagePreviewContent,
  messageMatchesSearchQuery, getMediaPayloadFromMessage, createReplyFromMessage,
  getPendingMediaType, cloudinaryResultToMedia,
  createOptimisticMessage, createOptimisticRoomMessage,
  getLatestSeenOutgoingMessageId, getLatestOutgoingMessageId,
  isSharedMediaMessage, mergeSharedContentPage, prependSharedContentItem,
  updateKnownSharedContentItem, shouldGroupAdjacentMessages,
  appendSeenByUser, createClientId, getCallEventLabel,
  isMessagesContainerNearBottom, getMessagesContainerBottomScrollTop,
} from '../utils/messageUtils';
import {
  getLocalDateKey, formatSidebarTime, formatMessageDateDivider,
  formatMessageTime, formatCallTimer,
  getMediaDeviceLabel,
} from '../utils/formatUtils';
import {
  getUserDisplayName, getUserAccountDisplayName, getUserInitial,
  getAvatarUrl, getMediaUrl,
  applyPresenceToUser, applyProfileToUser, applyProfileToRoom,
  applyConversationSettingToUser, applyConversationSettingToRoom,
  applyFriendshipToProfileUser, mergeViewedProfileUser,
  canChatWithUser, getUserStatusClass, getFriendshipStatusLabel,
  getRelationshipLabel, getPresenceLabel,
  isTypingFromSelectedUser, getTypingIndicatorLabel,
  mergeUnreadCounts, incrementUnreadCount, resetUnreadCount, resetRoomUnreadCount,
  shouldShowUsername, getRoomInitial,
  shouldOpenConversationDetailsByDefault, matchesFriendSearch,
} from '../utils/userUtils';
import {
  hasPrivateConversation,
  sortRoomsByChatActivity, buildSidebarConversationItems,
  isRoomParticipant, appendOrUpdateRoom, compareUsersByChatActivity,
  applyRoomPreviewToRoom, applyRoomPreviewToRooms,
  applyConversationPreviewToUser, applyConversationPreviewToUsers,
  getConversationPreviewText, getRoomPreviewText, isMutedIncomingConversation,
} from '../utils/conversationUtils';
import {
  canSendWebRtcSignalForCall, getCallMediaErrorMessage, queryCallPermission,
  getCallPermissionLabel, getScreenShareErrorMessage, buildCallMediaConstraints,
  stopMediaStream, getBrowserAwareConnectionStatus, isBrowserNotificationSupported,
  getBrowserNotificationPermission, shouldShowBrowserNotification,
} from '../utils/callUtils';
import {
  formatFileSize, getFileExtension, getFileBadgeColor, getDownloadFilename, getMediaSizeError,
  getFileFormat, hasLinkPreview, isSharedLinkMessage, getLinkPreviewDomain,
} from '../utils/mediaUtils';
import {
  getChatRoute, getFriendsRoute, getRequestsRoute,
  getUserChatRoute, getRoomChatRoute, parseChatRoute,
} from '../utils/routeUtils';
import {
  renderLinkedText,
  renderLinkPreviewCard, renderUserAvatar,
} from '../utils/renderUtils';
import VoiceMessagePlayer from '../components/VoiceMessagePlayer';
import AppHeader from '../components/chat/AppHeader';
import ActiveCallOverlay from '../components/chat/ActiveCallOverlay';
import AddMembersModal from '../components/chat/AddMembersModal';
import ConversationHeader from '../components/chat/ConversationHeader';
import ConversationSidebar from '../components/chat/ConversationSidebar';
import DetailsSidebar from '../components/chat/DetailsSidebar';
import ForwardPickerBody from '../components/chat/ForwardPickerBody';
import MessageItem from '../components/chat/MessageItem';
import MessageInput from '../components/chat/MessageInput';
import PreCallSetupModal from '../components/chat/PreCallSetupModal';
import SearchSidebar from '../components/chat/SearchSidebar';
import type { LightboxMediaItem } from '../components/chat/MediaLightbox';
import type { ReactionDetailGroup } from '../components/chat/ReactionSummaryModal';
import './ChatPage.css';

const PRIVATE_MESSAGE_DESTINATION = '/app/chat.send';
const GROUP_MESSAGE_DESTINATION_PREFIX = '/app/rooms';
const TYPING_DESTINATION = '/app/chat.typing';
const READ_RECEIPT_DESTINATION = '/app/chat.read';
const CALL_SIGNAL_DESTINATION = '/app/calls.signal';

const MediaLightbox = lazy(() => import('../components/chat/MediaLightbox'));
const GroupSeenByModal = lazy(() => import('../components/chat/GroupSeenByModal'));
const ReactionSummaryModal = lazy(() => import('../components/chat/ReactionSummaryModal'));

const UNKNOWN_CALL_PERMISSIONS: CallPermissionSnapshot = {
  microphone: 'unknown',
  camera: 'unknown',
};

function buildMessageListItems(
  messages: ChatMessage[],
  selectedRoom: ChatRoom | null,
  currentUserId: number | null,
  unreadDividerMessageId: number | null
): MessageListItem[] {
  const items: MessageListItem[] = [];
  let previousDateKey = '';

  messages.forEach((message, index) => {
    const dateKey = getLocalDateKey(message.timestamp);
    if (dateKey !== previousDateKey) {
      items.push({
        type: 'date',
        key: `date-${dateKey}-${message.id}`,
        label: formatMessageDateDivider(message.timestamp),
      });
      previousDateKey = dateKey;
    }

    if (unreadDividerMessageId !== null && message.id === unreadDividerMessageId) {
      items.push({
        type: 'unread',
        key: `unread-${message.id}`,
      });
    }

    const previousMessage = messages[index - 1];
    const nextMessage = messages[index + 1];
    const groupedWithPrevious = shouldGroupAdjacentMessages(previousMessage, message);
    const groupedWithNext = shouldGroupAdjacentMessages(message, nextMessage);

    items.push({
      type: 'message',
      key: `${message.clientId ?? message.id}`,
      message,
      groupedWithPrevious,
      groupedWithNext,
      showSender: Boolean(
        selectedRoom &&
        message.senderId !== currentUserId &&
        !groupedWithPrevious
      ),
    });
  });

  return items;
}

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
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
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
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchSubmitted, setMessageSearchSubmitted] = useState(false);
  const messageSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [messageSearchItems, setMessageSearchItems] = useState<ChatMessage[]>([]);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState('');
  const [messageSearchHasMore, setMessageSearchHasMore] = useState(false);
  const [messageSearchNextBefore, setMessageSearchNextBefore] = useState<number | null>(null);
  const [activeMessageSearchId, setActiveMessageSearchId] = useState<number | null>(null);
  const [sharedMediaExpanded, setSharedMediaExpanded] = useState(false);
  const [sharedFilesExpanded, setSharedFilesExpanded] = useState(false);
  const [sharedLinksExpanded, setSharedLinksExpanded] = useState(false);
  const [sharedMediaLoaded, setSharedMediaLoaded] = useState(false);
  const [sharedLinksLoaded, setSharedLinksLoaded] = useState(false);
  const [sharedMediaItems, setSharedMediaItems] = useState<ChatMessage[]>([]);
  const [sharedLinkItems, setSharedLinkItems] = useState<ChatMessage[]>([]);
  const [sharedMediaLoading, setSharedMediaLoading] = useState(false);
  const [sharedLinksLoading, setSharedLinksLoading] = useState(false);
  const [sharedMediaError, setSharedMediaError] = useState('');
  const [sharedLinksError, setSharedLinksError] = useState('');
  const [sharedMediaHasMore, setSharedMediaHasMore] = useState(false);
  const [sharedLinksHasMore, setSharedLinksHasMore] = useState(false);
  const [sharedMediaNextBefore, setSharedMediaNextBefore] = useState<number | null>(null);
  const [sharedLinksNextBefore, setSharedLinksNextBefore] = useState<number | null>(null);
  const [roomSeenByByMessageId, setRoomSeenByByMessageId] = useState<Record<number, User[]>>({});
  const [seenByLoadingMessageIds, setSeenByLoadingMessageIds] = useState<number[]>([]);
  const [seenByPopupMessageId, setSeenByPopupMessageId] = useState<number | null>(null);
  const [activeCall, setActiveCallState] = useState<ActiveCall | null>(null);
  const [callMinimized, setCallMinimized] = useState(false);
  const [callError, setCallError] = useState('');
  const [localCallStream, setLocalCallStream] = useState<MediaStream | null>(null);
  const [remoteCallStream, setRemoteCallStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);
  const [screenShareError, setScreenShareError] = useState('');
  const [callConnectionState, setCallConnectionState] = useState<CallConnectionState>('idle');
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callElapsedSeconds, setCallElapsedSeconds] = useState(0);
  const [callDevices, setCallDevices] = useState<MediaDeviceInfo[]>([]);
  const [callDevicesLoading, setCallDevicesLoading] = useState(false);
  const [callDeviceError, setCallDeviceError] = useState('');
  const [callPermissions, setCallPermissions] = useState<CallPermissionSnapshot>(
    UNKNOWN_CALL_PERMISSIONS,
  );
  const [selectedAudioInputId, setSelectedAudioInputId] = useState('');
  const [selectedVideoInputId, setSelectedVideoInputId] = useState('');
  const [preCallSetup, setPreCallSetup] = useState<PreCallSetup>(null);
  const [preCallPreviewStream, setPreCallPreviewStream] = useState<MediaStream | null>(null);
  const [preCallPreviewLoading, setPreCallPreviewLoading] = useState(false);
  const [preCallError, setPreCallError] = useState('');
  const [preCallSubmitting, setPreCallSubmitting] = useState(false);
  const [profileFullName, setProfileFullName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [profileAvatarPreview, setProfileAvatarPreview] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [viewedProfileUser, setViewedProfileUser] = useState<User | null>(null);
  const [viewedProfileLoading, setViewedProfileLoading] = useState(false);
  const [viewedProfileError, setViewedProfileError] = useState('');
  const [profileActionError, setProfileActionError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(shouldOpenConversationDetailsByDefault);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [unreadDividerMessageId, setUnreadDividerMessageIdState] = useState<number | null>(null);
  const [browserNotificationPermission, setBrowserNotificationPermission] =
    useState<NotificationPermission>(getBrowserNotificationPermission);
  const currentUserRef = useRef<User | null>(null);
  const currentUserIdRef = useRef<number | null>(null);
  const selectedUserIdRef = useRef<number | null>(null);
  const selectedRoomIdRef = useRef<number | null>(null);
  const unreadDividerMessageIdRef = useRef<number | null>(null);
  const pendingReadConversationRef = useRef<PendingReadConversation>(null);
  const usersRef = useRef<User[]>([]);
  const friendsRef = useRef<User[]>([]);
  const roomsRef = useRef<ChatRoom[]>([]);
  const browserNotificationPermissionRef = useRef<NotificationPermission>(
    getBrowserNotificationPermission()
  );
  const browserNotificationPermissionRequestRef = useRef<Promise<NotificationPermission> | null>(null);
  const notificationAudioContextRef = useRef<AudioContext | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const roomSeenByLoadedMessageIdsRef = useRef<Set<number>>(new Set());
  const activeCallRef = useRef<ActiveCall | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localCallStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const preCallPreviewStreamRef = useRef<MediaStream | null>(null);
  const preCallPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const micMutedRef = useRef(false);
  const cameraOffRef = useRef(false);
  const screenSharingRef = useRef(false);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const screenShareCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenShareStoppingRef = useRef(false);
  const selectedAudioInputIdRef = useRef('');
  const selectedVideoInputIdRef = useRef('');
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const sendTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const userSearchQueryRef = useRef('');
  const messageSearchQueryRef = useRef('');
  const messageSearchRequestedQueryRef = useRef('');
  const viewedProfileUsernameRef = useRef('');
  const optimisticMessageIdRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const hasLoadedInitialUsersRef = useRef(false);
  const olderMessagesLoadingRef = useRef(false);
  const hasMoreMessagesRef = useRef(false);
  const nextMessageBeforeRef = useRef<number | null>(null);
  const skipNextAutoScrollRef = useRef(false);
  const pendingInitialMessageScrollRef = useRef(false);
  const blockOlderMessagesAutoLoadRef = useRef(false);
  const hasUserInteractedWithMessagesRef = useRef(false);
  const releaseInitialScrollBlockFrameRef = useRef<number | null>(null);
  const messageJumpHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageJumpFrameRef = useRef<number | null>(null);

  const canOpenDirectConversation = useCallback(
    (user: User) => user.id !== currentUserIdRef.current,
    []
  );
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const unreadDividerRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageInputSelectionRef = useRef({ start: 0, end: 0 });
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const selectedUserId = selectedUser?.id ?? null;
  const selectedRoomId = selectedRoom?.id ?? null;
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

  useCallSession({
    activeCall,
    setCallMinimized,
    localCallStream,
    remoteCallStream,
    preCallPreviewStream,
    micMuted,
    cameraOff,
    screenSharing,
    selectedAudioInputId,
    selectedVideoInputId,
    callStartedAt,
    setCallElapsedSeconds,
    activeCallRef,
    localCallStreamRef,
    preCallPreviewStreamRef,
    micMutedRef,
    cameraOffRef,
    screenSharingRef,
    selectedAudioInputIdRef,
    selectedVideoInputIdRef,
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
    preCallPreviewVideoRef,
  });

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
    browserNotificationPermissionRef.current = browserNotificationPermission;
  }, [browserNotificationPermission]);

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

  const clearInitialScrollBlockRelease = useCallback(() => {
    if (releaseInitialScrollBlockFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(releaseInitialScrollBlockFrameRef.current);
    releaseInitialScrollBlockFrameRef.current = null;
  }, []);

  const scrollMessagesContainerToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current;
    if (container) {
      const bottomScrollTop = getMessagesContainerBottomScrollTop(container);
      if (behavior === 'auto') {
        container.scrollTop = bottomScrollTop;
      } else {
        container.scrollTo({
          top: bottomScrollTop,
          behavior,
        });
      }
      return true;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior,
      block: 'end',
    });
    return Boolean(messagesEndRef.current);
  }, []);

  const settleScrollToLatestMessage = useCallback((behavior: ScrollBehavior = 'auto') => {
    scrollMessagesContainerToBottom(behavior);
    window.requestAnimationFrame(() => {
      scrollMessagesContainerToBottom('auto');
      window.requestAnimationFrame(() => {
        scrollMessagesContainerToBottom('auto');
      });
    });
  }, [scrollMessagesContainerToBottom]);

  const forceScrollToLatestMessage = useCallback(() => {
    settleScrollToLatestMessage('auto');
  }, [settleScrollToLatestMessage]);

  const scrollToLatestMessage = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      settleScrollToLatestMessage(behavior);
    },
    [settleScrollToLatestMessage]
  );

  const releaseInitialScrollBlock = useCallback(() => {
    clearInitialScrollBlockRelease();
    releaseInitialScrollBlockFrameRef.current = window.requestAnimationFrame(() => {
      releaseInitialScrollBlockFrameRef.current = window.requestAnimationFrame(() => {
        blockOlderMessagesAutoLoadRef.current = false;
        releaseInitialScrollBlockFrameRef.current = null;
      });
    });
  }, [clearInitialScrollBlockRelease]);

  const setUnreadDividerMessageId = useCallback((messageId: number | null) => {
    unreadDividerMessageIdRef.current = messageId;
    setUnreadDividerMessageIdState(messageId);
  }, []);

  const scrollToUnreadDivider = useCallback(() => {
    const divider = unreadDividerRef.current;
    if (!divider) {
      return false;
    }

    divider.scrollIntoView({
      behavior: 'auto',
      block: 'start',
    });
    return true;
  }, []);

  const clearPendingReadConversation = useCallback(() => {
    pendingReadConversationRef.current = null;
    setUnreadDividerMessageId(null);
  }, [setUnreadDividerMessageId]);

  const preparePendingReadConversation = useCallback((
    type: NonNullable<PendingReadConversation>['type'],
    id: number,
    unreadCount: number
  ) => {
    if (unreadCount <= 0) {
      clearPendingReadConversation();
      return;
    }

    pendingReadConversationRef.current = { type, id, unreadCount };
    setUnreadDividerMessageId(null);
  }, [clearPendingReadConversation, setUnreadDividerMessageId]);

  const applyPendingUnreadDivider = useCallback((
    pageMessages: Message[],
    type: NonNullable<PendingReadConversation>['type'],
    id: number
  ) => {
    const pendingConversation = pendingReadConversationRef.current;
    if (
      !pendingConversation ||
      pendingConversation.type !== type ||
      pendingConversation.id !== id
    ) {
      return;
    }

    const dividerMessageId = getUnreadDividerCandidateId(
      pageMessages.map(toDeliveredMessage),
      pendingConversation.unreadCount,
      currentUserIdRef.current
    );
    setUnreadDividerMessageId(dividerMessageId);
  }, [setUnreadDividerMessageId]);

  const addPendingUnreadMessage = useCallback((
    type: NonNullable<PendingReadConversation>['type'],
    id: number,
    message: Message
  ) => {
    const pendingConversation = pendingReadConversationRef.current;
    const unreadCount =
      pendingConversation?.type === type && pendingConversation.id === id
        ? pendingConversation.unreadCount + 1
        : 1;

    pendingReadConversationRef.current = { type, id, unreadCount };
    if (unreadDividerMessageIdRef.current === null && message.id > 0) {
      setUnreadDividerMessageId(message.id);
    }
  }, [setUnreadDividerMessageId]);

  const findKnownUserById = useCallback((userId: number) => {
    const currentKnownUser = currentUserRef.current;
    const knownUsers = [
      currentKnownUser?.id === userId ? currentKnownUser : null,
      ...friendsRef.current,
      ...usersRef.current,
      ...roomsRef.current.flatMap((room) => room.participants),
    ].filter(Boolean) as User[];

    return knownUsers.find((user) => user.id === userId) ?? null;
  }, []);

  const findKnownRoomById = useCallback((roomId: number) => {
    return roomsRef.current.find((room) => room.id === roomId) ?? null;
  }, []);

  const resumeNotificationAudio = useCallback(async () => {
    if (typeof window === 'undefined') {
      return null;
    }

    const AudioContextConstructor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      return null;
    }

    if (!notificationAudioContextRef.current) {
      notificationAudioContextRef.current = new AudioContextConstructor();
    }

    const audioContext = notificationAudioContextRef.current;
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (error) {
        console.warn('Unable to unlock notification sound:', error);
        return null;
      }
    }

    return audioContext;
  }, []);

  const startIncomingCallRingtone = useCallback(() => {
    soundService.startIncomingCallRingtone();
  }, []);

  const stopIncomingCallRingtone = useCallback(() => {
    soundService.stopIncomingCallRingtone();
  }, []);

  const requestBrowserNotificationPermission = useCallback(async () => {
    if (!isBrowserNotificationSupported()) {
      setBrowserNotificationPermission('denied');
      return 'denied' as NotificationPermission;
    }

    const currentPermission = getBrowserNotificationPermission();
    browserNotificationPermissionRef.current = currentPermission;
    setBrowserNotificationPermission(currentPermission);
    if (currentPermission !== 'default') {
      return currentPermission;
    }

    if (!browserNotificationPermissionRequestRef.current) {
      browserNotificationPermissionRequestRef.current = Notification.requestPermission()
        .then((permission) => {
          browserNotificationPermissionRef.current = permission;
          setBrowserNotificationPermission(permission);
          return permission;
        })
        .catch((error) => {
          console.error('Failed to request browser notification permission:', error);
          const permission = getBrowserNotificationPermission();
          browserNotificationPermissionRef.current = permission;
          setBrowserNotificationPermission(permission);
          return permission;
        })
        .finally(() => {
          browserNotificationPermissionRequestRef.current = null;
        });
    }

    return browserNotificationPermissionRequestRef.current;
  }, []);

  const showBrowserNotification = useCallback((notification: ChatBrowserNotification) => {
    if (
      !isBrowserNotificationSupported() ||
      browserNotificationPermissionRef.current !== 'granted' ||
      !shouldShowBrowserNotification()
    ) {
      return false;
    }

    try {
      const browserNotification = new Notification(notification.title, {
        body: notification.body,
        icon: getAvatarUrl(notification.user?.avatar),
        tag: notification.browserTag,
      });

      browserNotification.onclick = () => {
        window.focus();
        if (notification.path) {
          navigate(notification.path);
        }
        browserNotification.close();
      };

      window.setTimeout(() => {
        browserNotification.close();
      }, BROWSER_NOTIFICATION_CLOSE_MS);
      return true;
    } catch (error) {
      console.error('Failed to show browser notification:', error);
      return false;
    }
  }, [navigate]);

  const notifyWithBrowserNotification = useCallback((notification: ChatBrowserNotification, isMention = false) => {
    if (isMention) {
      soundService.playMentionSound();
    } else {
      soundService.playNotificationSound();
    }

    if (browserNotificationPermissionRef.current === 'default') {
      void requestBrowserNotificationPermission();
    }

    void showBrowserNotification(notification);
  }, [requestBrowserNotificationPermission, showBrowserNotification]);

  const buildMessageNotification = useCallback((message: Message) => {
    const preview = getMessagePreviewContent(message) || 'New message';
    const isMention = Boolean(
      message.chatRoomId && (
        (currentUserRef.current && message.mentionedUserIds?.includes(currentUserRef.current.id)) ||
        (currentUserRef.current && message.mentionedUsernames?.includes(currentUserRef.current.username)) ||
        (message.content && /@all\b/i.test(message.content))
      )
    );

    if (message.chatRoomId) {
      const room = findKnownRoomById(message.chatRoomId);
      const sender = findKnownUserById(message.senderId);
      const senderName =
        getUserDisplayName(sender) ||
        message.senderFullName?.trim() ||
        message.senderUsername ||
        'Someone';

      return {
        title: isMention
          ? `🔔 ${senderName} mentioned you in ${room?.name ?? 'Group'}`
          : (room?.name ?? 'Group message'),
        body: isMention ? preview : `${senderName}: ${preview}`,
        path: getRoomChatRoute(message.chatRoomId),
        user: sender,
        browserTag: `room-message-${message.chatRoomId}`,
        isMention,
      };
    }

    const sender = findKnownUserById(message.senderId);
    const senderUsername = sender?.username || message.senderUsername;
    return {
      title:
        getUserDisplayName(sender) ||
        message.senderFullName?.trim() ||
        senderUsername ||
        'New message',
      body: preview,
      path: senderUsername ? getUserChatRoute(senderUsername) : undefined,
      user: sender,
      browserTag: `private-message-${message.senderId}`,
      isMention: false,
    };
  }, [findKnownRoomById, findKnownUserById]);

  const buildFriendshipNotification = useCallback((friendship: Friendship) => {
    const currentUserId = currentUserIdRef.current;
    if (friendship.status === 'pending' && friendship.receiver.id === currentUserId) {
      const requesterName = getUserDisplayName(friendship.requester);
      return {
        title: 'New friend request',
        body: `${requesterName} sent you a friend request.`,
        path: getRequestsRoute(),
        user: friendship.requester,
        browserTag: `friend-request-${friendship.id}`,
      };
    }

    if (friendship.status === 'accepted' && friendship.requester.id === currentUserId) {
      const receiverName = getUserDisplayName(friendship.receiver);
      return {
        title: 'Friend request accepted',
        body: `${receiverName} accepted your friend request.`,
        path: getUserChatRoute(friendship.receiver.username),
        user: friendship.receiver,
        browserTag: `friend-accepted-${friendship.id}`,
      };
    }

    return null;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const unlockAudio = () => {
      void resumeNotificationAudio();
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [resumeNotificationAudio]);

  useEffect(() => {
    if (!currentUser?.id || !isBrowserNotificationSupported()) {
      return undefined;
    }

    const requestPermission = () => {
      if (getBrowserNotificationPermission() === 'default') {
        void requestBrowserNotificationPermission();
      }
    };

    requestPermission();
    window.addEventListener('pointerdown', requestPermission, { once: true, passive: true });
    window.addEventListener('keydown', requestPermission, { once: true });

    return () => {
      window.removeEventListener('pointerdown', requestPermission);
      window.removeEventListener('keydown', requestPermission);
    };
  }, [currentUser?.id, requestBrowserNotificationPermission]);

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

  useEffect(() => () => {
    stopIncomingCallRingtone();
    stopMediaStream(preCallPreviewStreamRef.current);
    preCallPreviewStreamRef.current = null;
    void notificationAudioContextRef.current?.close();
    notificationAudioContextRef.current = null;
  }, [stopIncomingCallRingtone]);

  const resetMessagePagination = useCallback(() => {
    olderMessagesLoadingRef.current = false;
    hasMoreMessagesRef.current = false;
    nextMessageBeforeRef.current = null;
    skipNextAutoScrollRef.current = false;
    pendingInitialMessageScrollRef.current = true;
    blockOlderMessagesAutoLoadRef.current = true;
    hasUserInteractedWithMessagesRef.current = false;
    clearInitialScrollBlockRelease();
    setOlderMessagesLoading(false);
    setHasMoreMessages(false);
  }, [clearInitialScrollBlockRelease]);

  const applyMessagePagination = useCallback((page: MessagePage) => {
    const nextBefore = page.nextBefore ?? null;
    hasMoreMessagesRef.current = page.hasMore;
    nextMessageBeforeRef.current = nextBefore;
    setHasMoreMessages(page.hasMore);
  }, []);

  const resetSharedContentState = useCallback(() => {
    setSharedMediaExpanded(false);
    setSharedLinksExpanded(false);
    setSharedMediaLoaded(false);
    setSharedLinksLoaded(false);
    setSharedMediaItems([]);
    setSharedLinkItems([]);
    setSharedMediaLoading(false);
    setSharedLinksLoading(false);
    setSharedMediaError('');
    setSharedLinksError('');
    setSharedMediaHasMore(false);
    setSharedLinksHasMore(false);
    setSharedMediaNextBefore(null);
    setSharedLinksNextBefore(null);
  }, []);

  const resetMessageSearchState = useCallback(() => {
    messageSearchQueryRef.current = '';
    messageSearchRequestedQueryRef.current = '';
    setMessageSearchQuery('');
    setMessageSearchItems([]);
    setMessageSearchLoading(false);
    setMessageSearchError('');
    setMessageSearchHasMore(false);
    setMessageSearchNextBefore(null);
    setActiveMessageSearchId(null);
    setHighlightedMessageId(null);
    setMessageSearchSubmitted(false);
  }, []);

  const clearMessageJumpEffects = useCallback(() => {
    if (messageJumpHighlightTimeoutRef.current) {
      clearTimeout(messageJumpHighlightTimeoutRef.current);
      messageJumpHighlightTimeoutRef.current = null;
    }

    if (messageJumpFrameRef.current !== null) {
      window.cancelAnimationFrame(messageJumpFrameRef.current);
      messageJumpFrameRef.current = null;
    }
  }, []);

  const scrollToMessageById = useCallback((messageId: number) => {
    const container = messagesContainerRef.current;
    const messageElement = container?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!messageElement) {
      return;
    }

    messageElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, []);

  const highlightMessageById = useCallback(
    (messageId: number) => {
      clearMessageJumpEffects();
      setHighlightedMessageId(messageId);
      messageJumpFrameRef.current = window.requestAnimationFrame(() => {
        messageJumpFrameRef.current = window.requestAnimationFrame(() => {
          scrollToMessageById(messageId);
          messageJumpFrameRef.current = null;
        });
      });
      messageJumpHighlightTimeoutRef.current = setTimeout(() => {
        setHighlightedMessageId((currentMessageId) =>
          currentMessageId === messageId ? null : currentMessageId
        );
        messageJumpHighlightTimeoutRef.current = null;
      }, MESSAGE_JUMP_HIGHLIGHT_MS);
    },
    [clearMessageJumpEffects, scrollToMessageById]
  );

  const addIncomingSharedContent = useCallback((incomingMessage: Message) => {
    if (
      !isActiveConversationMessage(
        incomingMessage,
        currentUserIdRef.current,
        selectedUserIdRef.current,
        selectedRoomIdRef.current
      )
    ) {
      return;
    }

    setSharedMediaItems((currentMessages) =>
      prependSharedContentItem(currentMessages, incomingMessage, isSharedMediaMessage)
    );
    setSharedLinkItems((currentMessages) =>
      prependSharedContentItem(currentMessages, incomingMessage, isSharedLinkMessage)
    );

    const currentSearchQuery = messageSearchQueryRef.current.trim();
    if (currentSearchQuery) {
      setMessageSearchItems((currentMessages) =>
        prependSharedContentItem(
          currentMessages,
          incomingMessage,
          (message) => messageMatchesSearchQuery(message, currentSearchQuery)
        )
      );
    }
  }, []);

  const updateSharedContentFromMessage = useCallback((updatedMessage: Message) => {
    if (
      !isActiveConversationMessage(
        updatedMessage,
        currentUserIdRef.current,
        selectedUserIdRef.current,
        selectedRoomIdRef.current
      )
    ) {
      return;
    }

    setSharedMediaItems((currentMessages) =>
      updateKnownSharedContentItem(currentMessages, updatedMessage, isSharedMediaMessage)
    );
    setSharedLinkItems((currentMessages) =>
      updateKnownSharedContentItem(currentMessages, updatedMessage, isSharedLinkMessage)
    );

    const currentSearchQuery = messageSearchQueryRef.current.trim();
    if (currentSearchQuery) {
      setMessageSearchItems((currentMessages) =>
        updateKnownSharedContentItem(
          currentMessages,
          updatedMessage,
          (message) => messageMatchesSearchQuery(message, currentSearchQuery)
        )
      );
    }
  }, []);

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

  const loadUsers = useCallback(async (options: LoadOptions = {}) => {
    const search = (options.search ?? userSearchQueryRef.current).trim();
    const isCurrentSearch = () => userSearchQueryRef.current.trim() === search;
    const usersEndpoint = search ? '/friends/search' : '/conversations';

    if (!options.silent) {
      setUsersLoading(true);
    }
    setUsersError('');

    try {
      const [usersResponse, unreadCountsResponse, friendsResponse] = await Promise.all([
        apiClient.get<User[]>(usersEndpoint, {
          params: search ? { username: search } : undefined,
        }),
        apiClient.get<UnreadCount[]>('/messages/unread-counts'),
        search ? Promise.resolve(null) : apiClient.get<User[]>('/friends'),
      ]);
      if (!isCurrentSearch()) {
        return;
      }

      const nextUsers = mergeUnreadCounts(usersResponse.data, unreadCountsResponse.data);
      setUsers(nextUsers);
      if (friendsResponse) {
        setFriends(mergeUnreadCounts(friendsResponse.data, unreadCountsResponse.data));
      }

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
      if (!options.silent && isCurrentSearch()) {
        setUsersError('Unable to load friends.');
      }
    } finally {
      if (!options.silent && isCurrentSearch()) {
        setUsersLoading(false);
      }
    }
  }, [canOpenDirectConversation, resetMessagePagination]);

  const loadIncomingFriendRequests = useCallback(async (options: LoadOptions = {}) => {
    if (!options.silent) {
      setFriendRequestsLoading(true);
    }
    setFriendRequestsError('');

    try {
      const response = await apiClient.get<Friendship[]>('/friend-requests/incoming');
      setIncomingFriendRequests(response.data);
    } catch (error) {
      console.error('Failed to load friend requests:', error);
      if (!options.silent) {
        setFriendRequestsError('Unable to load requests.');
      }
    } finally {
      if (!options.silent) {
        setFriendRequestsLoading(false);
      }
    }
  }, []);

  const loadFriendSummary = useCallback(async (options: LoadOptions = {}) => {
    try {
      const response = await apiClient.get<FriendshipSummary>('/friend-requests/summary');
      setFriendSummary(response.data);
    } catch (error) {
      console.error('Failed to load friend request summary:', error);
      if (!options.silent) {
        setFriendSummary({ incomingCount: 0, outgoingCount: 0 });
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
            : null
        );
      }
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
  }, [navigate, resetMessagePagination]);

  const loadMessages = useCallback(async (userId: number, options: LoadOptions = {}) => {
    if (!options.silent) {
      resetMessagePagination();
      setMessages([]);
      setMessagesLoading(true);
    }
    setMessagesError('');

    try {
      const response = await apiClient.get<MessagePage>(`/messages/${userId}`, {
        params: { size: MESSAGE_PAGE_SIZE },
      });
      if (selectedUserIdRef.current === userId) {
        setMessages((currentMessages) =>
          mergeServerMessagesWithPending(options.silent ? currentMessages : [], response.data.items)
        );
        if (!options.silent) {
          applyMessagePagination(response.data);
          applyPendingUnreadDivider(response.data.items, 'user', userId);
        }
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
  }, [applyMessagePagination, applyPendingUnreadDivider, resetMessagePagination]);

  const loadRoomMessages = useCallback(async (roomId: number, options: LoadOptions = {}) => {
    if (!options.silent) {
      resetMessagePagination();
      setMessages([]);
      setMessagesLoading(true);
    }
    setMessagesError('');

    try {
      const response = await apiClient.get<MessagePage>(`/rooms/${roomId}/messages`, {
        params: { size: MESSAGE_PAGE_SIZE },
      });
      if (selectedRoomIdRef.current === roomId) {
        setMessages((currentMessages) =>
          mergeServerMessagesWithPending(options.silent ? currentMessages : [], response.data.items)
        );
        if (!options.silent) {
          applyMessagePagination(response.data);
          applyPendingUnreadDivider(response.data.items, 'room', roomId);
        }
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
  }, [applyMessagePagination, applyPendingUnreadDivider, resetMessagePagination]);

  const loadRoomMessageSeenBy = useCallback(async (roomId: number, messageId: number) => {
    if (messageId <= 0 || roomSeenByLoadedMessageIdsRef.current.has(messageId)) {
      return;
    }

    roomSeenByLoadedMessageIdsRef.current.add(messageId);
    setSeenByLoadingMessageIds((currentIds) =>
      currentIds.includes(messageId) ? currentIds : [...currentIds, messageId]
    );

    try {
      const response = await apiClient.get<MessageSeenByResponse>(
        `/rooms/${roomId}/messages/${messageId}/seen-by`
      );
      if (selectedRoomIdRef.current !== roomId) {
        return;
      }

      const currentUserId = currentUserIdRef.current;
      const seenBy = response.data.seenBy.filter((reader) => reader.id !== currentUserId);
      setRoomSeenByByMessageId((currentSeenBy) => ({
        ...currentSeenBy,
        [messageId]: seenBy.reduce(
          (readers, reader) => appendSeenByUser(readers, reader),
          currentSeenBy[messageId] ?? []
        ),
      }));
    } catch (error) {
      console.error('Failed to load group message seen-by:', error);
      roomSeenByLoadedMessageIdsRef.current.delete(messageId);
    } finally {
      setSeenByLoadingMessageIds((currentIds) =>
        currentIds.filter((currentId) => currentId !== messageId)
      );
    }
  }, []);

  const visibleSentRoomMessageIds = useMemo(() => {
    if (!selectedRoom || !currentUser) {
      return [];
    }

    return messages
      .filter((message) =>
        message.id > 0 &&
        message.chatRoomId === selectedRoom.id &&
        message.senderId === currentUser.id &&
        !message.recalled &&
        message.deliveryStatus !== 'failed'
      )
      .slice(-12)
      .map((message) => message.id);
  }, [currentUser, messages, selectedRoom]);

  useEffect(() => {
    if (!selectedRoom) {
      return;
    }

    visibleSentRoomMessageIds.forEach((messageId) => {
      void loadRoomMessageSeenBy(selectedRoom.id, messageId);
    });
  }, [loadRoomMessageSeenBy, selectedRoom, visibleSentRoomMessageIds]);

  const loadOlderMessages = useCallback(async () => {
    if (
      olderMessagesLoadingRef.current ||
      !hasMoreMessagesRef.current ||
      nextMessageBeforeRef.current === null
    ) {
      return;
    }

    const selectedUserIdForLoad = selectedUserIdRef.current;
    const selectedRoomIdForLoad = selectedRoomIdRef.current;
    if (selectedUserIdForLoad === null && selectedRoomIdForLoad === null) {
      return;
    }

    const container = messagesContainerRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;
    const previousScrollTop = container?.scrollTop ?? 0;
    const before = nextMessageBeforeRef.current;

    olderMessagesLoadingRef.current = true;
    setOlderMessagesLoading(true);
    setMessagesError('');

    try {
      const response =
        selectedUserIdForLoad !== null
          ? await apiClient.get<MessagePage>(`/messages/${selectedUserIdForLoad}`, {
            params: { before, size: MESSAGE_PAGE_SIZE },
          })
          : await apiClient.get<MessagePage>(`/rooms/${selectedRoomIdForLoad}/messages`, {
            params: { before, size: MESSAGE_PAGE_SIZE },
          });

      if (
        selectedUserIdRef.current !== selectedUserIdForLoad ||
        selectedRoomIdRef.current !== selectedRoomIdForLoad
      ) {
        return;
      }

      skipNextAutoScrollRef.current = true;
      setMessages((currentMessages) =>
        mergeServerMessagesWithPending(currentMessages, response.data.items)
      );
      applyMessagePagination(response.data);

      window.requestAnimationFrame(() => {
        const currentContainer = messagesContainerRef.current;
        if (!currentContainer) {
          return;
        }

        currentContainer.scrollTop =
          currentContainer.scrollHeight - previousScrollHeight + previousScrollTop;
      });
    } catch (error) {
      console.error('Failed to load older messages:', error);
      if (
        selectedUserIdRef.current === selectedUserIdForLoad &&
        selectedRoomIdRef.current === selectedRoomIdForLoad
      ) {
        setMessagesError('Unable to load older messages.');
      }
    } finally {
      olderMessagesLoadingRef.current = false;
      setOlderMessagesLoading(false);
    }
  }, [applyMessagePagination]);

  const loadSharedContent = useCallback(async (
    kind: SharedContentKind,
    options: SharedContentLoadOptions = {}
  ) => {
    const selectedUserIdForLoad = selectedUserIdRef.current;
    const selectedRoomIdForLoad = selectedRoomIdRef.current;
    if (selectedUserIdForLoad === null && selectedRoomIdForLoad === null) {
      return;
    }

    const isMediaContent = kind === 'media';
    const loading = isMediaContent ? sharedMediaLoading : sharedLinksLoading;
    const hasMore = isMediaContent ? sharedMediaHasMore : sharedLinksHasMore;
    const nextBefore = isMediaContent ? sharedMediaNextBefore : sharedLinksNextBefore;
    const before = options.reset ? null : nextBefore;

    if (loading || (!options.reset && (!hasMore || before === null))) {
      return;
    }

    if (isMediaContent) {
      setSharedMediaLoading(true);
      setSharedMediaError('');
    } else {
      setSharedLinksLoading(true);
      setSharedLinksError('');
    }

    try {
      const endpoint =
        selectedUserIdForLoad !== null
          ? `/messages/${selectedUserIdForLoad}/${kind}`
          : `/rooms/${selectedRoomIdForLoad}/${kind}`;
      const response = await apiClient.get<MessagePage>(endpoint, {
        params: {
          size: SHARED_CONTENT_PAGE_SIZE,
          ...(before === null ? {} : { before }),
        },
      });

      if (
        selectedUserIdRef.current !== selectedUserIdForLoad ||
        selectedRoomIdRef.current !== selectedRoomIdForLoad
      ) {
        return;
      }

      const predicate = isMediaContent ? isSharedMediaMessage : isSharedLinkMessage;
      const pageItems = response.data.items.filter(predicate);
      if (isMediaContent) {
        setSharedMediaItems((currentMessages) =>
          mergeSharedContentPage(currentMessages, pageItems, Boolean(options.reset))
        );
        setSharedMediaHasMore(response.data.hasMore);
        setSharedMediaNextBefore(response.data.nextBefore ?? null);
        setSharedMediaLoaded(true);
      } else {
        setSharedLinkItems((currentMessages) =>
          mergeSharedContentPage(currentMessages, pageItems, Boolean(options.reset))
        );
        setSharedLinksHasMore(response.data.hasMore);
        setSharedLinksNextBefore(response.data.nextBefore ?? null);
        setSharedLinksLoaded(true);
      }
    } catch (error) {
      console.error(`Failed to load shared ${kind}:`, error);
      if (
        selectedUserIdRef.current === selectedUserIdForLoad &&
        selectedRoomIdRef.current === selectedRoomIdForLoad
      ) {
        if (isMediaContent) {
          setSharedMediaError('Unable to load shared media.');
          setSharedMediaLoaded(true);
        } else {
          setSharedLinksError('Unable to load shared links.');
          setSharedLinksLoaded(true);
        }
      }
    } finally {
      if (
        selectedUserIdRef.current === selectedUserIdForLoad &&
        selectedRoomIdRef.current === selectedRoomIdForLoad
      ) {
        if (isMediaContent) {
          setSharedMediaLoading(false);
        } else {
          setSharedLinksLoading(false);
        }
      }
    }
  }, [
    sharedLinksHasMore,
    sharedLinksLoading,
    sharedLinksNextBefore,
    sharedMediaHasMore,
    sharedMediaLoading,
    sharedMediaNextBefore,
  ]);

  const loadMessageSearch = useCallback(async (options: MessageSearchLoadOptions = {}) => {
    const selectedUserIdForLoad = selectedUserIdRef.current;
    const selectedRoomIdForLoad = selectedRoomIdRef.current;
    const query = (options.query ?? messageSearchQueryRef.current).trim();
    if (selectedUserIdForLoad === null && selectedRoomIdForLoad === null) {
      return;
    }

    if (!query) {
      messageSearchRequestedQueryRef.current = '';
      setMessageSearchItems([]);
      setMessageSearchError('');
      setMessageSearchHasMore(false);
      setMessageSearchNextBefore(null);
      setActiveMessageSearchId(null);
      return;
    }

    const before = options.reset ? null : messageSearchNextBefore;
    if (!options.reset && (messageSearchLoading || !messageSearchHasMore || before === null)) {
      return;
    }

    setMessageSearchLoading(true);
    setMessageSearchError('');

    try {
      const endpoint =
        selectedUserIdForLoad !== null
          ? `/messages/${selectedUserIdForLoad}/search`
          : `/rooms/${selectedRoomIdForLoad}/search`;
      const response = await apiClient.get<MessagePage>(endpoint, {
        params: {
          query,
          size: MESSAGE_SEARCH_PAGE_SIZE,
          ...(before === null ? {} : { before }),
        },
      });

      if (
        selectedUserIdRef.current !== selectedUserIdForLoad ||
        selectedRoomIdRef.current !== selectedRoomIdForLoad ||
        messageSearchQueryRef.current.trim() !== query
      ) {
        return;
      }

      setMessageSearchItems((currentMessages) =>
        mergeSharedContentPage(currentMessages, response.data.items, Boolean(options.reset))
      );
      setMessageSearchHasMore(response.data.hasMore);
      setMessageSearchNextBefore(response.data.nextBefore ?? null);
    } catch (error) {
      console.error('Failed to search messages:', error);
      if (
        selectedUserIdRef.current === selectedUserIdForLoad &&
        selectedRoomIdRef.current === selectedRoomIdForLoad &&
        messageSearchQueryRef.current.trim() === query
      ) {
        setMessageSearchError('Unable to search messages.');
      }
    } finally {
      if (
        selectedUserIdRef.current === selectedUserIdForLoad &&
        selectedRoomIdRef.current === selectedRoomIdForLoad &&
        messageSearchQueryRef.current.trim() === query
      ) {
        setMessageSearchLoading(false);
      }
    }
  }, [messageSearchHasMore, messageSearchLoading, messageSearchNextBefore]);

  useEffect(() => {
    resetSharedContentState();
  }, [resetSharedContentState, selectedRoomId, selectedUserId]);

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
    if (
      (selectedUserId === null && selectedRoomId === null) ||
      !sharedMediaExpanded ||
      sharedMediaLoaded ||
      sharedMediaLoading
    ) {
      return;
    }

    void loadSharedContent('media', { reset: true });
  }, [
    loadSharedContent,
    selectedRoomId,
    selectedUserId,
    sharedMediaExpanded,
    sharedMediaLoaded,
    sharedMediaLoading,
  ]);

  useEffect(() => {
    if (
      (selectedUserId === null && selectedRoomId === null) ||
      !sharedLinksExpanded ||
      sharedLinksLoaded ||
      sharedLinksLoading
    ) {
      return;
    }

    void loadSharedContent('links', { reset: true });
  }, [
    loadSharedContent,
    selectedRoomId,
    selectedUserId,
    sharedLinksExpanded,
    sharedLinksLoaded,
    sharedLinksLoading,
  ]);

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
  }, [activeMessageSearchId, messageSearchItems]);

  const markMessagesScrollIntent = useCallback(() => {
    hasUserInteractedWithMessagesRef.current = true;
  }, []);

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
  }, [forceScrollToLatestMessage, releaseInitialScrollBlock]);

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

  useEffect(() => () => {
    clearInitialScrollBlockRelease();
  }, [clearInitialScrollBlockRelease]);

  useEffect(() => () => {
    clearMessageJumpEffects();
  }, [clearMessageJumpEffects]);

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

  const clearTypingTimeout = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  const clearRemoteTypingTimeout = useCallback((senderId?: number) => {
    if (senderId !== undefined) {
      const timeout = remoteTypingTimeoutsRef.current.get(senderId);
      if (timeout) {
        clearTimeout(timeout);
        remoteTypingTimeoutsRef.current.delete(senderId);
      }
      return;
    }

    remoteTypingTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    remoteTypingTimeoutsRef.current.clear();
  }, []);

  const clearOptimisticSendTimeout = useCallback((clientId: string) => {
    const timeout = sendTimeoutsRef.current.get(clientId);
    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    sendTimeoutsRef.current.delete(clientId);
  }, []);

  const clearOptimisticSendTimeouts = useCallback(() => {
    sendTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    sendTimeoutsRef.current.clear();
  }, []);

  const scheduleOptimisticSendTimeout = useCallback((clientId: string) => {
    clearOptimisticSendTimeout(clientId);

    const timeout = setTimeout(() => {
      sendTimeoutsRef.current.delete(clientId);
      setMessages((currentMessages) => markOptimisticMessageFailed(currentMessages, clientId));
    }, OPTIMISTIC_SEND_TIMEOUT_MS);

    sendTimeoutsRef.current.set(clientId, timeout);
  }, [clearOptimisticSendTimeout]);

  const showRemoteTyping = useCallback((senderId: number) => {
    setRemoteTypingUserIds((currentUserIds) =>
      currentUserIds.includes(senderId) ? currentUserIds : [...currentUserIds, senderId]
    );
    clearRemoteTypingTimeout(senderId);
    const timeout = setTimeout(() => {
      setRemoteTypingUserIds((currentUserIds) =>
        currentUserIds.filter((currentUserId) => currentUserId !== senderId)
      );
      remoteTypingTimeoutsRef.current.delete(senderId);
    }, REMOTE_TYPING_VISIBLE_MS);
    remoteTypingTimeoutsRef.current.set(senderId, timeout);
  }, [clearRemoteTypingTimeout]);

  const hideRemoteTyping = useCallback((senderId?: number) => {
    clearRemoteTypingTimeout(senderId);
    setRemoteTypingUserIds((currentUserIds) =>
      senderId === undefined
        ? []
        : currentUserIds.filter((currentUserId) => currentUserId !== senderId)
    );
  }, [clearRemoteTypingTimeout]);

  const publishTyping = useCallback((receiverId: number, typing: boolean) => {
    wsService.sendMessage(TYPING_DESTINATION, {
      receiverId,
      typing,
    });
  }, []);

  const stopTyping = useCallback((receiverId: number) => {
    clearTypingTimeout();
    publishTyping(receiverId, false);
  }, [clearTypingTimeout, publishTyping]);

  const publishRoomTyping = useCallback((roomId: number, typing: boolean) => {
    wsService.sendMessage(`${GROUP_MESSAGE_DESTINATION_PREFIX}/${roomId}/typing`, {
      typing,
    });
  }, []);

  const stopRoomTyping = useCallback((roomId: number) => {
    clearTypingTimeout();
    publishRoomTyping(roomId, false);
  }, [clearTypingTimeout, publishRoomTyping]);

  const markConversationAsRead = useCallback(async (senderId: number) => {
    setUsers((currentUsers) => resetUnreadCount(currentUsers, senderId));
    setFriends((currentFriends) => resetUnreadCount(currentFriends, senderId));

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
  }, []);

  const markRoomAsRead = useCallback(async (roomId: number) => {
    setRooms((currentRooms) => resetRoomUnreadCount(currentRooms, roomId));
    setSelectedRoom((currentSelectedRoom) =>
      currentSelectedRoom?.id === roomId ? { ...currentSelectedRoom, unreadCount: 0 } : currentSelectedRoom
    );

    try {
      const response = await apiClient.patch<ChatRoom>(`/rooms/${roomId}/read`);
      setRooms((currentRooms) => appendOrUpdateRoom(currentRooms, response.data));
      setSelectedRoom((currentSelectedRoom) =>
        currentSelectedRoom?.id === roomId ? response.data : currentSelectedRoom
      );
    } catch (error) {
      console.error('Failed to mark group as read:', error);
    }
  }, []);

  const applyRoomReadReceipt = useCallback((receipt: RoomReadReceiptEvent) => {
    const currentUserId = currentUserIdRef.current;
    if (
      currentUserId === null ||
      receipt.readerId === currentUserId ||
      receipt.roomId !== selectedRoomIdRef.current
    ) {
      return;
    }

    const reader = findKnownUserById(receipt.readerId);
    const readAt = Date.parse(receipt.readAt);
    if (!reader || Number.isNaN(readAt)) {
      return;
    }

    const readSentMessageIds = messagesRef.current
      .filter((message) => {
        const messageTimestamp = Date.parse(message.timestamp);
        return (
          message.id > 0 &&
          message.chatRoomId === receipt.roomId &&
          message.senderId === currentUserId &&
          !message.recalled &&
          !Number.isNaN(messageTimestamp) &&
          messageTimestamp <= readAt
        );
      })
      .map((message) => message.id);

    if (readSentMessageIds.length === 0) {
      return;
    }

    setRoomSeenByByMessageId((currentSeenBy) => {
      let changed = false;
      const nextSeenBy = { ...currentSeenBy };

      readSentMessageIds.forEach((messageId) => {
        const currentReaders = nextSeenBy[messageId] ?? [];
        const nextReaders = appendSeenByUser(currentReaders, reader);
        if (nextReaders !== currentReaders) {
          nextSeenBy[messageId] = nextReaders;
          changed = true;
        }
      });

      return changed ? nextSeenBy : currentSeenBy;
    });
  }, [findKnownUserById]);

  const flushPendingReadConversation = useCallback(() => {
    const pendingConversation = pendingReadConversationRef.current;
    if (!pendingConversation) {
      return false;
    }

    pendingReadConversationRef.current = null;
    setUnreadDividerMessageId(null);

    if (pendingConversation.type === 'user') {
      void markConversationAsRead(pendingConversation.id);
    } else {
      void markRoomAsRead(pendingConversation.id);
    }

    return true;
  }, [markConversationAsRead, markRoomAsRead, setUnreadDividerMessageId]);

  const completePendingReadIfAtBottom = useCallback(() => {
    if (!pendingReadConversationRef.current) {
      return false;
    }

    if (!isMessagesContainerNearBottom(messagesContainerRef.current, READ_BOTTOM_THRESHOLD)) {
      return false;
    }

    return flushPendingReadConversation();
  }, [flushPendingReadConversation]);

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

  const sendCallSignal = useCallback((payload: CallSignalPayload) => {
    const sent = wsService.sendMessage(CALL_SIGNAL_DESTINATION, payload);
    if (!sent) {
      setCallError('Call connection is not ready.');
    }

    return sent;
  }, []);

  const loadCallDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    setCallDevicesLoading(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCallDevices(devices.filter((device) =>
        device.kind === 'audioinput' || device.kind === 'videoinput'
      ));
      setCallDeviceError('');
    } catch (error) {
      console.error('Failed to load call devices:', error);
      setCallDeviceError('Unable to load microphone or camera list.');
    } finally {
      setCallDevicesLoading(false);
    }
  }, []);

  const refreshCallPermissions = useCallback(async (callType: CallType) => {
    const [microphone, camera] = await Promise.all([
      queryCallPermission('microphone'),
      callType === 'VIDEO' ? queryCallPermission('camera') : Promise.resolve('unsupported' as const),
    ]);

    setCallPermissions({ microphone, camera });
  }, []);

  const applySelectedDeviceIdsFromStream = useCallback((stream: MediaStream) => {
    const audioDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId;
    const videoDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;

    if (audioDeviceId) {
      setSelectedAudioInputId(audioDeviceId);
    }

    if (videoDeviceId) {
      setSelectedVideoInputId(videoDeviceId);
    }
  }, []);

  const stopPreCallPreview = useCallback(() => {
    stopMediaStream(preCallPreviewStreamRef.current);
    preCallPreviewStreamRef.current = null;
    setPreCallPreviewStream(null);
  }, []);

  const startPreCallPreview = useCallback(async (
    callType: CallType,
    audioInputId = selectedAudioInputId,
    videoInputId = selectedVideoInputId
  ) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPreCallError('Browser does not support media calls.');
      return null;
    }

    setPreCallPreviewLoading(true);
    setPreCallError('');
    stopMediaStream(preCallPreviewStreamRef.current);
    preCallPreviewStreamRef.current = null;
    setPreCallPreviewStream(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        buildCallMediaConstraints(callType, audioInputId, videoInputId)
      );
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !micMutedRef.current;
      });
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !cameraOffRef.current;
      });

      preCallPreviewStreamRef.current = stream;
      setPreCallPreviewStream(stream);
      applySelectedDeviceIdsFromStream(stream);
      void loadCallDevices();
      void refreshCallPermissions(callType);
      return stream;
    } catch (error) {
      console.error('Failed to start pre-call preview:', error);
      setPreCallError(getCallMediaErrorMessage(error, callType));
      void refreshCallPermissions(callType);
      return null;
    } finally {
      setPreCallPreviewLoading(false);
    }
  }, [
    applySelectedDeviceIdsFromStream,
    loadCallDevices,
    refreshCallPermissions,
    selectedAudioInputId,
    selectedVideoInputId,
  ]);

  const getLocalCallMedia = useCallback((call: ActiveCall) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Browser does not support media calls.');
    }

    const audioInputId = selectedAudioInputIdRef.current;
    const videoInputId = selectedVideoInputIdRef.current;

    return navigator.mediaDevices.getUserMedia(
      buildCallMediaConstraints(call.type, audioInputId, videoInputId)
    );
  }, []);

  const stopScreenShareResources = useCallback(() => {
    screenShareStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    screenShareStreamRef.current = null;

    const cameraTrack = screenShareCameraTrackRef.current;
    if (cameraTrack && !localCallStreamRef.current?.getTracks().includes(cameraTrack)) {
      cameraTrack.stop();
    }
    screenShareCameraTrackRef.current = null;
    screenSharingRef.current = false;
    screenShareStoppingRef.current = false;
    setScreenSharing(false);
    setRemoteScreenSharing(false);
    setScreenShareError('');
  }, []);

  const stopCallMedia = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.close();
    }
    peerConnectionRef.current = null;
    pendingIceCandidatesRef.current = [];

    stopScreenShareResources();
    localCallStreamRef.current?.getTracks().forEach((track) => track.stop());
    localCallStreamRef.current = null;
    setLocalCallStream(null);
    setRemoteCallStream(null);
    setMicMuted(false);
    setCameraOff(false);
    setCallConnectionState('idle');
    setCallStartedAt(null);
    setCallElapsedSeconds(0);
    setCallDeviceError('');
    stopIncomingCallRingtone();
  }, [stopIncomingCallRingtone, stopScreenShareResources]);

  const finishCall = useCallback((message = '') => {
    setCallMinimized(false);
    stopCallMedia();
    setActiveCallState((currentCall) =>
      currentCall ? { ...currentCall, status: 'ending' } : currentCall
    );
    if (message) {
      setCallError(message);
    }

    window.setTimeout(() => {
      setActiveCallState(null);
      setCallError('');
    }, 1500);
  }, [stopCallMedia]);

  useEffect(() => {
    if (activeCall?.direction === 'incoming' && activeCall.status === 'ringing') {
      startIncomingCallRingtone();
      return stopIncomingCallRingtone;
    }

    stopIncomingCallRingtone();
    return undefined;
  }, [
    activeCall,
    startIncomingCallRingtone,
    stopIncomingCallRingtone,
  ]);

  useEffect(() => {
    if (!activeCall) {
      return;
    }

    void loadCallDevices();
  }, [activeCall, loadCallDevices]);

  useEffect(() => {
    const callType = preCallSetup?.type ?? activeCall?.type;
    if (!callType) {
      setCallPermissions(UNKNOWN_CALL_PERMISSIONS);
      return;
    }

    void refreshCallPermissions(callType);
  }, [activeCall?.type, preCallSetup?.type, refreshCallPermissions]);

  useEffect(() => {
    if (
      !activeCall ||
      !['reconnecting', 'failed'].includes(callConnectionState) ||
      activeCall.status === 'ending'
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.status === 'ending') {
        return;
      }

      if (peerConnectionRef.current?.connectionState === 'connected') {
        setCallConnectionState('connected');
        setCallError('');
        return;
      }

      if (currentCall.callId) {
        sendCallSignal({
          eventType: 'CALL_END',
          callId: currentCall.callId,
        });
      }

      finishCall('Call connection lost.');
    }, CALL_RECONNECT_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeCall, callConnectionState, finishCall, sendCallSignal]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'ringing') {
      return undefined;
    }

    const callId = activeCall.callId;
    const timeoutId = window.setTimeout(() => {
      const currentCall = activeCallRef.current;
      if (
        currentCall?.status !== 'ringing' ||
        (callId !== undefined && currentCall.callId !== callId)
      ) {
        return;
      }

      finishCall(currentCall.direction === 'incoming' ? 'Missed call.' : 'No answer.');
    }, CALL_RINGING_TIMEOUT_MS + 12_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeCall, finishCall]);

  const getCurrentCallRole = useCallback((event: CallSignalEvent) => {
    if (event.recipientRole === 'CALLER') {
      return 'caller' as const;
    }

    if (event.recipientRole === 'RECEIVER') {
      return 'receiver' as const;
    }

    const currentAccount = currentUserRef.current;
    if (currentAccount) {
      if (
        event.caller.id === currentAccount.id ||
        event.caller.username === currentAccount.username
      ) {
        return 'caller' as const;
      }

      if (
        event.receiver.id === currentAccount.id ||
        event.receiver.username === currentAccount.username
      ) {
        return 'receiver' as const;
      }

      return null;
    }

    const currentUserId = currentUserIdRef.current;
    if (currentUserId === null) {
      return null;
    }

    if (event.caller.id === currentUserId) {
      return 'caller' as const;
    }

    if (event.receiver.id === currentUserId) {
      return 'receiver' as const;
    }

    return null;
  }, []);

  const isCallSignalFromCurrentUser = useCallback((event: CallSignalEvent) => {
    if (event.recipientRole === 'CALLER') {
      return (
        event.fromUser.id === event.caller.id ||
        event.fromUser.username === event.caller.username
      );
    }

    if (event.recipientRole === 'RECEIVER') {
      return (
        event.fromUser.id === event.receiver.id ||
        event.fromUser.username === event.receiver.username
      );
    }

    const currentAccount = currentUserRef.current;
    if (currentAccount) {
      return (
        event.fromUser.id === currentAccount.id ||
        event.fromUser.username === currentAccount.username
      );
    }

    return currentUserIdRef.current !== null && event.fromUser.id === currentUserIdRef.current;
  }, []);

  const getCallPeer = useCallback((event: CallSignalEvent) => {
    const role = getCurrentCallRole(event);
    if (!role) {
      return null;
    }

    return role === 'caller' ? event.receiver : event.caller;
  }, [getCurrentCallRole]);

  const buildCallFromSignal = useCallback((
    event: CallSignalEvent,
    status: ActiveCall['status']
  ): ActiveCall | null => {
    const role = getCurrentCallRole(event);
    const peer = getCallPeer(event);
    if (!peer || !role) {
      return null;
    }

    return {
      callId: event.callId,
      type: event.callType,
      status,
      direction: role === 'caller' ? 'outgoing' : 'incoming',
      peer,
    };
  }, [getCallPeer, getCurrentCallRole]);

  const flushPendingIceCandidates = useCallback(async (peerConnection: RTCPeerConnection) => {
    const candidates = pendingIceCandidatesRef.current;
    pendingIceCandidatesRef.current = [];

    for (const candidate of candidates) {
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.error('Failed to apply queued ICE candidate:', error);
      }
    }
  }, []);

  const createPeerConnection = useCallback(async (
    call: ActiveCall,
    initiator: boolean
  ) => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const localStream = await getLocalCallMedia(call);
    localCallStreamRef.current = localStream;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !micMutedRef.current;
    });
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = !cameraOffRef.current;
    });
    setLocalCallStream(localStream);
    applySelectedDeviceIdsFromStream(localStream);
    void loadCallDevices();
    void refreshCallPermissions(call.type);

    const peerConnection = new RTCPeerConnection({
      iceServers: RTC_ICE_SERVERS,
    });
    peerConnectionRef.current = peerConnection;
    setCallConnectionState('connecting');

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = (event) => {
      const currentCall = activeCallRef.current;
      const signalCallId = currentCall?.callId;
      if (
        !event.candidate ||
        signalCallId === undefined ||
        !canSendWebRtcSignalForCall(currentCall, call.callId)
      ) {
        return;
      }

      sendCallSignal({
        eventType: 'ICE_CANDIDATE',
        callId: signalCallId,
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      });
    };

    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        setRemoteCallStream(remoteStream);
      }
    };

    const updatePeerConnectionState = () => {
      const connectionState = peerConnection.connectionState;
      const iceConnectionState = peerConnection.iceConnectionState;

      if (connectionState === 'connected' || iceConnectionState === 'connected' || iceConnectionState === 'completed') {
        setCallConnectionState('connected');
        setCallStartedAt((currentStartedAt) => currentStartedAt ?? Date.now());
        setActiveCallState((currentCall) =>
          currentCall ? { ...currentCall, status: 'connected' } : currentCall
        );
        setCallError('');
        return;
      }

      if (connectionState === 'connecting' || iceConnectionState === 'checking') {
        setCallConnectionState('connecting');
        return;
      }

      if (connectionState === 'disconnected' || iceConnectionState === 'disconnected') {
        setCallConnectionState('reconnecting');
        setCallError('Poor connection. Trying to reconnect the call.');
        return;
      }

      if (connectionState === 'failed' || iceConnectionState === 'failed') {
        setCallConnectionState('failed');
        setCallError('Call connection failed.');
        return;
      }

      if (connectionState === 'closed' || iceConnectionState === 'closed') {
        setCallConnectionState('closed');
      }
    };
    peerConnection.onconnectionstatechange = updatePeerConnectionState;
    peerConnection.oniceconnectionstatechange = updatePeerConnectionState;

    if (initiator && canSendWebRtcSignalForCall(activeCallRef.current, call.callId)) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      if (!canSendWebRtcSignalForCall(activeCallRef.current, call.callId)) {
        return peerConnection;
      }
      sendCallSignal({
        eventType: 'WEBRTC_OFFER',
        callId: call.callId,
        sdp: offer.sdp,
      });
    }

    return peerConnection;
  }, [
    applySelectedDeviceIdsFromStream,
    getLocalCallMedia,
    loadCallDevices,
    refreshCallPermissions,
    sendCallSignal,
  ]);

  const startPeerConnection = useCallback(async (call: ActiveCall, initiator: boolean) => {
    try {
      await createPeerConnection(call, initiator);
    } catch (error) {
      console.error('Failed to start call media:', error);
      const message = getCallMediaErrorMessage(error, call.type);
      setCallError(message);
      if (call.callId) {
        sendCallSignal({
          eventType: 'CALL_END',
          callId: call.callId,
        });
      }
      finishCall(message);
    }
  }, [createPeerConnection, finishCall, sendCallSignal]);

  const handleWebRtcOffer = useCallback(async (event: CallSignalEvent) => {
    if (!event.sdp || isCallSignalFromCurrentUser(event)) {
      return;
    }

    const call = activeCallRef.current ?? buildCallFromSignal(event, 'connecting');
    if (!call) {
      return;
    }

    setActiveCallState({ ...call, status: 'connecting' });

    try {
      const peerConnection = await createPeerConnection(call, false);
      await peerConnection.setRemoteDescription({ type: 'offer', sdp: event.sdp });
      await flushPendingIceCandidates(peerConnection);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      sendCallSignal({
        eventType: 'WEBRTC_ANSWER',
        callId: event.callId,
        sdp: answer.sdp,
      });
    } catch (error) {
      console.error('Failed to handle WebRTC offer:', error);
      setCallError('Unable to connect the call.');
      sendCallSignal({
        eventType: 'CALL_END',
        callId: event.callId,
      });
      finishCall('Unable to connect the call.');
    }
  }, [
    buildCallFromSignal,
    createPeerConnection,
    finishCall,
    flushPendingIceCandidates,
    isCallSignalFromCurrentUser,
    sendCallSignal,
  ]);

  const handleWebRtcAnswer = useCallback(async (event: CallSignalEvent) => {
    if (!event.sdp || isCallSignalFromCurrentUser(event)) {
      return;
    }

    const peerConnection = peerConnectionRef.current;
    if (!peerConnection) {
      return;
    }

    try {
      await peerConnection.setRemoteDescription({ type: 'answer', sdp: event.sdp });
      await flushPendingIceCandidates(peerConnection);
    } catch (error) {
      console.error('Failed to handle WebRTC answer:', error);
      setCallError('Unable to complete the call connection.');
    }
  }, [flushPendingIceCandidates, isCallSignalFromCurrentUser]);

  const handleIceCandidate = useCallback(async (event: CallSignalEvent) => {
    if (!event.candidate || isCallSignalFromCurrentUser(event)) {
      return;
    }

    const candidate: RTCIceCandidateInit = {
      candidate: event.candidate,
      sdpMid: event.sdpMid ?? undefined,
      sdpMLineIndex: event.sdpMLineIndex ?? undefined,
    };
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection || !peerConnection.remoteDescription) {
      pendingIceCandidatesRef.current.push(candidate);
      return;
    }

    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
    }
  }, [isCallSignalFromCurrentUser]);

  const handleCallSignal = useCallback((event: CallSignalEvent) => {
    const currentRole = getCurrentCallRole(event);
    if (!currentRole) {
      return;
    }

    const isFromCurrentUser = isCallSignalFromCurrentUser(event);
    const nextCall = buildCallFromSignal(event, 'ringing');
    if (!nextCall) {
      return;
    }

    if (event.eventType === 'CALL_INVITE') {
      if (currentRole === 'caller') {
        setActiveCallState(nextCall);
        setCallError('');
        setRemoteScreenSharing(false);
        setScreenShareError('');
        return;
      }

      const currentCall = activeCallRef.current;
      if (currentCall && currentCall.callId !== event.callId) {
        sendCallSignal({
          eventType: 'CALL_REJECT',
          callId: event.callId,
        });
        return;
      }

      stopPreCallPreview();
      setPreCallSetup(null);
      setActiveCallState(nextCall);
      setCallError('');
      setRemoteScreenSharing(false);
      setScreenShareError('');
      notifyWithBrowserNotification({
        title: event.callType === 'VIDEO' ? 'Incoming video call' : 'Incoming audio call',
        body: `${getUserDisplayName(event.caller)} is calling you.`,
        path: getUserChatRoute(event.caller.username),
        user: event.caller,
        browserTag: `call-${event.callId}`,
      });
      return;
    }

    if (
      activeCallRef.current?.callId !== event.callId &&
      ![
        'WEBRTC_OFFER',
        'WEBRTC_ANSWER',
        'ICE_CANDIDATE',
        'SCREEN_SHARE_START',
        'SCREEN_SHARE_STOP',
      ].includes(event.eventType)
    ) {
      setActiveCallState(nextCall);
    }

    if (event.eventType === 'CALL_ACCEPT') {
      const connectingCall = { ...nextCall, status: 'connecting' as const };
      setActiveCallState(connectingCall);
      if (currentRole === 'receiver') {
        void startPeerConnection(connectingCall, false);
      } else if (!isFromCurrentUser && currentRole === 'caller') {
        void startPeerConnection(connectingCall, true);
      }
      return;
    }

    if (event.eventType === 'CALL_REJECT') {
      finishCall('Call declined.');
      return;
    }

    if (event.eventType === 'CALL_BUSY') {
      finishCall('User is busy.');
      return;
    }

    if (event.eventType === 'CALL_MISSED') {
      finishCall('Missed call.');
      return;
    }

    if (event.eventType === 'CALL_CANCEL') {
      finishCall('Call canceled.');
      return;
    }

    if (event.eventType === 'CALL_END') {
      finishCall('Call ended.');
      return;
    }

    if (event.eventType === 'SCREEN_SHARE_START') {
      if (!isFromCurrentUser) {
        setRemoteScreenSharing(true);
      }
      return;
    }

    if (event.eventType === 'SCREEN_SHARE_STOP') {
      if (!isFromCurrentUser) {
        setRemoteScreenSharing(false);
      }
      return;
    }

    if (event.eventType === 'WEBRTC_OFFER') {
      void handleWebRtcOffer(event);
      return;
    }

    if (event.eventType === 'WEBRTC_ANSWER') {
      void handleWebRtcAnswer(event);
      return;
    }

    if (event.eventType === 'ICE_CANDIDATE') {
      void handleIceCandidate(event);
    }
  }, [
    buildCallFromSignal,
    finishCall,
    getCurrentCallRole,
    handleIceCandidate,
    handleWebRtcAnswer,
    handleWebRtcOffer,
    isCallSignalFromCurrentUser,
    notifyWithBrowserNotification,
    sendCallSignal,
    startPeerConnection,
    stopPreCallPreview,
  ]);

  const sendActiveCallCloseSignal = useCallback(() => {
    const currentCall = activeCallRef.current;
    if (!currentCall?.callId) {
      return;
    }

    if (currentCall.status === 'ringing' && currentCall.direction !== 'outgoing') {
      return;
    }

    const eventType =
      currentCall.status === 'ringing' && currentCall.direction === 'outgoing'
        ? 'CALL_CANCEL'
        : 'CALL_END';

    wsService.sendMessage(CALL_SIGNAL_DESTINATION, {
      eventType,
      callId: currentCall.callId,
    });
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      sendActiveCallCloseSignal();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sendActiveCallCloseSignal]);

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

          const currentUserId = currentUserIdRef.current;
          const selectedUserIdForMessage = selectedUserIdRef.current;
          const selectedRoomIdForMessage = selectedRoomIdRef.current;
          const isIncomingFromOther = incomingMessage.senderId !== currentUserId;
          const isActiveMessage = isActiveConversationMessage(
            incomingMessage,
            currentUserId,
            selectedUserIdForMessage,
            selectedRoomIdForMessage
          );
          const pageIsFocused =
            typeof document === 'undefined' || (!document.hidden && document.hasFocus());
          const wasAtBottomBeforeMessage =
            isActiveMessage &&
            isMessagesContainerNearBottom(
              messagesContainerRef.current,
              AUTO_SCROLL_BOTTOM_THRESHOLD
            );
          const canMarkActiveIncomingAsRead =
            isIncomingFromOther &&
            pageIsFocused &&
            wasAtBottomBeforeMessage &&
            pendingReadConversationRef.current === null;
          const conversationMuted = isMutedIncomingConversation(
            incomingMessage,
            currentUserId,
            usersRef.current,
            friendsRef.current,
            roomsRef.current
          );
          const shouldNotifyIncomingMessage =
            isIncomingFromOther && !conversationMuted && (!isActiveMessage || !pageIsFocused);

          setMessages((currentMessages) => {
            if (
              !isActiveConversationMessage(
                incomingMessage,
                currentUserId,
                selectedUserIdForMessage,
                selectedRoomIdForMessage
              )
            ) {
              return currentMessages;
            }

            return appendOrReconcileMessage(currentMessages, incomingMessage);
          });
          addIncomingSharedContent(incomingMessage);

          if (incomingMessage.clientId) {
            clearOptimisticSendTimeout(incomingMessage.clientId);
          }

          if (shouldNotifyIncomingMessage) {
            const notif = buildMessageNotification(incomingMessage);
            notifyWithBrowserNotification(notif, notif.isMention);
          }

          if (incomingMessage.chatRoomId) {
            const isActiveRoomMessage = incomingMessage.chatRoomId === selectedRoomIdForMessage;

            if (!roomsRef.current.some((room) => room.id === incomingMessage.chatRoomId)) {
              void apiClient
                .get<ChatRoom>(`/rooms/${incomingMessage.chatRoomId}`)
                .then((response) => {
                  if (!active) {
                    return;
                  }

                  const withPreview = applyRoomPreviewToRoom(response.data, incomingMessage);
                  const restoredRoom = {
                    ...withPreview,
                    unreadCount:
                      isIncomingFromOther && !isActiveRoomMessage
                        ? (withPreview.unreadCount ?? 0) + 1
                        : withPreview.unreadCount ?? 0,
                  };
                  setRooms((currentRooms) => appendOrUpdateRoom(currentRooms, restoredRoom));
                })
                .catch((error) => console.error('Failed to restore group conversation:', error));
            }

            setRooms((currentRooms) =>
              applyRoomPreviewToRooms(
                currentRooms,
                incomingMessage,
                currentUserId,
                selectedRoomIdForMessage
              )
            );
            setSelectedRoom((currentSelectedRoom) => {
              if (!currentSelectedRoom || currentSelectedRoom.id !== incomingMessage.chatRoomId) {
                return currentSelectedRoom;
              }

              const withPreview = applyRoomPreviewToRoom(currentSelectedRoom, incomingMessage);
              return {
                ...withPreview,
                unreadCount:
                  isIncomingFromOther && !isActiveRoomMessage
                    ? (withPreview.unreadCount ?? 0) + 1
                    : 0,
              };
            });

            if (
              isIncomingFromOther &&
              incomingMessage.chatRoomId === selectedRoomIdForMessage
            ) {
              if (canMarkActiveIncomingAsRead) {
                void markRoomAsRead(incomingMessage.chatRoomId);
              } else {
                addPendingUnreadMessage('room', incomingMessage.chatRoomId, incomingMessage);
              }
            }

            return;
          }

          if (
            isIncomingFromOther &&
            !userSearchQueryRef.current.trim() &&
            !usersRef.current.some((user) => user.id === incomingMessage.senderId) &&
            incomingMessage.senderUsername
          ) {
            void apiClient
              .get<User>(`/users/${encodeURIComponent(incomingMessage.senderUsername)}`)
              .then((response) => {
                if (!active) {
                  return;
                }

                setUsers((currentUsers) => {
                  if (currentUsers.some((user) => user.id === response.data.id)) {
                    return currentUsers;
                  }

                  return [
                    ...currentUsers,
                    applyConversationPreviewToUser(response.data, incomingMessage, currentUserId),
                  ].sort(compareUsersByChatActivity);
                });
              })
              .catch((error) => console.error('Failed to load direct message sender:', error));
          }

          setUsers((currentUsers) =>
            applyConversationPreviewToUsers(
              currentUsers,
              incomingMessage,
              currentUserId,
              !userSearchQueryRef.current.trim()
            )
          );
          setFriends((currentFriends) =>
            applyConversationPreviewToUsers(
              currentFriends,
              incomingMessage,
              currentUserId,
              true
            )
          );
          setSelectedUser((currentSelectedUser) =>
            currentSelectedUser
              ? applyConversationPreviewToUser(
                currentSelectedUser,
                incomingMessage,
                currentUserId
              )
              : null
          );

          if (
            isIncomingFromOther &&
            incomingMessage.senderId === selectedUserIdForMessage
          ) {
            if (canMarkActiveIncomingAsRead) {
              markConversationAsRead(incomingMessage.senderId);
            } else {
              addPendingUnreadMessage('user', incomingMessage.senderId, incomingMessage);
              setSelectedUser((currentSelectedUser) =>
                currentSelectedUser?.id === incomingMessage.senderId
                  ? {
                    ...currentSelectedUser,
                    unreadCount: 0,
                  }
                  : currentSelectedUser
              );
            }
            return;
          }

          if (isIncomingFromOther) {
            setUsers((currentUsers) => incrementUnreadCount(currentUsers, incomingMessage.senderId));
            setFriends((currentFriends) => incrementUnreadCount(currentFriends, incomingMessage.senderId));
          }
        },
        (presence) => {
          if (!active) {
            return;
          }

          setUsers((currentUsers) =>
            currentUsers.map((user) => applyPresenceToUser(user, presence))
          );
          setFriends((currentFriends) =>
            currentFriends.map((user) => applyPresenceToUser(user, presence))
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
          if (!active || typing.senderId === currentUserIdRef.current) {
            return;
          }

          if (typing.roomId) {
            if (typing.roomId !== selectedRoomIdRef.current) {
              return;
            }
          } else if (!isTypingFromSelectedUser(typing, selectedUserIdRef.current)) {
            return;
          }

          if (typing.typing) {
            showRemoteTyping(typing.senderId);
          } else {
            hideRemoteTyping(typing.senderId);
          }
        },
        (receipt) => {
          if (!active) {
            return;
          }

          setMessages((currentMessages) => applyReadReceipt(currentMessages, receipt));
          if (receipt.readerId === currentUserIdRef.current) {
            setUsers((currentUsers) => resetUnreadCount(currentUsers, receipt.senderId));
            setFriends((currentFriends) => resetUnreadCount(currentFriends, receipt.senderId));
          }
        },
        (status) => {
          if (!active) {
            return;
          }

          const browserAwareStatus = getBrowserAwareConnectionStatus(status);
          const isOnline = browserAwareStatus === 'connected';
          setCurrentUser((currentAccount) => {
            if (!currentAccount || currentAccount.online === isOnline) {
              return currentAccount;
            }

            return { ...currentAccount, online: isOnline };
          });

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
            loadIncomingFriendRequests({ silent: true }),
            loadFriendSummary({ silent: true }),
            selectedUserIdForResync !== null
              ? loadMessages(selectedUserIdForResync, { silent: true })
              : selectedRoomIdForResync !== null
                ? loadRoomMessages(selectedRoomIdForResync, { silent: true })
                : Promise.resolve(),
          ])
            .then(() => {
              if (
                selectedUserIdForResync !== null &&
                selectedUserIdRef.current === selectedUserIdForResync &&
                isMessagesContainerNearBottom(messagesContainerRef.current, READ_BOTTOM_THRESHOLD)
              ) {
                void markConversationAsRead(selectedUserIdForResync);
              } else if (
                selectedRoomIdForResync !== null &&
                selectedRoomIdRef.current === selectedRoomIdForResync &&
                isMessagesContainerNearBottom(messagesContainerRef.current, READ_BOTTOM_THRESHOLD)
              ) {
                void markRoomAsRead(selectedRoomIdForResync);
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

          applyRoomMembershipUpdate(room);
        },
        (friendship) => {
          if (!active) {
            return;
          }

          const notification = buildFriendshipNotification(friendship);
          if (notification) {
            notifyWithBrowserNotification(notification);
          }

          void Promise.all([
            loadUsers({ silent: true }),
            loadIncomingFriendRequests({ silent: true }),
            loadFriendSummary({ silent: true }),
          ]);
        },
        (updatedMessage) => {
          if (!active) {
            return;
          }

          applyMessageUpdate(updatedMessage);
        },
        (roomReadReceipt) => {
          if (!active) {
            return;
          }

          applyRoomReadReceipt(roomReadReceipt);
        },
        (callSignal) => {
          if (!active) {
            return;
          }

          handleCallSignal(callSignal);
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
      sendActiveCallCloseSignal();
      stopCallMedia();
      wsService.disconnect();
    };
  }, [
    clearOptimisticSendTimeout,
    clearOptimisticSendTimeouts,
    clearRemoteTypingTimeout,
    clearTypingTimeout,
    addIncomingSharedContent,
    addPendingUnreadMessage,
    applyMessageUpdate,
    applyRoomReadReceipt,
    applyRoomMembershipUpdate,
    buildFriendshipNotification,
    buildMessageNotification,
    currentUser?.id,
    handleCallSignal,
    hideRemoteTyping,
    loadFriendSummary,
    loadIncomingFriendRequests,
    loadMessages,
    loadRoomMessages,
    loadRooms,
    loadUsers,
    markConversationAsRead,
    markRoomAsRead,
    notifyWithBrowserNotification,
    sendActiveCallCloseSignal,
    showRemoteTyping,
    stopCallMedia,
  ]);

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
  ]);

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
      setUsers((currentUsers) =>
        applyConversationPreviewToUsers(
          currentUsers,
          response.data,
          currentUserIdRef.current,
          !userSearchQueryRef.current.trim()
        )
      );
      setFriends((currentFriends) =>
        applyConversationPreviewToUsers(currentFriends, response.data, currentUserIdRef.current, true)
      );
      setSelectedUser((currentSelectedUser) =>
        currentSelectedUser
          ? applyConversationPreviewToUser(currentSelectedUser, response.data, currentUserIdRef.current)
          : null
      );
      addIncomingSharedContent(response.data);
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
      setRooms((currentRooms) =>
        applyRoomPreviewToRooms(
          currentRooms,
          response.data,
          currentUserIdRef.current,
          selectedRoomIdRef.current
        )
      );
      setSelectedRoom((currentSelectedRoom) => {
        if (!currentSelectedRoom || currentSelectedRoom.id !== response.data.chatRoomId) {
          return currentSelectedRoom;
        }

        return {
          ...applyRoomPreviewToRoom(currentSelectedRoom, response.data),
          unreadCount: 0,
        };
      });
      addIncomingSharedContent(response.data);
    } catch (error) {
      console.error('Failed to send group message:', error);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((currentMessages) => markOptimisticMessageFailed(currentMessages, payload.clientId));
    }
  };

  const sendOutgoingCallInvite = useCallback((callType: CallType, targetUser: User) => {
    if (activeCallRef.current || !canChatWithUser(targetUser)) {
      return false;
    }

    const optimisticCall: ActiveCall = {
      type: callType,
      status: 'ringing',
      direction: 'outgoing',
      peer: targetUser,
    };

    void loadCallDevices();
    setCallConnectionState('idle');
    setCallStartedAt(null);
    setCallElapsedSeconds(0);
    setCallDeviceError('');
    setScreenSharing(false);
    setRemoteScreenSharing(false);
    setScreenShareError('');
    screenSharingRef.current = false;

    if (
      sendCallSignal({
        eventType: 'CALL_INVITE',
        receiverId: targetUser.id,
        callType,
      })
    ) {
      setActiveCallState(optimisticCall);
      setCallError('');
      return true;
    }

    return false;
  }, [loadCallDevices, sendCallSignal]);

  const openPreCallSetupForUser = useCallback((targetUser: User, callType: CallType) => {
    if (!canChatWithUser(targetUser) || activeCallRef.current) {
      return;
    }

    micMutedRef.current = false;
    cameraOffRef.current = false;
    setMicMuted(false);
    setCameraOff(false);
    setPreCallSetup({ type: callType, target: targetUser });
    setPreCallError('');
    setPreCallSubmitting(false);
    setCallDeviceError('');
    setCallError('');
    setScreenShareError('');
    setRemoteScreenSharing(false);
    void loadCallDevices();
    void startPreCallPreview(callType);
  }, [loadCallDevices, startPreCallPreview]);

  const handleStartCall = useCallback((callType: CallType) => {
    if (!selectedUser) {
      return;
    }

    openPreCallSetupForUser(selectedUser, callType);
  }, [openPreCallSetupForUser, selectedUser]);

  const handleClosePreCallSetup = useCallback(() => {
    if (preCallSubmitting) {
      return;
    }

    stopPreCallPreview();
    setPreCallSetup(null);
    setPreCallError('');
    setPreCallSubmitting(false);
  }, [preCallSubmitting, stopPreCallPreview]);

  const handlePreCallRetryPreview = useCallback(() => {
    if (!preCallSetup) {
      return;
    }

    void startPreCallPreview(preCallSetup.type);
  }, [preCallSetup, startPreCallPreview]);

  const handleConfirmStartCall = useCallback(async () => {
    if (!preCallSetup || preCallPreviewLoading || preCallSubmitting) {
      return;
    }

    setPreCallSubmitting(true);
    const stream = preCallPreviewStreamRef.current ??
      (await startPreCallPreview(preCallSetup.type));
    if (!stream) {
      setPreCallSubmitting(false);
      return;
    }

    stopPreCallPreview();
    const sent = sendOutgoingCallInvite(preCallSetup.type, preCallSetup.target);
    if (sent) {
      setPreCallSetup(null);
      setPreCallError('');
      setPreCallSubmitting(false);
      return;
    }

    setPreCallError('Call connection is not ready.');
    setPreCallSubmitting(false);
  }, [
    preCallPreviewLoading,
    preCallSetup,
    preCallSubmitting,
    sendOutgoingCallInvite,
    startPreCallPreview,
    stopPreCallPreview,
  ]);

  const handlePreCallAudioInputChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextAudioInputId = event.target.value;
    setSelectedAudioInputId(nextAudioInputId);
    if (preCallSetup) {
      void startPreCallPreview(preCallSetup.type, nextAudioInputId, selectedVideoInputId);
    }
  }, [preCallSetup, selectedVideoInputId, startPreCallPreview]);

  const handlePreCallVideoInputChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextVideoInputId = event.target.value;
    setSelectedVideoInputId(nextVideoInputId);
    if (preCallSetup) {
      void startPreCallPreview(preCallSetup.type, selectedAudioInputId, nextVideoInputId);
    }
  }, [preCallSetup, selectedAudioInputId, startPreCallPreview]);

  const handlePreCallToggleMic = useCallback(() => {
    const nextMuted = !micMutedRef.current;
    micMutedRef.current = nextMuted;
    preCallPreviewStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  }, []);

  const handlePreCallToggleCamera = useCallback(() => {
    const nextCameraOff = !cameraOffRef.current;
    cameraOffRef.current = nextCameraOff;
    preCallPreviewStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    setCameraOff(nextCameraOff);
  }, []);

  const handleRetryActiveCall = useCallback(() => {
    const currentCall = activeCallRef.current;
    if (!currentCall) {
      return;
    }

    if (currentCall.callId) {
      sendCallSignal({
        eventType: 'CALL_END',
        callId: currentCall.callId,
      });
    }

    stopCallMedia();
    setActiveCallState(null);
    setCallError('');
    micMutedRef.current = false;
    cameraOffRef.current = false;
    setMicMuted(false);
    setCameraOff(false);
    setPreCallSetup({ type: currentCall.type, target: currentCall.peer });
    setPreCallError('');
    setPreCallSubmitting(false);
    setScreenSharing(false);
    setRemoteScreenSharing(false);
    setScreenShareError('');
    screenSharingRef.current = false;
    void loadCallDevices();
    void startPreCallPreview(currentCall.type);
  }, [loadCallDevices, sendCallSignal, startPreCallPreview, stopCallMedia]);

  const handleAcceptCall = useCallback(() => {
    const currentCall = activeCallRef.current;
    if (!currentCall?.callId || currentCall.direction !== 'incoming') {
      return;
    }

    stopIncomingCallRingtone();
    void loadCallDevices();

    if (sendCallSignal({ eventType: 'CALL_ACCEPT', callId: currentCall.callId })) {
      setActiveCallState({ ...currentCall, status: 'connecting' });
      setCallError('');
    }
  }, [loadCallDevices, sendCallSignal, stopIncomingCallRingtone]);

  const handleRejectCall = useCallback(() => {
    const currentCall = activeCallRef.current;
    if (!currentCall?.callId) {
      finishCall('Call declined.');
      return;
    }

    sendCallSignal({ eventType: 'CALL_REJECT', callId: currentCall.callId });
    finishCall('Call declined.');
  }, [finishCall, sendCallSignal]);

  const handleEndCall = useCallback(() => {
    const currentCall = activeCallRef.current;
    if (!currentCall?.callId) {
      finishCall('Call ended.');
      return;
    }

    const eventType =
      currentCall.status === 'ringing' && currentCall.direction === 'outgoing'
        ? 'CALL_CANCEL'
        : 'CALL_END';

    sendCallSignal({ eventType, callId: currentCall.callId });
    finishCall(eventType === 'CALL_CANCEL' ? 'Call canceled.' : 'Call ended.');
  }, [finishCall, sendCallSignal]);

  const handleToggleMic = useCallback(() => {
    const localStream = localCallStreamRef.current;
    const nextMuted = !micMuted;
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  }, [micMuted]);

  const handleToggleCamera = useCallback(() => {
    if (screenSharingRef.current) {
      return;
    }

    const localStream = localCallStreamRef.current;
    const nextCameraOff = !cameraOff;
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    setCameraOff(nextCameraOff);
  }, [cameraOff]);

  const replaceLocalCallTrack = useCallback(async (kind: 'audio' | 'video', deviceId: string) => {
    if (kind === 'audio') {
      setSelectedAudioInputId(deviceId);
    } else {
      setSelectedVideoInputId(deviceId);
    }

    const currentCall = activeCallRef.current;
    if (kind === 'video' && screenSharingRef.current) {
      return;
    }

    if (!currentCall || (kind === 'video' && currentCall.type !== 'VIDEO')) {
      return;
    }

    const currentStream = localCallStreamRef.current;
    if (!currentStream) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCallDeviceError('Browser does not support media device switching.');
      return;
    }

    setCallDeviceError('');

    try {
      const constraints: MediaStreamConstraints =
        kind === 'audio'
          ? {
            audio: deviceId ? { deviceId: { exact: deviceId } } : true,
            video: false,
          }
          : {
            audio: false,
            video: deviceId ? { deviceId: { exact: deviceId } } : true,
          };
      const replacementStream = await navigator.mediaDevices.getUserMedia(constraints);
      const [replacementTrack] =
        kind === 'audio'
          ? replacementStream.getAudioTracks()
          : replacementStream.getVideoTracks();

      if (!replacementTrack) {
        throw new Error(`No ${kind} track found for selected device.`);
      }

      replacementTrack.enabled = kind === 'audio' ? !micMuted : !cameraOff;

      const sender = peerConnectionRef.current
        ?.getSenders()
        .find((candidate) => candidate.track?.kind === kind);
      if (sender) {
        await sender.replaceTrack(replacementTrack);
      }

      const oldTracks =
        kind === 'audio' ? currentStream.getAudioTracks() : currentStream.getVideoTracks();
      oldTracks.forEach((track) => {
        currentStream.removeTrack(track);
        track.stop();
      });
      currentStream.addTrack(replacementTrack);
      replacementStream
        .getTracks()
        .filter((track) => track !== replacementTrack)
        .forEach((track) => track.stop());

      const nextStream = new MediaStream(currentStream.getTracks());
      localCallStreamRef.current = nextStream;
      setLocalCallStream(nextStream);

      const nextDeviceId = replacementTrack.getSettings().deviceId || deviceId;
      if (kind === 'audio') {
        setSelectedAudioInputId(nextDeviceId);
      } else {
        setSelectedVideoInputId(nextDeviceId);
      }

      void loadCallDevices();
    } catch (error) {
      console.error(`Failed to switch ${kind} device:`, error);
      setCallDeviceError(
        kind === 'audio' ? 'Unable to switch microphone.' : 'Unable to switch camera.'
      );
    }
  }, [cameraOff, loadCallDevices, micMuted]);

  const handleStopScreenShare = useCallback(async (notify = true) => {
    if (screenShareStoppingRef.current) {
      return;
    }

    screenShareStoppingRef.current = true;
    const currentCall = activeCallRef.current;
    const currentStream = localCallStreamRef.current;
    const screenShareStream = screenShareStreamRef.current;
    const cameraTrack = screenShareCameraTrackRef.current;

    try {
      if (cameraTrack) {
        cameraTrack.enabled = !cameraOffRef.current;
      }

      const sender = peerConnectionRef.current
        ?.getSenders()
        .find((candidate) => candidate.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(cameraTrack ?? null);
      }

      if (currentStream) {
        currentStream.getVideoTracks().forEach((track) => {
          currentStream.removeTrack(track);
        });

        if (cameraTrack) {
          currentStream.addTrack(cameraTrack);
        }

        const nextStream = new MediaStream(currentStream.getTracks());
        localCallStreamRef.current = nextStream;
        setLocalCallStream(nextStream);

        if (cameraTrack) {
          applySelectedDeviceIdsFromStream(nextStream);
        }
      }

      screenShareStream?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      screenShareStreamRef.current = null;
      screenShareCameraTrackRef.current = null;
      screenSharingRef.current = false;
      setScreenSharing(false);
      setScreenShareError('');

      if (
        notify &&
        currentCall?.callId &&
        canSendWebRtcSignalForCall(currentCall, currentCall.callId)
      ) {
        sendCallSignal({
          eventType: 'SCREEN_SHARE_STOP',
          callId: currentCall.callId,
        });
      }
    } catch (error) {
      console.error('Failed to stop screen sharing:', error);
      setScreenShareError('Unable to stop screen sharing.');
    } finally {
      screenShareStoppingRef.current = false;
    }
  }, [applySelectedDeviceIdsFromStream, sendCallSignal]);

  const handleStartScreenShare = useCallback(async () => {
    const currentCall = activeCallRef.current;
    const currentStream = localCallStreamRef.current;
    const peerConnection = peerConnectionRef.current;

    if (
      !currentCall?.callId ||
      currentCall.type !== 'VIDEO' ||
      !canSendWebRtcSignalForCall(currentCall, currentCall.callId)
    ) {
      return;
    }

    if (screenSharingRef.current || screenShareStoppingRef.current) {
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenShareError('Browser does not support screen sharing.');
      return;
    }

    if (!currentStream || !peerConnection) {
      setScreenShareError('Call video is not ready.');
      return;
    }

    setScreenShareError('');
    let displayStream: MediaStream | null = null;

    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const [screenTrack] = displayStream.getVideoTracks();
      if (!screenTrack) {
        throw new Error('No screen track selected.');
      }

      const sender = peerConnection
        .getSenders()
        .find((candidate) => candidate.track?.kind === 'video');
      if (!sender) {
        throw new Error('Video sender is not ready.');
      }

      const [cameraTrack] = currentStream.getVideoTracks();
      screenShareCameraTrackRef.current = cameraTrack ?? null;

      await sender.replaceTrack(screenTrack);

      currentStream.getVideoTracks().forEach((track) => {
        currentStream.removeTrack(track);
      });
      currentStream.addTrack(screenTrack);

      const nextStream = new MediaStream(currentStream.getTracks());
      localCallStreamRef.current = nextStream;
      screenShareStreamRef.current = displayStream;
      screenSharingRef.current = true;
      setLocalCallStream(nextStream);
      setScreenSharing(true);
      setScreenShareError('');

      screenTrack.onended = () => {
        if (!screenShareStoppingRef.current) {
          void handleStopScreenShare();
        }
      };

      sendCallSignal({
        eventType: 'SCREEN_SHARE_START',
        callId: currentCall.callId,
      });
    } catch (error) {
      console.error('Failed to start screen sharing:', error);
      displayStream?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      screenShareStreamRef.current = null;
      screenShareCameraTrackRef.current = null;
      screenSharingRef.current = false;
      setScreenSharing(false);
      setScreenShareError(getScreenShareErrorMessage(error));
    }
  }, [handleStopScreenShare, sendCallSignal]);

  const handleAudioInputChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    void replaceLocalCallTrack('audio', event.target.value);
  }, [replaceLocalCallTrack]);

  const handleVideoInputChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    void replaceLocalCallTrack('video', event.target.value);
  }, [replaceLocalCallTrack]);

  const navigateIfNeeded = useCallback((path: string, options: { replace?: boolean } = {}) => {
    if (location.pathname !== path) {
      navigate(path, options);
    }
  }, [location.pathname, navigate]);

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
    viewedProfileUsernameRef.current = '';
    setViewedProfileUser(null);
    setDetailsOpen(shouldOpenConversationDetailsByDefault());
    hideRemoteTyping();
  }, [clearPendingReadConversation, hideRemoteTyping, resetMessagePagination, stopRoomTyping, stopTyping]);

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
    viewedProfileUsernameRef.current = '';
    setViewedProfileUser(null);
    setDetailsOpen(shouldOpenConversationDetailsByDefault());
    hideRemoteTyping();

    const unreadCount = user.unreadCount ?? 0;
    if (conversationChanged || unreadCount > 0) {
      preparePendingReadConversation('user', user.id, unreadCount);
    }

    if (conversationChanged) {
      void loadMessages(user.id);
    }
  }, [canOpenDirectConversation, hideRemoteTyping, loadMessages, preparePendingReadConversation, stopRoomTyping, stopTyping]);

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
    viewedProfileUsernameRef.current = '';
    setViewedProfileUser(null);
    setDetailsOpen(shouldOpenConversationDetailsByDefault());
    hideRemoteTyping();

    const unreadCount = room.unreadCount ?? 0;
    if (conversationChanged || unreadCount > 0) {
      preparePendingReadConversation('room', room.id, unreadCount);
    }

    if (conversationChanged) {
      void loadRoomMessages(room.id);
    }
  }, [hideRemoteTyping, loadRoomMessages, preparePendingReadConversation, stopRoomTyping, stopTyping]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    const routeStateForPath = parseChatRoute(location.pathname);

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
    currentUser?.id,
    loadFriendSummary,
    loadIncomingFriendRequests,
    loadUsers,
    location.pathname,
    navigate,
  ]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    let active = true;
    const routeStateForPath = parseChatRoute(location.pathname);
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
        if (!active) {
          return;
        }

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
    currentUser?.id,
    friends,
    location.pathname,
    navigate,
    rooms,
    roomsLoading,
    users,
    usersError,
    usersLoading,
  ]);

  const setFriendActionPending = (key: string, pending: boolean) => {
    setFriendActionKeys((currentKeys) =>
      pending
        ? [...new Set([...currentKeys, key])]
        : currentKeys.filter((currentKey) => currentKey !== key)
    );
  };

  const refreshFriendshipState = async () => {
    await Promise.all([
      loadUsers({ silent: true }),
      loadIncomingFriendRequests({ silent: true }),
      loadFriendSummary({ silent: true }),
    ]);
  };

  const updateViewedProfileFromFriendship = (friendship: Friendship) => {
    setViewedProfileUser((currentProfileUser) =>
      currentProfileUser
        ? applyFriendshipToProfileUser(currentProfileUser, friendship, currentUserIdRef.current)
        : null
    );
  };

  const handleOpenRequestsPanel = () => {
    navigateIfNeeded(getRequestsRoute());
    setMainView('requests');
    setProfileMenuOpen(false);
    void Promise.all([
      loadIncomingFriendRequests({ silent: incomingFriendRequests.length > 0 }),
      loadFriendSummary({ silent: true }),
    ]);
  };

  const handleSendFriendRequest = async (user: User) => {
    const actionKey = `send-${user.id}`;
    setFriendActionPending(actionKey, true);
    setUsersError('');
    setProfileActionError('');

    try {
      const response = await apiClient.post<Friendship>('/friend-requests', {
        receiverId: user.id,
      });
      updateViewedProfileFromFriendship(response.data);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to send friend request:', error);
      setUsersError('Unable to send friend request.');
      setProfileActionError('Unable to send friend request.');
    } finally {
      setFriendActionPending(actionKey, false);
    }
  };

  const handleAcceptFriendRequest = async (requestId: number, actionKey: string) => {
    setFriendActionPending(actionKey, true);
    setFriendRequestsError('');
    setProfileActionError('');

    try {
      const response = await apiClient.patch<Friendship>(`/friend-requests/${requestId}/accept`);
      updateViewedProfileFromFriendship(response.data);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to accept friend request:', error);
      setFriendRequestsError('Unable to accept request.');
      setProfileActionError('Unable to accept request.');
    } finally {
      setFriendActionPending(actionKey, false);
    }
  };

  const handleDeclineFriendRequest = async (requestId: number, actionKey: string) => {
    setFriendActionPending(actionKey, true);
    setFriendRequestsError('');
    setProfileActionError('');

    try {
      const response = await apiClient.patch<Friendship>(`/friend-requests/${requestId}/decline`);
      updateViewedProfileFromFriendship(response.data);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to decline friend request:', error);
      setFriendRequestsError('Unable to decline request.');
      setProfileActionError('Unable to decline request.');
    } finally {
      setFriendActionPending(actionKey, false);
    }
  };

  const handleCancelFriendRequest = async (user: User) => {
    if (!user.friendshipId) {
      return;
    }

    const actionKey = `cancel-${user.id}`;
    setFriendActionPending(actionKey, true);
    setUsersError('');
    setProfileActionError('');

    try {
      await apiClient.delete(`/friend-requests/${user.friendshipId}`);
      setViewedProfileUser((currentProfileUser) =>
        currentProfileUser?.id === user.id
          ? { ...currentProfileUser, friendshipId: undefined, friendshipStatus: 'none' }
          : currentProfileUser
      );
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to cancel friend request:', error);
      setUsersError('Unable to cancel friend request.');
      setProfileActionError('Unable to cancel friend request.');
    } finally {
      setFriendActionPending(actionKey, false);
    }
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

  const handleMinimizeActiveCall = useCallback(() => {
    const currentCall = activeCallRef.current;
    if (
      !currentCall ||
      currentCall.status === 'ending' ||
      (currentCall.direction === 'incoming' && currentCall.status === 'ringing')
    ) {
      return;
    }

    setCallMinimized(true);
  }, []);

  const handleRestoreActiveCall = useCallback(() => {
    setCallMinimized(false);
  }, []);

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

  const handleOpenUserProfile = async (user: User) => {
    const requestedUsername = user.username;
    viewedProfileUsernameRef.current = requestedUsername;
    setViewedProfileUser(user);
    setProfileActionError('');
    setViewedProfileError('');
    setViewedProfileLoading(true);
    setProfileMenuOpen(false);

    try {
      const response = await apiClient.get<User>(`/users/${encodeURIComponent(requestedUsername)}`);
      setViewedProfileUser((currentProfileUser) =>
        currentProfileUser?.username === requestedUsername
          ? { ...currentProfileUser, ...response.data }
          : currentProfileUser
      );
    } catch (error) {
      console.error('Failed to load user profile:', error);
      if (viewedProfileUsernameRef.current === requestedUsername) {
        setViewedProfileError('Unable to refresh profile.');
      }
    } finally {
      if (viewedProfileUsernameRef.current === requestedUsername) {
        setViewedProfileLoading(false);
      }
    }
  };

  const handleCloseUserProfile = () => {
    viewedProfileUsernameRef.current = '';
    setViewedProfileUser(null);
    setViewedProfileLoading(false);
    setViewedProfileError('');
    setProfileActionError('');
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

  const handleCreateGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) {
      return;
    }

    if (selectedGroupMemberIds.length < MIN_GROUP_INVITED_MEMBERS) {
      setGroupError(`Select at least ${MIN_GROUP_INVITED_MEMBERS} friends to create a group.`);
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
      if (selectedRoomIdRef.current !== null) {
        stopRoomTyping(selectedRoomIdRef.current);
      }
      setRooms((currentRooms) => appendOrUpdateRoom(currentRooms, room));
      setSelectedUser(null);
      selectedUserIdRef.current = null;
      setSelectedRoom(room);
      selectedRoomIdRef.current = room.id;
      navigateIfNeeded(getRoomChatRoute(room.id));
      setDetailsOpen(shouldOpenConversationDetailsByDefault());
      resetMessagePagination();
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

  const handleUpdateGroupSettingsName = async (event?: React.FormEvent) => {
    if (event) {
      event.preventDefault();
    }
    if (!selectedRoom || groupSettingsSaving) {
      return;
    }

    const name = groupSettingsName.trim();
    if (!name || name === selectedRoom.name.trim()) {
      setIsEditingGroupName(false);
      return;
    }

    setGroupSettingsPendingAction('rename');
    setGroupSettingsError('');

    try {
      const response = await apiClient.patch<ChatRoom>(`/rooms/${selectedRoom.id}`, { name });
      applyRoomMembershipUpdate(response.data);
      setIsEditingGroupName(false);
    } catch (error) {
      console.error('Failed to update group:', error);
      setGroupSettingsError('Unable to update group.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleToggleAddRoomMember = (userId: number) => {
    setGroupSettingsError('');
    setSelectedAddMemberIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((currentId) => currentId !== userId)
        : [...currentIds, userId]
    );
  };

  const handleAddRoomMembers = async () => {
    if (!selectedRoom || selectedAddMemberIds.length === 0 || groupSettingsSaving) {
      return;
    }

    setGroupSettingsPendingAction('add');
    setGroupSettingsError('');

    try {
      const response = await apiClient.post<ChatRoom>(`/rooms/${selectedRoom.id}/members`, {
        participantIds: selectedAddMemberIds,
      });
      setSelectedAddMemberIds([]);
      applyRoomMembershipUpdate(response.data);
      setAddMembersModalOpen(false);
    } catch (error) {
      console.error('Failed to add group members:', error);
      setGroupSettingsError('Unable to add members.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleGroupMemberNicknameChange = (userId: number, value: string) => {
    setGroupSettingsError('');
    setGroupMemberNicknames((currentNicknames) => ({
      ...currentNicknames,
      [userId]: value,
    }));
  };

  const handleToggleGroupMemberMenu = (userId: number) => {
    setGroupSettingsError('');
    setOpenGroupMemberMenuId((currentUserId) => (currentUserId === userId ? null : userId));
  };

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

  const handleStartEditGroupMemberNickname = (user: User) => {
    setGroupSettingsError('');
    setOpenGroupMemberMenuId(null);
    setEditingGroupMemberNicknameId(user.id);
    setGroupMemberNicknames((currentNicknames) => ({
      ...currentNicknames,
      [user.id]: currentNicknames[user.id] ?? user.nickname ?? '',
    }));
  };

  const handleCancelEditGroupMemberNickname = (user: User) => {
    setGroupSettingsError('');
    setEditingGroupMemberNicknameId(null);
    setGroupMemberNicknames((currentNicknames) => ({
      ...currentNicknames,
      [user.id]: user.nickname ?? '',
    }));
  };

  const handleUpdateRoomMemberNickname = async (user: User) => {
    if (!selectedRoom || groupSettingsSaving) {
      return;
    }

    const nickname = (groupMemberNicknames[user.id] ?? '').trim();
    if (nickname === (user.nickname ?? '').trim()) {
      return;
    }

    setGroupSettingsPendingAction(`nickname-${user.id}`);
    setGroupSettingsError('');

    try {
      const response = await apiClient.patch<ChatRoom>(
        `/rooms/${selectedRoom.id}/members/${user.id}/nickname`,
        { nickname }
      );
      applyRoomMembershipUpdate(response.data);
      setEditingGroupMemberNicknameId(null);
    } catch (error) {
      console.error('Failed to update group nickname:', error);
      setGroupSettingsError('Unable to update nickname.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleKickRoomMember = async (user: User) => {
    if (!selectedRoom || groupSettingsSaving) {
      return;
    }

    setGroupSettingsPendingAction(`kick-${user.id}`);
    setGroupSettingsError('');

    try {
      const response = await apiClient.delete<ChatRoom>(
        `/rooms/${selectedRoom.id}/members/${user.id}`
      );
      applyRoomMembershipUpdate(response.data);
    } catch (error) {
      console.error('Failed to remove group member:', error);
      setGroupSettingsError('Unable to remove member.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleTransferRoomOwner = async (user: User) => {
    if (!selectedRoom || groupSettingsSaving) {
      return;
    }

    setGroupSettingsPendingAction(`owner-${user.id}`);
    setGroupSettingsError('');
    setOpenGroupMemberMenuId(null);

    try {
      const response = await apiClient.patch<ChatRoom>(`/rooms/${selectedRoom.id}/owner`, {
        ownerId: user.id,
      });
      applyRoomMembershipUpdate(response.data);
    } catch (error) {
      console.error('Failed to transfer group owner:', error);
      setGroupSettingsError('Unable to transfer owner.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleLeaveSelectedGroup = async () => {
    if (!selectedRoom || groupSettingsSaving) {
      return;
    }

    setGroupSettingsPendingAction('leave');
    setGroupSettingsError('');

    try {
      const response = await apiClient.delete<ChatRoom>(`/rooms/${selectedRoom.id}/members/me`);
      applyRoomMembershipUpdate(response.data);
    } catch (error) {
      console.error('Failed to leave group:', error);
      setGroupSettingsError('Unable to leave group.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleUpdateMemberRole = async (user: User, newRole: GroupMemberRole) => {
    if (!selectedRoom || groupSettingsSaving) {
      return;
    }

    setGroupSettingsPendingAction(`role-${user.id}`);
    setGroupSettingsError('');
    setOpenGroupMemberMenuId(null);

    try {
      const response = await apiClient.patch<ChatRoom>(
        `/rooms/${selectedRoom.id}/members/${user.id}/role`,
        { role: newRole }
      );
      applyRoomMembershipUpdate(response.data);
    } catch (error: any) {
      console.error('Failed to update member role:', error);
      setGroupSettingsError(error.response?.data?.message || 'Unable to update member role.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleDeleteSelectedGroup = async () => {
    if (!selectedRoom || groupSettingsSaving) {
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to dissolve group "${selectedRoom.name}"? All messages and members will be removed.`
    );
    if (!confirmed) {
      return;
    }

    setGroupSettingsPendingAction('delete-room');
    setGroupSettingsError('');

    try {
      await apiClient.delete(`/rooms/${selectedRoom.id}`);
      setRooms((currentRooms) => currentRooms.filter((r) => r.id !== selectedRoom.id));
      setSelectedRoom(null);
      selectedRoomIdRef.current = null;
      navigateIfNeeded(getChatRoute());
      setMessages([]);
    } catch (error: any) {
      console.error('Failed to delete group:', error);
      setGroupSettingsError(error.response?.data?.message || 'Unable to delete group.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleGroupAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedRoom || groupSettingsSaving) {
      return;
    }

    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setGroupSettingsError('Choose a JPG, PNG, GIF, or WebP image.');
      event.currentTarget.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setGroupSettingsError(`Avatar must be ${MAX_AVATAR_SIZE_MB}MB or smaller.`);
      event.currentTarget.value = '';
      return;
    }

    setGroupAvatarUploading(true);
    setGroupSettingsError('');

    try {
      const media = await uploadPendingMedia({
        file,
        previewUrl: URL.createObjectURL(file),
        type: 'IMAGE',
        resourceType: 'image',
      });
      if (!media.url) {
        throw new Error('Upload failed');
      }
      const response = await apiClient.patch<ChatRoom>(`/rooms/${selectedRoom.id}`, {
        avatar: media.url,
      });
      applyRoomMembershipUpdate(response.data);
    } catch (error: any) {
      console.error('Failed to upload group avatar:', error);
      setGroupSettingsError(error.response?.data?.message || 'Unable to upload group avatar.');
    } finally {
      setGroupAvatarUploading(false);
      event.target.value = '';
    }
  };

  const handleOpenInviteModal = async () => {
    if (!selectedRoom) return;
    setInviteModalOpen(true);
    setInviteLoading(true);
    setInviteError('');
    setInviteCopied(false);

    try {
      const response = await apiClient.get<GroupInviteResponse>(
        `/rooms/${selectedRoom.id}/invite-link`
      );
      setGroupInviteData(response.data);
    } catch (error: any) {
      console.error('Failed to fetch invite link:', error);
      setInviteError(error.response?.data?.message || 'Unable to load invite link.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevokeInviteLink = async () => {
    if (!selectedRoom || inviteRevoking) return;
    setInviteRevoking(true);
    setInviteError('');
    setInviteCopied(false);

    try {
      const response = await apiClient.post<GroupInviteResponse>(
        `/rooms/${selectedRoom.id}/invite-link/revoke`
      );
      setGroupInviteData(response.data);
    } catch (error: any) {
      console.error('Failed to reset invite link:', error);
      setInviteError(error.response?.data?.message || 'Unable to reset invite link.');
    } finally {
      setInviteRevoking(false);
    }
  };

  const getGroupInviteUrl = () => {
    const code = groupInviteData?.inviteCode || selectedRoom?.inviteCode;
    const relativeOrAbsoluteUrl = groupInviteData?.inviteUrl?.trim() ||
      (code ? `/invite/${encodeURIComponent(code)}` : '');
    if (!relativeOrAbsoluteUrl) {
      return '';
    }

    return new URL(relativeOrAbsoluteUrl, window.location.origin).toString();
  };

  const handleCopyInviteLink = async () => {
    const url = getGroupInviteUrl();
    if (!url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2500);
    } catch {
      setInviteError('Failed to copy to clipboard.');
    }
  };

  const handleReplyToMessage = (message: ChatMessage) => {
    if (!canUseMessageActions(message)) {
      return;
    }

    setReplyingToMessage(message);
    setEmojiPickerOpen(false);
    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  };

  const handleCancelReply = () => {
    setReplyingToMessage(null);
  };

  const handleCopyMessage = async (message: ChatMessage) => {
    if (!message.content?.trim() || message.recalled) {
      return;
    }

    try {
      await navigator.clipboard.writeText(message.content);
    } catch (error) {
      console.error('Failed to copy message:', error);
      setMessagesError('Unable to copy message.');
    }
  };

  const handleReactToMessage = async (message: ChatMessage, emoji: string) => {
    if (!canUseMessageActions(message) || !currentUser) {
      return;
    }

    try {
      const response = hasCurrentUserReaction(message, currentUser.id, emoji)
        ? await apiClient.delete<Message>(`/messages/${message.id}/reactions`)
        : await apiClient.post<Message>(`/messages/${message.id}/reactions`, { emoji });
      applyMessageUpdate(response.data);
    } catch (error) {
      console.error('Failed to update message reaction:', error);
      setMessagesError('Unable to update reaction.');
    }
  };

  const handleRecallMessage = async (message: ChatMessage) => {
    if (!canUseMessageActions(message) || message.senderId !== currentUser?.id) {
      return;
    }

    try {
      const response = await apiClient.patch<Message>(`/messages/${message.id}/recall`);
      applyMessageUpdate(response.data);
      if (replyingToMessage?.id === message.id) {
        setReplyingToMessage(null);
      }
    } catch (error) {
      console.error('Failed to recall message:', error);
      setMessagesError('Unable to recall message.');
    }
  };

  const handlePinMessage = useCallback(async (message: ChatMessage) => {
    try {
      if (selectedRoom) {
        await apiClient.patch(`/rooms/${selectedRoom.id}/pin-message`, null, {
          params: { messageId: message.id },
        });
        // Local state update – banner shows immediately
        setPinnedMessage(message as unknown as Message);
      } else if (selectedUser) {
        await apiClient.patch(`/messages/dm/${selectedUser.id}/pin-message`, null, {
          params: { messageId: message.id },
        });
        setPinnedMessage(message as unknown as Message);
      }
    } catch (error) {
      console.error('Failed to pin message:', error);
    }
  }, [selectedRoom, selectedUser]);

  const handleUnpinMessage = useCallback(async () => {
    try {
      if (selectedRoom) {
        await apiClient.delete(`/rooms/${selectedRoom.id}/pin-message`);
        setPinnedMessage(null);
      } else if (selectedUser) {
        await apiClient.delete(`/messages/dm/${selectedUser.id}/pin-message`);
        setPinnedMessage(null);
      }
    } catch (error) {
      console.error('Failed to unpin message:', error);
    }
  }, [selectedRoom, selectedUser]);

  const handleForwardMessage = useCallback((message: ChatMessage) => {
    if (message.recalled || message.type === 'CALL') return;
    setForwardingMessage(message);
  }, []);

  const sendForwardMessage = useCallback(async (
    targetUserId: number | null,
    targetRoomId: number | null,
  ) => {
    if (!forwardingMessage) return;
    try {
      const response = await apiClient.post<Message>('/messages/forward', {
        messageId: forwardingMessage.id,
        targetUserId,
        targetRoomId,
      });
      // If target is the current conversation, add to local messages
      const msg = response.data;
      if (
        (targetUserId && selectedUser?.id === targetUserId) ||
        (targetRoomId && selectedRoom?.id === targetRoomId)
      ) {
        applyMessageUpdate(msg);
      }
      setForwardingMessage(null);
    } catch (error) {
      console.error('Failed to forward message:', error);
    }
  }, [forwardingMessage, selectedUser, selectedRoom, applyMessageUpdate]);

  const mentionCandidates = useMemo(() => {
    if (!selectedRoom || mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const list: { id: number | 'all'; username: string; fullName: string; isAll?: boolean }[] = [];

    if ('all'.startsWith(q) || q === '') {
      list.push({ id: 'all', username: 'all', fullName: 'All Members', isAll: true });
    }

    const currentUserId = currentUser?.id;
    const filtered = (selectedRoom.participants || [])
      .filter((p) => p.id !== currentUserId)
      .filter(
        (p) =>
          p.username.toLowerCase().startsWith(q) ||
          (p.fullName && p.fullName.toLowerCase().includes(q))
      );

    filtered.forEach((p) => {
      list.push({
        id: p.id,
        username: p.username,
        fullName: p.fullName || p.username,
      });
    });

    return list;
  }, [selectedRoom, mentionQuery, currentUser?.id]);

  const checkMentionTrigger = useCallback((text: string, cursorPos: number) => {
    if (!selectedRoom) {
      setMentionQuery(null);
      setMentionStartIndex(-1);
      return;
    }
    const textBeforeCursor = text.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);
    if (match) {
      const query = match[1];
      const atIndex = textBeforeCursor.length - match[0].length + (match[0].startsWith(' ') ? 1 : 0);
      setMentionQuery(query);
      setMentionStartIndex(atIndex);
      setMentionActiveIndex(0);
    } else {
      setMentionQuery(null);
      setMentionStartIndex(-1);
    }
  }, [selectedRoom]);

  const checkSlashCommandTrigger = useCallback((text: string, cursorPos: number) => {
    if (!selectedRoom) {
      setSlashCommandQuery(null);
      return;
    }

    const textBeforeCursor = text.slice(0, cursorPos);
    const match = textBeforeCursor.match(/^\/([a-z]*)$/i);
    if (match && 'summary'.startsWith(match[1].toLowerCase())) {
      setSlashCommandQuery(match[1]);
      return;
    }

    setSlashCommandQuery(null);
  }, [selectedRoom]);

  const insertMention = useCallback((candidate: { username: string }) => {
    if (mentionStartIndex < 0) return;
    const before = messageInput.slice(0, mentionStartIndex);
    const cursorPos = messageInputRef.current?.selectionStart ?? messageInput.length;
    const after = messageInput.slice(cursorPos);
    const nextValue = `${before}@${candidate.username} ${after}`;
    const nextCursor = before.length + candidate.username.length + 2;

    setMessageInput(nextValue);
    setMentionQuery(null);
    setMentionStartIndex(-1);

    window.requestAnimationFrame(() => {
      const input = messageInputRef.current;
      if (input) {
        input.focus();
        input.setSelectionRange(nextCursor, nextCursor);
      }
    });
  }, [mentionStartIndex, messageInput]);

  const insertSummaryCommand = useCallback(() => {
    const command = '/summary';
    setMessageInput(command);
    setSlashCommandQuery(null);

    window.requestAnimationFrame(() => {
      const input = messageInputRef.current;
      if (input) {
        input.focus();
        input.setSelectionRange(command.length, command.length);
      }
    });
  }, []);

  const handleMessageInputChange = (value: string) => {
    setMessageInput(value);
    const cursorPos = messageInputRef.current?.selectionStart ?? value.length;
    checkMentionTrigger(value, cursorPos);
    checkSlashCommandTrigger(value, cursorPos);
    if (!selectedUser && !selectedRoom) {
      return;
    }

    if (!value.trim()) {
      if (selectedUser) {
        stopTyping(selectedUser.id);
      } else if (selectedRoom) {
        stopRoomTyping(selectedRoom.id);
      }
      return;
    }

    if (selectedUser && canChatWithUser(selectedUser)) {
      publishTyping(selectedUser.id, true);
    } else if (selectedRoom) {
      publishRoomTyping(selectedRoom.id, true);
    }

    clearTypingTimeout();
    typingTimeoutRef.current = setTimeout(() => {
      if (selectedUser && canChatWithUser(selectedUser)) {
        publishTyping(selectedUser.id, false);
      } else if (selectedRoom) {
        publishRoomTyping(selectedRoom.id, false);
      }
      typingTimeoutRef.current = null;
    }, STOP_TYPING_DELAY_MS);
  };

  const handleToggleEmojiPicker = () => {
    updateMessageInputSelection();
    setEmojiPickerOpen((currentOpen) => !currentOpen);
  };

  const handleInsertEmoji = (emoji: string) => {
    updateMessageInputSelection();

    const selectionStart = Math.min(messageInputSelectionRef.current.start, messageInput.length);
    const selectionEnd = Math.min(
      Math.max(messageInputSelectionRef.current.end, selectionStart),
      messageInput.length
    );
    const nextValue =
      messageInput.slice(0, selectionStart) + emoji + messageInput.slice(selectionEnd);
    const nextCursorPosition = selectionStart + emoji.length;

    messageInputSelectionRef.current = {
      start: nextCursorPosition,
      end: nextCursorPosition,
    };
    handleMessageInputChange(nextValue);

    window.requestAnimationFrame(() => {
      const input = messageInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      input.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  };

  const handleOpenMediaPicker = () => {
    setEmojiPickerOpen(false);
    setMediaError('');
    mediaFileInputRef.current?.click();
  };

  const handleOpenDocPicker = () => {
    setEmojiPickerOpen(false);
    setMediaError('');
    docFileInputRef.current?.click();
  };

  const handleFileSelected = (file: File) => {
    const pendingMediaType = getPendingMediaType(file);
    if (!pendingMediaType) {
      setMediaError('Unsupported file type.');
      return;
    }

    const sizeError = getMediaSizeError(file, pendingMediaType);
    if (sizeError) {
      setMediaError(sizeError);
      return;
    }

    setPendingMedia({
      file,
      previewUrl: URL.createObjectURL(file),
      ...pendingMediaType,
    });
    setMediaError('');
    setEmojiPickerOpen(false);
  };

  const handleMediaFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }
    handleFileSelected(file);
  };

  const uploadToLocalMedia = async (file: File, duration?: number): Promise<MediaAttachment> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.postForm<LocalMediaUploadResult>('/media/upload', formData);
    const data = response.data;

    return {
      url: getMediaUrl(data.url),
      publicId: data.publicId,
      resourceType: data.resourceType,
      format: data.format ?? getFileFormat(file),
      bytes: data.bytes ?? file.size,
      duration: duration ?? data.duration,
    };
  };

  const uploadPendingMedia = async (media: PendingMedia): Promise<MediaAttachment> => {
    try {
      const signatureResponse = await apiClient.post<CloudinaryUploadSignature>(
        '/media/upload-signature'
      );
      const signature = signatureResponse.data;

      if (
        !signature.cloudName ||
        signature.cloudName === 'chat-app' ||
        signature.apiKey === '933935263295315'
      ) {
        return await uploadToLocalMedia(media.file, media.mediaDuration);
      }

      const formData = new FormData();
      formData.append('file', media.file);
      formData.append('api_key', signature.apiKey);
      formData.append('timestamp', String(signature.timestamp));
      formData.append('signature', signature.signature);
      formData.append('folder', signature.folder);

      const uploadResponse = await fetch(signature.uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Cloudinary upload failed');
      }

      const uploadResult = (await uploadResponse.json()) as CloudinaryUploadResult;
      if (
        !uploadResult.secure_url ||
        !uploadResult.public_id ||
        uploadResult.resource_type !== media.resourceType
      ) {
        throw new Error('Cloudinary upload response is invalid');
      }

      return {
        ...cloudinaryResultToMedia(uploadResult),
        format: uploadResult.format ?? getFileFormat(media.file),
        bytes: uploadResult.bytes ?? media.file.size,
        duration: media.mediaDuration ?? uploadResult.duration,
      };
    } catch {
      return await uploadToLocalMedia(media.file, media.mediaDuration);
    }
  };

  const handleVoiceRecorded = useCallback((blob: Blob, durationSeconds: number) => {
    const mimeType = blob.type || 'audio/webm';
    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType });
    const previewUrl = URL.createObjectURL(blob);
    const pendingVoice: PendingMedia = {
      file,
      previewUrl,
      type: 'AUDIO',
      resourceType: 'video',
      mediaDuration: durationSeconds,
    };
    setPendingMedia(pendingVoice);
    setTimeout(() => {
      const form = document.querySelector<HTMLFormElement>('.message-input-form');
      form?.requestSubmit();
    }, 50);
  }, []);

  const handleMessageInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionActiveIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionActiveIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const selected = mentionCandidates[mentionActiveIndex] || mentionCandidates[0];
        if (selected) {
          insertMention(selected);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionQuery(null);
        setMentionStartIndex(-1);
        return;
      }
    }

    if (slashCommandQuery !== null) {
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        insertSummaryCommand();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSlashCommandQuery(null);
        return;
      }
    }

    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = messageInput.trim();
    const mediaToSend = pendingMedia;
    if (
      (!content && !mediaToSend) ||
      mediaUploading ||
      !currentUser ||
      (!selectedUser && !selectedRoom)
    ) {
      return;
    }

    if (!mediaToSend && selectedRoom && /^\/summary$/i.test(content)) {
      if (roomSummaryLoading) {
        return;
      }

      const roomId = selectedRoom.id;
      const requestId = ++roomSummaryRequestRef.current;

      setMessageInput('');
      setEmojiPickerOpen(false);
      setReplyingToMessage(null);
      setRoomSummary(null);
      setRoomSummaryRoomId(roomId);
      setRoomSummaryError('');
      setRoomSummaryLoading(true);

      try {
        const response = await apiClient.post<RoomSummaryResponse>(`/rooms/${roomId}/summaries`);
        if (roomSummaryRequestRef.current === requestId) {
          setRoomSummary(response.data);
        }
      } catch (error) {
        console.error('Failed to summarize room messages:', error);
        if (roomSummaryRequestRef.current === requestId) {
          const responseError = error as { response?: { data?: { message?: string } } };
          setRoomSummaryError(responseError.response?.data?.message || 'Unable to summarize recent messages.');
        }
      } finally {
        if (roomSummaryRequestRef.current === requestId) {
          setRoomSummaryLoading(false);
        }
      }

      return;
    }

    let mediaPayload: MediaAttachment | undefined;
    const messageType: MessageType = mediaToSend ? mediaToSend.type : 'TEXT';
    const replyTo = createReplyFromMessage(replyingToMessage);
    const replyToMessageId = replyTo?.id;
    if (mediaToSend) {
      setMediaUploading(true);
      setMediaError('');
      try {
        mediaPayload = await uploadPendingMedia(mediaToSend);
      } catch (error) {
        console.error('Failed to upload media:', error);
        setMediaError('Unable to upload media. Please try again.');
        setMediaUploading(false);
        return;
      }
      setMediaUploading(false);
    }

    const clientId = createClientId();
    setMessagesError('');
    setMessageInput('');
    setEmojiPickerOpen(false);
    setReplyingToMessage(null);
    clearPendingMedia();

    if (selectedUser) {
      const optimisticMessage = createOptimisticMessage(
        getNextOptimisticMessageId(),
        currentUser.id,
        selectedUser.id,
        content,
        clientId,
        messageType,
        mediaPayload,
        replyTo
      );
      const payload = {
        receiverId: selectedUser.id,
        content,
        clientId,
        replyToMessageId,
        type: messageType,
        media: mediaPayload,
      };

      stopTyping(selectedUser.id);
      soundService.playMessageSentSound();
      setMessages((currentMessages) => appendOptimisticMessage(currentMessages, optimisticMessage));
      setUsers((currentUsers) =>
        applyConversationPreviewToUsers(
          currentUsers,
          optimisticMessage,
          currentUser.id,
          !userSearchQueryRef.current.trim()
        )
      );
      setFriends((currentFriends) =>
        applyConversationPreviewToUsers(currentFriends, optimisticMessage, currentUser.id, true)
      );
      setSelectedUser((currentSelectedUser) =>
        currentSelectedUser
          ? applyConversationPreviewToUser(currentSelectedUser, optimisticMessage, currentUser.id)
          : null
      );
      void sendOptimisticMessage(payload);
      return;
    }

    if (selectedRoom) {
      const optimisticMessage = createOptimisticRoomMessage(
        getNextOptimisticMessageId(),
        currentUser,
        selectedRoom.id,
        content,
        clientId,
        messageType,
        mediaPayload,
        replyTo
      );
      const payload = {
        content,
        clientId,
        replyToMessageId,
        type: messageType,
        media: mediaPayload,
      };

      stopRoomTyping(selectedRoom.id);
      soundService.playMessageSentSound();
      setMessages((currentMessages) => appendOptimisticMessage(currentMessages, optimisticMessage));
      setRooms((currentRooms) =>
        applyRoomPreviewToRooms(
          currentRooms,
          optimisticMessage,
          currentUser.id,
          selectedRoom.id
        )
      );
      setSelectedRoom((currentSelectedRoom) =>
        currentSelectedRoom?.id === selectedRoom.id
          ? {
            ...applyRoomPreviewToRoom(currentSelectedRoom, optimisticMessage),
            unreadCount: 0,
          }
          : currentSelectedRoom
      );
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
        replyToMessageId: message.replyTo?.id,
        type: getMessageType(message),
        media: getMediaPayloadFromMessage(message),
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
      replyToMessageId: message.replyTo?.id,
      type: getMessageType(message),
      media: getMediaPayloadFromMessage(message),
    };

    setMessages((currentMessages) => markOptimisticMessageSending(currentMessages, clientId));
    void sendOptimisticMessage(payload);
  };

  const handleMessageSearchChange = (value: string) => {
    messageSearchQueryRef.current = value;
    setMessageSearchQuery(value);
    if (!value.trim()) {
      setMessageSearchItems([]);
      setMessageSearchError('');
      setMessageSearchHasMore(false);
      setMessageSearchNextBefore(null);
      setActiveMessageSearchId(null);
      setMessageSearchSubmitted(false);
    }
  };

  const handleClearMessageSearch = () => {
    messageSearchQueryRef.current = '';
    messageSearchRequestedQueryRef.current = '';
    setMessageSearchQuery('');
    setMessageSearchItems([]);
    setMessageSearchError('');
    setMessageSearchHasMore(false);
    setMessageSearchNextBefore(null);
    setActiveMessageSearchId(null);
    setMessageSearchSubmitted(false);
    messageSearchInputRef.current?.focus();
  };

  const handleMessageSearchSubmit = (event?: React.FormEvent) => {
    if (event) {
      event.preventDefault();
    }
    const query = messageSearchQuery.trim();
    if (!query) {
      return;
    }
    setMessageSearchSubmitted(true);
    messageSearchRequestedQueryRef.current = query;
    void loadMessageSearch({ reset: true, query });
  };

  const handleJumpToMessage = async (messageId: number) => {
    const selectedUserIdForJump = selectedUserIdRef.current;
    const selectedRoomIdForJump = selectedRoomIdRef.current;
    if (messageId <= 0 || (selectedUserIdForJump === null && selectedRoomIdForJump === null)) {
      return;
    }

    setMessageSearchError('');
    setMessagesError('');

    try {
      const endpoint =
        selectedUserIdForJump !== null
          ? `/messages/${selectedUserIdForJump}/around/${messageId}`
          : `/rooms/${selectedRoomIdForJump}/around/${messageId}`;
      const response = await apiClient.get<MessagePage>(endpoint, {
        params: { size: MESSAGE_AROUND_PAGE_SIZE },
      });

      if (
        selectedUserIdRef.current !== selectedUserIdForJump ||
        selectedRoomIdRef.current !== selectedRoomIdForJump
      ) {
        return;
      }

      skipNextAutoScrollRef.current = true;
      pendingInitialMessageScrollRef.current = false;
      blockOlderMessagesAutoLoadRef.current = true;
      setMessages(mergeServerMessagesWithPending([], response.data.items));
      applyMessagePagination(response.data);
      highlightMessageById(messageId);
      releaseInitialScrollBlock();
    } catch (error) {
      console.error('Failed to jump to message:', error);
      setMessageSearchError('Unable to open message.');
    }
  };

  const handleJumpToSearchResult = async (messageId: number) => {
    setActiveMessageSearchId(messageId);
    await handleJumpToMessage(messageId);
  };

  const handleStepMessageSearchResult = (direction: -1 | 1) => {
    const nextMessage = messageSearchItems[activeMessageSearchIndex + direction];
    if (!nextMessage) {
      return;
    }

    void handleJumpToSearchResult(nextMessage.id);
  };

  const handleMessageSearchInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleMessageSearchSubmit();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      handleStepMessageSearchResult(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      handleStepMessageSearchResult(-1);
    }
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

  const handleOpenProfileEditor = () => {
    setProfileFullName(currentUser?.fullName ?? '');
    setProfileBio(currentUser?.bio ?? '');
    setProfileAvatarFile(null);
    setProfileAvatarPreview(getAvatarUrl(currentUser?.avatar));
    setProfileError('');
    setProfileMenuOpen(false);
    setProfileEditorOpen(true);
  };

  const handleCloseProfileEditor = () => {
    if (profileSaving) {
      return;
    }

    setProfileEditorOpen(false);
    setProfileAvatarFile(null);
    setProfileAvatarPreview('');
    setProfileBio('');
    setProfileError('');
  };

  const handleProfileAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setProfileAvatarFile(null);
      setProfileError('Choose a JPG, PNG, GIF, or WebP image.');
      event.currentTarget.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setProfileAvatarFile(null);
      setProfileError(`Avatar must be ${MAX_AVATAR_SIZE_MB}MB or smaller.`);
      event.currentTarget.value = '';
      return;
    }

    setProfileAvatarFile(file);
    setProfileAvatarPreview(URL.createObjectURL(file));
    setProfileError('');
  };

  const handleUpdateProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const fullName = profileFullName.trim();

    if (!fullName) {
      setProfileError('Full name is required.');
      return;
    }

    if (profileBio.trim().length > BIO_MAX_LENGTH) {
      setProfileError(`Bio must be ${BIO_MAX_LENGTH} characters or fewer.`);
      return;
    }

    const formData = new FormData();
    formData.append('fullName', fullName);
    formData.append('bio', profileBio.trim());
    if (profileAvatarFile) {
      formData.append('avatar', profileAvatarFile);
    }

    setProfileSaving(true);
    setProfileError('');

    try {
      const response = await apiClient.patch<User>('/users/me', formData);
      applyUpdatedCurrentUserProfile(response.data);
      setProfileEditorOpen(false);
      setProfileAvatarFile(null);
      setProfileAvatarPreview('');
      setProfileBio('');
    } catch (error) {
      console.error('Failed to update profile:', error);
      setProfileError('Unable to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

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
  const preCallCanStart = Boolean(
    preCallSetup &&
    preCallPreviewStream &&
    !preCallPreviewLoading &&
    !preCallSubmitting
  );
  const activeCallConversationOpen = Boolean(
    activeCall &&
    selectedUser?.id === activeCall.peer.id &&
    !selectedRoom &&
    mainView === 'chat'
  );
  const audioInputDevices = useMemo(
    () => callDevices.filter((device) => device.kind === 'audioinput'),
    [callDevices]
  );
  const videoInputDevices = useMemo(
    () => callDevices.filter((device) => device.kind === 'videoinput'),
    [callDevices]
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
  const refreshedViewedProfileUser = viewedProfileUser
    ? users.find((user) => user.id === viewedProfileUser.id) ??
    friends.find((friend) => friend.id === viewedProfileUser.id) ??
    (selectedUser?.id === viewedProfileUser.id ? selectedUser : undefined) ??
    selectedRoom?.participants.find((participant) => participant.id === viewedProfileUser.id)
    : undefined;
  const activeViewedProfileUser = viewedProfileUser
    ? mergeViewedProfileUser(viewedProfileUser, refreshedViewedProfileUser)
    : null;
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

  const renderCallPermissionStatus = (callType: CallType) => {
    const permissionItems = [
      { key: 'microphone', label: 'Mic', status: callPermissions.microphone },
      ...(callType === 'VIDEO'
        ? [{ key: 'camera', label: 'Camera', status: callPermissions.camera }]
        : []),
    ];

    return (
      <div className="call-permission-row" aria-label="Call permissions">
        {permissionItems.map((item) => (
          <span
            key={item.key}
            className={`call-permission-pill ${item.status}`}
            title={`${item.label}: ${getCallPermissionLabel(item.status)}`}
          >
            <span>{item.label}</span>
            <strong>{getCallPermissionLabel(item.status)}</strong>
          </span>
        ))}
        <button
          type="button"
          className="call-permission-refresh"
          onClick={() => void refreshCallPermissions(callType)}
        >
          Refresh
        </button>
      </div>
    );
  };

  const renderReplyQuote = (reply?: MessageReply | null) => {
    if (!reply) {
      return null;
    }

    return (
      <div className="message-reply-quote">
        <span>{reply.senderName}</span>
        <p>{reply.recalled ? 'Message recalled' : reply.content || 'Message'}</p>
      </div>
    );
  };

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

  const renderMessageReactions = (message: ChatMessage) => {
    const groupedReactions = getGroupedMessageReactions(message, currentUser?.id ?? null);
    if (groupedReactions.length === 0) {
      return null;
    }

    return (
      <div className="message-reactions" aria-label="Message reactions">
        {groupedReactions.map((reaction) => (
          <button
            key={reaction.emoji}
            type="button"
            className={`message-reaction-pill ${reaction.reactedByCurrentUser ? 'active' : ''}`}
            onClick={() => void handleReactToMessage(message, reaction.emoji)}
            onContextMenu={(e) => {
              e.preventDefault();
              handleOpenReactionSummary(message);
            }}
            title={`${reaction.title} (Right-click to view details)`}
            aria-label={`${reaction.count} ${reaction.emoji} reactions`}
          >
            <span>{reaction.emoji}</span>
            {reaction.count > 1 ? <small>{reaction.count}</small> : null}
          </button>
        ))}
        <button
          type="button"
          className="message-reaction-pill reaction-summary-trigger"
          onClick={() => handleOpenReactionSummary(message)}
          title="View reaction details"
          aria-label="View reaction details"
        >
          <small style={{ fontSize: '10px', opacity: 0.7 }}>📊</small>
        </button>
      </div>
    );
  };

  const renderMessageActions = (message: ChatMessage, isSentByCurrentUser: boolean) => {
    if (!canUseMessageActions(message)) {
      return null;
    }

    const currentUserId = currentUser?.id ?? null;
    const canCopyMessage = Boolean(message.content?.trim());

    return (
      <div className="message-actions" aria-label="Message actions">
        <div className="message-quick-reactions">
          {QUICK_REACTION_EMOJIS.map((emoji) => (
            <button
              key={`${message.id}-${emoji}`}
              type="button"
              className={`message-action-btn reaction ${hasCurrentUserReaction(message, currentUserId, emoji) ? 'active' : ''}`}
              onClick={() => void handleReactToMessage(message, emoji)}
              aria-label={`React with ${emoji}`}
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="message-action-btn"
          onClick={() => handleReplyToMessage(message)}
          aria-label="Reply"
          title="Reply"
        >
          <ReplyIcon className="message-action-icon" />
        </button>
        {canCopyMessage ? (
          <button
            type="button"
            className="message-action-btn"
            onClick={() => void handleCopyMessage(message)}
            aria-label="Copy"
            title="Copy"
          >
            <CopyIcon className="message-action-icon" />
          </button>
        ) : null}
        {isSentByCurrentUser ? (
          <button
            type="button"
            className="message-action-btn danger"
            onClick={() => void handleRecallMessage(message)}
            aria-label="Recall"
            title="Recall"
          >
            <RecallIcon className="message-action-icon" />
          </button>
        ) : null}
        <button
          type="button"
          className="message-action-btn"
          onClick={() => void handlePinMessage(message)}
          aria-label="Pin message"
          title={pinnedMessage?.id === message.id ? 'Unpin' : 'Pin'}
        >
          <span style={{ fontSize: '13px' }}>
            {pinnedMessage?.id === message.id ? '📌' : '📌'}
          </span>
        </button>
        {!message.recalled && message.type !== 'CALL' ? (
          <button
            type="button"
            className="message-action-btn"
            onClick={() => handleForwardMessage(message)}
            aria-label="Forward message"
            title="Forward"
          >
            <ForwardIcon className="message-action-icon" />
          </button>
        ) : null}
      </div>
    );
  };

  const renderCallMessageBody = (message: ChatMessage) => {
    const isVideoCall = message.callType === 'VIDEO';
    const callPeer = getCallMessagePeer(message);
    const canCallBack = Boolean(callPeer && canChatWithUser(callPeer) && !activeCall);

    return (
      <div className={`call-message-event ${message.callStatus?.toLowerCase() ?? ''}`}>
        <span className="call-message-icon-wrap" aria-hidden="true">
          {isVideoCall ? (
            <VideoCallIcon className="call-message-icon" />
          ) : (
            <PhoneIcon className="call-message-icon" />
          )}
        </span>
        <span>{getCallEventLabel(message)}</span>
        <small>{formatMessageTime(message.timestamp)}</small>
        {canCallBack ? (
          <button
            type="button"
            className="call-message-callback"
            onClick={() => handleCallBackFromMessage(message)}
            aria-label={`Call ${getUserDisplayName(callPeer)} again`}
            title={`Call ${getUserDisplayName(callPeer)} again`}
          >
            {isVideoCall ? (
              <VideoCallIcon className="call-message-callback-icon" />
            ) : (
              <PhoneIcon className="call-message-callback-icon" />
            )}
            <span>Call again</span>
          </button>
        ) : null}
      </div>
    );
  };

  const renderMessageBody = (message: ChatMessage) => {
    const mediaUrl = getMediaUrl(message.mediaUrl);

    if (message.recalled) {
      return (
        <div className="message-content recalled">
          <span>Message recalled</span>
        </div>
      );
    }

    if (getMessageType(message) === 'IMAGE' && mediaUrl) {
      return (
        <div className="message-media-content">
          {renderReplyQuote(message.replyTo)}
          <button
            type="button"
            className="message-image-preview-btn"
            onClick={() => handleOpenLightbox(mediaUrl, 'IMAGE', message.content || 'image')}
            aria-label="Open image preview"
          >
            <img
              src={mediaUrl}
              alt={message.content || 'Shared image'}
              onLoad={handleMessageAssetLoaded}
              onError={handleMessageAssetLoaded}
            />
          </button>
          {message.content ? (
            <div className="message-media-caption">{renderLinkedText(message.content)}</div>
          ) : null}
        </div>
      );
    }

    if (getMessageType(message) === 'VIDEO' && mediaUrl) {
      return (
        <div className="message-media-content">
          {renderReplyQuote(message.replyTo)}
          <div
            className="message-video-preview-wrap"
            onClick={() => handleOpenLightbox(mediaUrl, 'VIDEO', message.content || 'video')}
            style={{ cursor: 'pointer' }}
          >
            <video
              className="message-video-preview"
              src={mediaUrl}
              controls={false}
              preload="metadata"
              onLoadedMetadata={handleMessageAssetLoaded}
              onError={handleMessageAssetLoaded}
            />
          </div>
          {message.content ? (
            <div className="message-media-caption">{renderLinkedText(message.content)}</div>
          ) : null}
        </div>
      );
    }

    if (getMessageType(message) === 'AUDIO' && mediaUrl) {
      return (
        <div className="message-media-content">
          {message.forwardedFromId ? (
            <div className="forwarded-header">
              <ForwardIcon className="forwarded-icon" />
              <span>Forwarded from <strong>{message.forwardedFromSenderName ?? 'Unknown'}</strong></span>
            </div>
          ) : null}
          {renderReplyQuote(message.replyTo)}
          <div className="message-voice">
            <VoiceMessagePlayer
              src={mediaUrl}
              durationSeconds={message.mediaDuration}
            />
          </div>
        </div>
      );
    }

    if (getMessageType(message) === 'FILE' && mediaUrl) {
      const ext = getFileExtension(message.mediaFormat || message.content || mediaUrl);
      const fileName = getDownloadFilename(message);
      const badgeClass = getFileBadgeColor(ext);
      const sizeLabel = formatFileSize(message.mediaBytes);

      return (
        <div className="message-media-content message-file-card-content">
          {message.forwardedFromId ? (
            <div className="forwarded-header">
              <ForwardIcon className="forwarded-icon" />
              <span>Forwarded from <strong>{message.forwardedFromSenderName ?? 'Unknown'}</strong></span>
            </div>
          ) : null}
          {renderReplyQuote(message.replyTo)}
          <div className="message-file-card">
            <div className={`file-card-icon-wrap ${badgeClass}`}>
              <DocumentIcon className="file-card-icon" />
              <span className="file-card-ext">{ext}</span>
            </div>
            <div className="file-card-info">
              <span className="file-card-name" title={fileName}>{fileName}</span>
              {sizeLabel ? <span className="file-card-size">{sizeLabel}</span> : null}
            </div>
            <a
              href={mediaUrl}
              download={fileName}
              target="_blank"
              rel="noopener noreferrer"
              className="file-card-download-btn"
              title={`Download ${fileName}`}
              aria-label={`Download ${fileName}`}
            >
              <DownloadIcon className="file-card-download-icon" />
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className={`message-content ${hasLinkPreview(message.linkPreview) ? 'has-link-preview' : ''}`}>
        {message.forwardedFromId ? (
          <div className="forwarded-header">
            <ForwardIcon className="forwarded-icon" />
            <span>Forwarded from <strong>{message.forwardedFromSenderName ?? 'Unknown'}</strong></span>
          </div>
        ) : null}
        {renderReplyQuote(message.replyTo)}
        {message.content ? (
          <div className="message-text">{renderLinkedText(message.content)}</div>
        ) : null}
        {renderLinkPreviewCard(message.linkPreview, handleMessageAssetLoaded)}
      </div>
    );
  };

  const renderGroupSeenBy = (message: ChatMessage, seenByUsers: User[]) => {
    if (seenByUsers.length === 0) {
      return null;
    }

    const visibleUsers = seenByUsers.slice(0, 3);
    const extraCount = seenByUsers.length - visibleUsers.length;
    const seenByLabel = `Seen by ${seenByUsers.map(getUserDisplayName).join(', ')}`;
    const isOpen = seenByPopupMessageId === message.id;

    return (
      <div className="message-seen-by-row">
        <button
          type="button"
          className="message-seen-by-btn"
          onClick={() => setGroupSeenModalMessage({ message, seenUsers: seenByUsers })}
          aria-label={seenByLabel}
          title={seenByLabel}
        >
          <span className="message-seen-by-avatars">
            {visibleUsers.map((reader) => (
              <span key={reader.id} className="message-seen-by-avatar-shell">
                {renderUserAvatar(reader, 'user-avatar message-seen-by-avatar')}
              </span>
            ))}
          </span>
          {extraCount > 0 ? <span className="message-seen-by-count">+{extraCount}</span> : null}
        </button>

        {isOpen ? (
          <div className="message-seen-by-popover" role="dialog" aria-label="Seen by members">
            <strong>Seen by</strong>
            <div className="message-seen-by-list">
              {seenByUsers.map((reader) => (
                <div key={reader.id} className="message-seen-by-item">
                  {renderUserAvatar(reader, 'user-avatar message-seen-by-list-avatar')}
                  <span>{getUserDisplayName(reader)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderPreCallSetupModal = () => (
    <PreCallSetupModal
      preCallSetup={preCallSetup}
      previewStream={preCallPreviewStream}
      previewVideoRef={preCallPreviewVideoRef}
      previewLoading={preCallPreviewLoading}
      submitting={preCallSubmitting}
      canStart={preCallCanStart}
      error={preCallError}
      micMuted={micMuted}
      cameraOff={cameraOff}
      audioInputDevices={audioInputDevices}
      videoInputDevices={videoInputDevices}
      selectedAudioInputId={selectedAudioInputId}
      selectedVideoInputId={selectedVideoInputId}
      callDevicesLoading={callDevicesLoading}
      callDeviceError={callDeviceError}
      getMediaDeviceLabel={getMediaDeviceLabel}
      renderUserAvatar={renderUserAvatar}
      renderCallPermissionStatus={renderCallPermissionStatus}
      onClose={handleClosePreCallSetup}
      onToggleMic={handlePreCallToggleMic}
      onToggleCamera={handlePreCallToggleCamera}
      onAudioInputChange={handlePreCallAudioInputChange}
      onVideoInputChange={handlePreCallVideoInputChange}
      onRetryPreview={handlePreCallRetryPreview}
      onStart={handleConfirmStartCall}
    />
  );

  const renderCallOverlay = () => (
    <ActiveCallOverlay
      activeCall={activeCall}
      callMinimized={callMinimized}
      callConnectionState={callConnectionState}
      callElapsedSeconds={callElapsedSeconds}
      localCallStream={localCallStream}
      remoteCallStream={remoteCallStream}
      remoteAudioRef={remoteAudioRef}
      remoteVideoRef={remoteVideoRef}
      localVideoRef={localVideoRef}
      isConversationOpen={activeCallConversationOpen}
      micMuted={micMuted}
      cameraOff={cameraOff}
      screenSharing={screenSharing}
      remoteScreenSharing={remoteScreenSharing}
      screenShareError={screenShareError}
      callError={callError}
      audioInputDevices={audioInputDevices}
      videoInputDevices={videoInputDevices}
      selectedAudioInputId={selectedAudioInputId}
      selectedVideoInputId={selectedVideoInputId}
      callDevicesLoading={callDevicesLoading}
      callDeviceError={callDeviceError}
      formatCallTimer={formatCallTimer}
      getMediaDeviceLabel={getMediaDeviceLabel}
      renderUserAvatar={renderUserAvatar}
      renderCallPermissionStatus={renderCallPermissionStatus}
      onRestore={handleRestoreActiveCall}
      onMinimize={handleMinimizeActiveCall}
      onOpenConversation={handleOpenActiveCallConversation}
      onToggleMic={handleToggleMic}
      onToggleCamera={handleToggleCamera}
      onStartScreenShare={handleStartScreenShare}
      onStopScreenShare={handleStopScreenShare}
      onEnd={handleEndCall}
      onAccept={handleAcceptCall}
      onReject={handleRejectCall}
      onRetry={handleRetryActiveCall}
      onAudioInputChange={handleAudioInputChange}
      onVideoInputChange={handleVideoInputChange}
    />
  );

  const renderFriendshipAction = (user: User) => {
    if (!hasUserSearch) {
      return null;
    }

    switch (user.friendshipStatus) {
      case 'pending_incoming': {
        const requestId = user.friendshipId;
        return requestId ? (
          <button
            type="button"
            className="friend-action-btn"
            disabled={friendActionKeys.includes(`accept-user-${user.id}`)}
            onClick={(event) => {
              event.stopPropagation();
              void handleAcceptFriendRequest(requestId, `accept-user-${user.id}`);
            }}
          >
            Accept
          </button>
        ) : null;
      }
      case 'pending_outgoing':
        return (
          <div className="friend-actions">
            <span className="friend-status-pill">Pending</span>
            <button
              type="button"
              className="friend-action-btn secondary"
              disabled={!user.friendshipId || friendActionKeys.includes(`cancel-${user.id}`)}
              onClick={(event) => {
                event.stopPropagation();
                void handleCancelFriendRequest(user);
              }}
            >
              Cancel
            </button>
          </div>
        );
      case 'none':
      case 'declined':
      case undefined:
        return (
          <button
            type="button"
            className="friend-action-btn"
            disabled={friendActionKeys.includes(`send-${user.id}`)}
            onClick={(event) => {
              event.stopPropagation();
              void handleSendFriendRequest(user);
            }}
          >
            Add
          </button>
        );
      case 'accepted':
      default:
        return <span className="friend-status-pill accepted">Friend</span>;
    }
  };

  const renderProfileAction = (user: User) => {
    const openProfileChat = () => {
      handleCloseUserProfile();
      handleUserSelect(user);
    };
    const openProfileCall = (callType: CallType) => {
      handleCloseUserProfile();
      openPreCallSetupForUser(user, callType);
    };

    switch (user.friendshipStatus) {
      case 'accepted':
        return (
          <>
            <button
              type="button"
              className="send-btn profile-message-btn"
              onClick={openProfileChat}
            >
              Message
            </button>
            <button
              type="button"
              className="profile-call-btn"
              onClick={() => openProfileCall('AUDIO')}
              disabled={Boolean(activeCall)}
              aria-label={`Start audio call with ${getUserDisplayName(user)}`}
              title="Audio call"
            >
              <PhoneIcon className="profile-call-icon" />
            </button>
            <button
              type="button"
              className="profile-call-btn"
              onClick={() => openProfileCall('VIDEO')}
              disabled={Boolean(activeCall)}
              aria-label={`Start video call with ${getUserDisplayName(user)}`}
              title="Video call"
            >
              <VideoCallIcon className="profile-call-icon" />
            </button>
          </>
        );
      case 'pending_incoming': {
        const requestId = user.friendshipId;
        return requestId ? (
          <>
            <button type="button" className="send-btn profile-message-btn" onClick={openProfileChat}>
              Message
            </button>
            <button
              type="button"
              className="friend-action-btn"
              disabled={friendActionKeys.includes(`accept-profile-${user.id}`)}
              onClick={() =>
                void handleAcceptFriendRequest(requestId, `accept-profile-${user.id}`)
              }
            >
              Accept
            </button>
            <button
              type="button"
              className="friend-action-btn secondary"
              disabled={friendActionKeys.includes(`decline-profile-${user.id}`)}
              onClick={() =>
                void handleDeclineFriendRequest(requestId, `decline-profile-${user.id}`)
              }
            >
              Decline
            </button>
          </>
        ) : null;
      }
      case 'pending_outgoing':
        return (
          <>
            <button type="button" className="send-btn profile-message-btn" onClick={openProfileChat}>
              Message
            </button>
            <span className="friend-status-pill">Pending</span>
            <button
              type="button"
              className="friend-action-btn secondary"
              disabled={!user.friendshipId || friendActionKeys.includes(`cancel-${user.id}`)}
              onClick={() => void handleCancelFriendRequest(user)}
            >
              Cancel
            </button>
          </>
        );
      case 'declined':
      case 'none':
      case undefined:
      default:
        return (
          <>
            <button type="button" className="send-btn profile-message-btn" onClick={openProfileChat}>
              Message
            </button>
            <button
              type="button"
              className="friend-action-btn"
              disabled={friendActionKeys.includes(`send-${user.id}`)}
              onClick={() => void handleSendFriendRequest(user)}
            >
              Add friend
            </button>
          </>
        );
    }
  };

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

  const renderUserIdentity = (user: User, showConversationPreview = false) => {
    const sidebarTime = showConversationPreview ? formatSidebarTime(user.lastMessageAt) : '';

    return (
      <>
        {showConversationPreview ? (
          <span className="conversation-avatar-presence">
            {renderUserAvatar(user)}
            <span
              className={`conversation-presence-dot ${user.online ? 'online' : 'offline'}`}
              role="img"
              aria-label={user.online ? 'Online' : 'Offline'}
            />
          </span>
        ) : renderUserAvatar(user)}
        <div className="user-info">
          <div className="user-title-row">
            <div className="user-name">{getUserDisplayName(user)}</div>
          </div>
          {showConversationPreview ? (
            <div className="user-preview-row">
              <span className="user-preview">
                {getConversationPreviewText(user, currentUser?.id ?? null)}
                {sidebarTime ? ` · ${sidebarTime}` : ''}
              </span>
            </div>
          ) : (
            <div className="user-meta">
              <span className={`user-status ${getUserStatusClass(user)}`}>
                {getFriendshipStatusLabel(user)}
              </span>
              {shouldShowUsername(user) ? (
                <span className="user-username">@{user.username}</span>
              ) : null}
            </div>
          )}
        </div>
      </>
    );
  };

  const renderConversationStatusIcons = (target: ConversationTarget) => {
    const pinned = target.type === 'user' ? target.user.pinned : target.room.pinned;
    const muted = target.type === 'user' ? target.user.muted : target.room.muted;
    const archived = target.type === 'user' ? target.user.archived : target.room.archived;

    if (!pinned && !muted && !archived) {
      return null;
    }

    return (
      <div className="conversation-status-icons" aria-label="Conversation settings">
        {pinned ? <PinIcon className="conversation-status-icon" /> : null}
        {muted ? <MutedIcon className="conversation-status-icon" /> : null}
        {archived ? <ArchiveIcon className="conversation-status-icon" /> : null}
      </div>
    );
  };

  const renderConversationMenu = (target: ConversationTarget) => {
    const targetKey =
      target.type === 'user'
        ? `user-${target.user.id}`
        : `room-${target.room.id}`;
    const pinned = target.type === 'user' ? Boolean(target.user.pinned) : Boolean(target.room.pinned);
    const muted = target.type === 'user' ? Boolean(target.user.muted) : Boolean(target.room.muted);
    const archived = target.type === 'user' ? Boolean(target.user.archived) : Boolean(target.room.archived);
    const pending = conversationSettingPendingKey === targetKey;

    return (
      <div className="conversation-menu-wrap" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="conversation-menu-btn"
          disabled={pending}
          onClick={(event) => handleToggleConversationMenu(targetKey, event)}
          aria-haspopup="menu"
          aria-expanded={openConversationMenuKey === targetKey}
          aria-label="Conversation actions"
          title="Conversation actions"
        >
          <MoreIcon className="conversation-menu-icon" />
        </button>

        {openConversationMenuKey === targetKey ? (
          <div className="conversation-menu" role="menu">
            {target.type === 'user' ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenConversationMenuKey(null);
                  void handleOpenUserProfile(target.user);
                }}
              >
                <ProfileIcon className="conversation-menu-item-icon" />
                View profile
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => void handleUpdateConversationSetting(target, { pinned: !pinned })}
            >
              <PinIcon className="conversation-menu-item-icon" />
              {pinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => void handleUpdateConversationSetting(target, { muted: !muted })}
            >
              <MutedIcon className="conversation-menu-item-icon" />
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => void handleUpdateConversationSetting(target, { archived: !archived })}
            >
              <ArchiveIcon className="conversation-menu-item-icon" />
              {archived ? 'Unarchive' : 'Archive'}
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              disabled={pending}
              onClick={() => {
                setConversationSettingsError('');
                setConversationDeleteTarget(target);
                setOpenConversationMenuKey(null);
              }}
            >
              <TrashIcon className="conversation-menu-item-icon" />
              Delete
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderUserItem = (user: User) => {
    const unreadCount = user.unreadCount ?? 0;
    const showConversationPreview = !hasUserSearch && hasPrivateConversation(user);
    const isAcceptedFriend = user.friendshipStatus === 'accepted';

    if (showConversationPreview) {
      return (
        <div
          key={user.id}
          className={`conversation-list-row ${selectedUser?.id === user.id ? 'active' : ''}`}
        >
          <button
            type="button"
            className={`user-item conversation-trigger ${selectedUser?.id === user.id ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}`}
            onClick={() => handleUserSelect(user)}
          >
            {renderUserIdentity(user, showConversationPreview)}
            {renderConversationStatusIcons({ type: 'user', user })}
          </button>
          {unreadCount > 0 ? (
            <div className="unread-badge">{unreadCount}</div>
          ) : null}
          {renderConversationMenu({ type: 'user', user })}
        </div>
      );
    }

    return (
      <div key={user.id} className="user-item relationship-item profile-result-item">
        <button
          type="button"
          className="profile-result-trigger"
          onClick={() => {
            if (isAcceptedFriend) {
              handleUserSelect(user);
              return;
            }

            void handleOpenUserProfile(user);
          }}
          aria-label={isAcceptedFriend
            ? `Open chat with ${getUserDisplayName(user)}`
            : `View profile for ${getUserDisplayName(user)}`}
        >
          {renderUserIdentity(user)}
        </button>
        {!isAcceptedFriend ? (
          <div className="friend-actions">
            {renderFriendshipAction(user)}
          </div>
        ) : null}
      </div>
    );
  };

  const renderRoomItem = (room: ChatRoom) => {
    const unreadCount = room.unreadCount ?? 0;
    const sidebarTime = formatSidebarTime(room.lastMessageAt);

    return (
      <div
        key={`room-${room.id}`}
        className={`conversation-list-row ${selectedRoom?.id === room.id ? 'active' : ''}`}
      >
        <button
          type="button"
          className={`user-item room-item conversation-trigger ${selectedRoom?.id === room.id ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}`}
          onClick={() => handleRoomSelect(room)}
        >
          <div className="user-avatar room-avatar">
            {getRoomInitial(room)}
          </div>
          <div className="user-info">
            <div className="user-title-row">
              <div className="user-name">{room.name}</div>
            </div>
            <div className="user-preview-row">
              <span className="user-preview">
                {getRoomPreviewText(room, currentUser?.id ?? null)}
                {sidebarTime ? ` · ${sidebarTime}` : ''}
              </span>
            </div>
          </div>
          {renderConversationStatusIcons({ type: 'room', room })}
        </button>
        {unreadCount > 0 ? (
          <div className="unread-badge-wrap">
            {room.lastMessageContent && (/@all\b/i.test(room.lastMessageContent) || (currentUser && room.lastMessageContent.toLowerCase().includes('@' + currentUser.username.toLowerCase()))) ? (
              <span className="mention-unread-indicator" title="You were mentioned">@</span>
            ) : null}
            <div className="unread-badge">{unreadCount}</div>
          </div>
        ) : null}
        {renderConversationMenu({ type: 'room', room })}
      </div>
    );
  };

  const renderSidebarSkeletons = () =>
    USER_SKELETON_KEYS.map((key) => (
      <div key={key} className="user-item user-item-skeleton" aria-hidden="true">
        <div className="skeleton-avatar" />
        <div className="skeleton-user-info">
          <div className="skeleton-line name" />
          <div className="skeleton-line status" />
        </div>
      </div>
    ));

  const renderSidebarSearchList = () => {
    if (usersLoading) {
      return renderSidebarSkeletons();
    }

    if (usersError) {
      return (
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
      );
    }

    if (users.length === 0) {
      return <div className="list-state">{usersEmptyMessage}</div>;
    }

    return users.map(renderUserItem);
  };

  const renderSidebarChatList = () => {
    const hasAnyConversation = sidebarConversationItems.length > 0;
    const emptyConversationMessage =
      conversationFilter === 'archived'
        ? 'No archived conversations.'
        : conversationFilter === 'unread'
          ? 'No unread conversations.'
          : 'No conversations yet. Search a username to start a chat.';

    if (sidebarBusy && !hasAnyConversation) {
      return renderSidebarSkeletons();
    }

    if (!sidebarBusy && !usersError && !roomsError && !hasAnyConversation) {
      return (
        <div className="list-state empty-groups-state">
          <span>{emptyConversationMessage}</span>
        </div>
      );
    }

    return (
      <>
        {usersError && conversationUsers.length === 0 ? (
          <div className="list-state error-state">
            <span>{usersError}</span>
            <button type="button" className="retry-btn" onClick={() => void loadUsers({ search: '' })}>
              Retry
            </button>
          </div>
        ) : null}
        {roomsError && rooms.length === 0 ? (
          <div className="list-state error-state">
            <span>{roomsError}</span>
            <button type="button" className="retry-btn" onClick={() => void loadRooms()}>
              Retry
            </button>
          </div>
        ) : null}
        {sidebarConversationItems.map((item) =>
          item.type === 'user' ? renderUserItem(item.user) : renderRoomItem(item.room)
        )}
      </>
    );
  };

  const renderMainFriendItem = (user: User) => (
    <div key={user.id} className="main-list-item friend-main-item">
      <button
        type="button"
        className="friend-main-profile-trigger"
        onClick={() => void handleOpenUserProfile(user)}
        aria-label={`View profile of ${getUserDisplayName(user)}`}
      >
        <div className="main-list-avatar-wrap">
          {renderUserAvatar(user)}
          <span
            className={`main-list-presence-dot ${user.online ? 'online' : 'offline'}`}
            aria-hidden="true"
          />
        </div>
        <div className="main-list-copy">
          <strong>{getUserDisplayName(user)}</strong>
          <span>@{user.username}</span>
        </div>
      </button>
      <button
        type="button"
        className="friend-action-btn secondary friend-main-message-btn"
        onClick={() => handleUserSelect(user)}
      >
        Message
      </button>
      <span className={`main-status-pill ${user.online ? 'online' : 'offline'}`}>
        {user.online ? 'Online' : 'Offline'}
      </span>
    </div>
  );

  const renderMainPanelSkeletons = () => (
    <div className="main-list" aria-hidden="true">
      {USER_SKELETON_KEYS.map((key) => (
        <div key={key} className="main-list-item main-list-item-skeleton">
          <div className="skeleton-avatar" />
          <div className="skeleton-user-info">
            <div className="skeleton-line name" />
            <div className="skeleton-line status" />
          </div>
        </div>
      ))}
    </div>
  );

  const renderFriendsPanel = () => {
    const onlineFriendCount = friends.filter((friend) => friend.online).length;

    return (
      <section className="main-panel people-panel" aria-labelledby="friends-panel-title">
        <div className="main-panel-header">
          <div className="main-panel-heading">
            <span className="panel-heading-icon">
              <FriendsIcon className="panel-heading-svg" />
            </span>
            <div>
              <span className="main-panel-eyebrow">Friends</span>
              <h3 id="friends-panel-title">Friend list</h3>
              <p>
                {friends.length} friends - {onlineFriendCount} online
              </p>
            </div>
          </div>
          <button
            type="button"
            className="panel-icon-action"
            onClick={() => void loadUsers({ search: '', silent: true })}
            aria-label="Refresh friend list"
            title="Refresh"
          >
            <RefreshIcon className="panel-action-icon" />
          </button>
        </div>

        {friends.length > 0 ? (
          <div className="main-panel-search" role="search">
            <input
              type="search"
              value={friendSearchQuery}
              onChange={(event) => handleFriendSearchChange(event.target.value)}
              className="main-panel-search-input"
              placeholder="Search friends by name or username"
              aria-label="Search friends by name or username"
              autoComplete="off"
              spellCheck={false}
            />
            {friendSearchQuery ? (
              <button
                type="button"
                className="main-panel-search-clear"
                onClick={handleClearFriendSearch}
                aria-label="Clear friend search"
              >
                ×
              </button>
            ) : null}
          </div>
        ) : null}

        {usersLoading && friends.length === 0 ? (
          renderMainPanelSkeletons()
        ) : usersError && friends.length === 0 ? (
          <div className="main-panel-state error-state">
            <span>{usersError}</span>
            <button
              type="button"
              className="retry-btn"
              onClick={() => void loadUsers({ search: '' })}
            >
              Retry
            </button>
          </div>
        ) : friends.length === 0 ? (
          <div className="main-panel-state panel-empty-state">
            <span className="panel-empty-icon">
              <FriendsIcon className="panel-heading-svg" />
            </span>
            <strong>No friends yet</strong>
            <span>Search username in the sidebar to add friends.</span>
          </div>
        ) : filteredFriends.length === 0 ? (
          <div className="main-panel-state panel-empty-state">
            <span className="panel-empty-icon">
              <FriendsIcon className="panel-heading-svg" />
            </span>
            <strong>No matching friends</strong>
            <span>Try another name or username.</span>
          </div>
        ) : (
          <div className="main-list">
            {filteredFriends.map(renderMainFriendItem)}
          </div>
        )}
      </section>
    );
  };

  const renderRequestItem = (friendship: Friendship) => {
    const requesterName = getUserDisplayName(friendship.requester);

    return (
      <div key={friendship.id} className="main-list-item request-main-item">
        <div className="main-list-avatar-wrap">
          {renderUserAvatar(friendship.requester)}
        </div>
        <div className="main-list-copy">
          <strong>{requesterName}</strong>
          {shouldShowUsername(friendship.requester) ? (
            <span>@{friendship.requester.username}</span>
          ) : (
            <span>Incoming friend request</span>
          )}
          <small>Waiting for your response</small>
        </div>
        <div className="request-actions">
          <button
            type="button"
            className="friend-action-btn"
            disabled={friendActionKeys.includes(`accept-request-${friendship.id}`)}
            onClick={() =>
              void handleAcceptFriendRequest(friendship.id, `accept-request-${friendship.id}`)
            }
            aria-label={`Accept friend request from ${requesterName}`}
          >
            Accept
          </button>
          <button
            type="button"
            className="friend-action-btn secondary"
            disabled={friendActionKeys.includes(`decline-request-${friendship.id}`)}
            onClick={() =>
              void handleDeclineFriendRequest(friendship.id, `decline-request-${friendship.id}`)
            }
            aria-label={`Decline friend request from ${requesterName}`}
          >
            Decline
          </button>
        </div>
      </div>
    );
  };

  const renderRequestsPanel = () => (
    <section className="main-panel people-panel" aria-labelledby="requests-panel-title">
      <div className="main-panel-header">
        <div className="main-panel-heading">
          <span className="panel-heading-icon">
            <FriendRequestIcon className="panel-heading-svg" />
          </span>
          <div>
            <span className="main-panel-eyebrow">Requests</span>
            <h3 id="requests-panel-title">Friend requests</h3>
            <p>{friendRequestBadgeCount} pending requests</p>
          </div>
        </div>
        <button
          type="button"
          className="panel-icon-action"
          onClick={() =>
            void Promise.all([
              loadIncomingFriendRequests(),
              loadFriendSummary({ silent: true }),
            ])
          }
          aria-label="Refresh friend requests"
          title="Refresh"
        >
          <RefreshIcon className="panel-action-icon" />
        </button>
      </div>

      {friendRequestsLoading ? (
        renderMainPanelSkeletons()
      ) : friendRequestsError ? (
        <div className="main-panel-state error-state">
          <span>{friendRequestsError}</span>
          <button
            type="button"
            className="retry-btn"
            onClick={() => void loadIncomingFriendRequests()}
          >
            Retry
          </button>
        </div>
      ) : incomingFriendRequests.length === 0 ? (
        <div className="main-panel-state panel-empty-state">
          <span className="panel-empty-icon">
            <FriendRequestIcon className="panel-heading-svg" />
          </span>
          <strong>No pending requests</strong>
          <span>New requests will appear here.</span>
        </div>
      ) : (
        <div className="main-list">
          {incomingFriendRequests.map(renderRequestItem)}
        </div>
      )}
    </section>
  );

  const renderDetailsMemberItem = (user: User) => {
    const isCurrentUser = user.id === currentUser?.id;
    const isOwner = user.id === selectedRoomOwnerId || user.role === 'OWNER';
    const isMod = user.role === 'MODERATOR';
    const memberDisplayName = getUserDisplayName(user);
    const accountDisplayName = getUserAccountDisplayName(user);
    const nicknameValue = groupMemberNicknames[user.id] ?? '';
    const normalizedNicknameValue = nicknameValue.trim();
    const normalizedSavedNickname = (user.nickname ?? '').trim();
    const nicknameChanged = normalizedNicknameValue !== normalizedSavedNickname;
    const nicknamePending = groupSettingsPendingAction === `nickname-${user.id}`;
    const kickPending = groupSettingsPendingAction === `kick-${user.id}`;
    const rolePending = groupSettingsPendingAction === `role-${user.id}`;
    const ownerTransferPending = groupSettingsPendingAction === `owner-${user.id}`;
    const canKick = canKickMember(user);
    const memberMenuOpen = openGroupMemberMenuId === user.id;
    const editingNickname = editingGroupMemberNicknameId === user.id;

    return (
      <div
        key={user.id}
        className={`details-member-item ${editingNickname ? 'editing' : ''}`}
      >
        {isCurrentUser ? (
          <>
            {renderUserAvatar(user, 'user-avatar small-avatar')}
            <div className="details-member-copy">
              <div className="details-member-title">
                <strong>{memberDisplayName}</strong>
                {isOwner ? (
                  <span className="details-role-badge owner-badge">👑 Owner</span>
                ) : isMod ? (
                  <span className="details-role-badge mod-badge">🛡️ Moderator</span>
                ) : null}
              </div>
              {user.username ? <span>@{user.username}</span> : null}
            </div>
          </>
        ) : (
          <>
            {renderUserAvatar(user, 'user-avatar small-avatar')}
            <div className="details-member-copy">
              <div className="details-member-title">
                <strong>{memberDisplayName}</strong>
                {isOwner ? (
                  <span className="details-role-badge owner-badge">👑 Owner</span>
                ) : isMod ? (
                  <span className="details-role-badge mod-badge">🛡️ Moderator</span>
                ) : null}
              </div>
              {user.username ? <span>@{user.username}</span> : null}
            </div>
          </>
        )}

        <div className="details-member-menu-wrap">
          <button
            type="button"
            className="details-member-menu-btn"
            disabled={groupSettingsSaving}
            onClick={() => handleToggleGroupMemberMenu(user.id)}
            aria-haspopup="menu"
            aria-expanded={memberMenuOpen}
            aria-label={`Member actions for ${memberDisplayName}`}
            title="Member actions"
          >
            <MoreIcon className="details-member-menu-icon" />
          </button>

          {memberMenuOpen ? (
            <div className="details-member-menu" role="menu">
                {!isCurrentUser ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenGroupMemberMenuId(null);
                      void handleOpenUserProfile(user);
                    }}
                  >
                    View profile
                  </button>
                ) : null}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleStartEditGroupMemberNickname(user)}
                >
                  Edit nickname
                </button>

                {isCurrentUserOwner && !isCurrentUser ? (
                  <>
                    {isMod ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={groupSettingsSaving}
                        onClick={() => void handleUpdateMemberRole(user, 'MEMBER')}
                      >
                        {rolePending ? 'Updating...' : 'Demote from moderator'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={groupSettingsSaving}
                        onClick={() => void handleUpdateMemberRole(user, 'MODERATOR')}
                      >
                        {rolePending ? 'Updating...' : 'Promote to moderator'}
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={groupSettingsSaving}
                      onClick={() => void handleTransferRoomOwner(user)}
                    >
                      {ownerTransferPending ? 'Transferring...' : 'Transfer group ownership'}
                    </button>
                  </>
                ) : null}

                {canKick ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    disabled={groupSettingsSaving}
                    onClick={() => void handleKickRoomMember(user)}
                  >
                    {kickPending ? 'Removing...' : 'Remove from group'}
                  </button>
                ) : null}
              </div>
            ) : null}
        </div>

        {editingNickname ? (
          <div className="details-member-editor">
            <input
              type="text"
              value={nicknameValue}
              placeholder={accountDisplayName}
              maxLength={80}
              disabled={groupSettingsSaving}
              autoComplete="off"
              spellCheck={false}
              aria-label={`Nickname for ${accountDisplayName}`}
              onChange={(event) =>
                handleGroupMemberNicknameChange(user.id, event.target.value)
              }
            />
            <div className="details-member-editor-actions">
              <button
                type="button"
                className="details-small-action-btn"
                disabled={!nicknameChanged || groupSettingsSaving}
                onClick={() => void handleUpdateRoomMemberNickname(user)}
              >
                {nicknamePending ? 'Saving' : 'Save'}
              </button>
              <button
                type="button"
                className="details-small-action-btn secondary"
                disabled={groupSettingsSaving}
                onClick={() => handleCancelEditGroupMemberNickname(user)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

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

  const renderSharedMediaContent = () => {
    const sharedPhotoVideoItems = sharedMediaItems.filter(
      (message) => getMessageType(message) === 'IMAGE' || getMessageType(message) === 'VIDEO'
    );

    if (sharedMediaLoading && sharedPhotoVideoItems.length === 0) {
      return (
        <div className="shared-media-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={`shared-media-skeleton-${index}`} className="shared-media-skeleton" />
          ))}
        </div>
      );
    }

    if (sharedMediaError && sharedPhotoVideoItems.length === 0) {
      return (
        <div className="shared-content-state">
          <span>{sharedMediaError}</span>
          <button
            type="button"
            className="shared-content-retry-btn"
            onClick={() => void loadSharedContent('media', { reset: true })}
          >
            Retry
          </button>
        </div>
      );
    }

    if (sharedPhotoVideoItems.length === 0) {
      return <div className="details-empty-text">No shared media yet.</div>;
    }

    return (
      <>
        <div className="shared-media-grid">
          {sharedPhotoVideoItems.map((message) => {
            const mediaUrl = getMediaUrl(message.mediaUrl);
            if (!mediaUrl) {
              return null;
            }

            const isVideo = getMessageType(message) === 'VIDEO';
            return (
              <div key={message.id} className="shared-media-card">
                <button
                  type="button"
                  className="shared-media-item"
                  onClick={() => setMediaViewerMessage(message)}
                  aria-label={isVideo ? 'Open video preview' : 'Open image preview'}
                  title={isVideo ? 'Video' : 'Photo'}
                >
                  {isVideo ? (
                    <>
                      <video src={mediaUrl} muted playsInline preload="metadata" />
                      <span className="shared-media-play" aria-hidden="true" />
                    </>
                  ) : (
                    <img src={mediaUrl} alt={message.content || 'Shared image'} loading="lazy" />
                  )}
                </button>
                <button
                  type="button"
                  className="shared-media-jump-btn"
                  onClick={() => void handleJumpToMessage(message.id)}
                  aria-label="Go to message"
                  title="Go to message"
                >
                  <JumpIcon className="shared-media-jump-icon" />
                </button>
              </div>
            );
          })}
        </div>

        {sharedMediaError ? <div className="shared-content-inline-error">{sharedMediaError}</div> : null}

        {sharedMediaHasMore ? (
          <button
            type="button"
            className="shared-content-load-btn"
            disabled={sharedMediaLoading}
            onClick={() => void loadSharedContent('media')}
          >
            {sharedMediaLoading ? 'Loading' : 'Load more'}
          </button>
        ) : null}
      </>
    );
  };

  const renderSharedFilesContent = () => {
    const sharedFileItems = sharedMediaItems.filter(
      (message) => getMessageType(message) === 'FILE'
    );

    if (sharedMediaLoading && sharedFileItems.length === 0) {
      return (
        <div className="shared-file-list" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <span key={`shared-file-skeleton-${index}`} className="shared-link-skeleton" />
          ))}
        </div>
      );
    }

    if (sharedMediaError && sharedFileItems.length === 0) {
      return (
        <div className="shared-content-state">
          <span>{sharedMediaError}</span>
          <button
            type="button"
            className="shared-content-retry-btn"
            onClick={() => void loadSharedContent('media', { reset: true })}
          >
            Retry
          </button>
        </div>
      );
    }

    if (sharedFileItems.length === 0) {
      return <div className="details-empty-text">No shared files yet.</div>;
    }

    return (
      <>
        <div className="shared-file-list">
          {sharedFileItems.map((message) => {
            const mediaUrl = getMediaUrl(message.mediaUrl);
            if (!mediaUrl) {
              return null;
            }

            const ext = getFileExtension(message.mediaFormat || message.content || mediaUrl);
            const fileName = message.content?.trim() || `attachment.${ext.toLowerCase()}`;
            const badgeClass = getFileBadgeColor(ext);
            const sizeLabel = formatFileSize(message.mediaBytes);

            return (
              <div key={message.id} className="shared-file-row">
                <a
                  className="shared-file-item"
                  href={mediaUrl}
                  download={fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Download ${fileName}`}
                >
                  <div className={`shared-file-icon-wrap ${badgeClass}`}>
                    <DocumentIcon className="shared-file-icon" />
                    <span className="shared-file-ext">{ext}</span>
                  </div>
                  <div className="shared-file-info">
                    <strong className="shared-file-name" title={fileName}>{fileName}</strong>
                    <span className="shared-file-meta">
                      {sizeLabel ? `${sizeLabel} • ` : ''}
                      {formatMessageTime(message.timestamp)}
                    </span>
                  </div>
                </a>
                <button
                  type="button"
                  className="shared-link-jump-btn"
                  onClick={() => void handleJumpToMessage(message.id)}
                  aria-label="Go to message"
                  title="Go to message"
                >
                  <JumpIcon className="shared-link-jump-icon" />
                </button>
              </div>
            );
          })}
        </div>

        {sharedMediaError ? <div className="shared-content-inline-error">{sharedMediaError}</div> : null}

        {sharedMediaHasMore ? (
          <button
            type="button"
            className="shared-content-load-btn"
            disabled={sharedMediaLoading}
            onClick={() => void loadSharedContent('media')}
          >
            {sharedMediaLoading ? 'Loading' : 'Load more'}
          </button>
        ) : null}
      </>
    );
  };

  const renderSharedLinksContent = () => {
    if (sharedLinksLoading && sharedLinkItems.length === 0) {
      return (
        <div className="shared-link-list" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <span key={`shared-link-skeleton-${index}`} className="shared-link-skeleton" />
          ))}
        </div>
      );
    }

    if (sharedLinksError && sharedLinkItems.length === 0) {
      return (
        <div className="shared-content-state">
          <span>{sharedLinksError}</span>
          <button
            type="button"
            className="shared-content-retry-btn"
            onClick={() => void loadSharedContent('links', { reset: true })}
          >
            Retry
          </button>
        </div>
      );
    }

    if (sharedLinkItems.length === 0) {
      return <div className="details-empty-text">No shared links yet.</div>;
    }

    return (
      <>
        <div className="shared-link-list">
          {sharedLinkItems.map((message) => {
            const preview = message.linkPreview;
            const url = preview?.url?.trim();
            if (!url) {
              return null;
            }

            const title = preview?.title?.trim() || url;
            const description = preview?.description?.trim() || message.content?.trim() || url;
            const domain = getLinkPreviewDomain(preview) || 'Link';

            return (
              <div key={message.id} className="shared-link-row">
                <a
                  className="shared-link-item"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="shared-link-domain">{domain}</span>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </a>
                <button
                  type="button"
                  className="shared-link-jump-btn"
                  onClick={() => void handleJumpToMessage(message.id)}
                  aria-label="Go to message"
                  title="Go to message"
                >
                  <JumpIcon className="shared-link-jump-icon" />
                </button>
              </div>
            );
          })}
        </div>

        {sharedLinksError ? <div className="shared-content-inline-error">{sharedLinksError}</div> : null}

        {sharedLinksHasMore ? (
          <button
            type="button"
            className="shared-content-load-btn"
            disabled={sharedLinksLoading}
            onClick={() => void loadSharedContent('links')}
          >
            {sharedLinksLoading ? 'Loading' : 'Load more'}
          </button>
        ) : null}
      </>
    );
  };

  const renderSharedContentSections = () => {
    const sharedPhotoVideoCount = sharedMediaItems.filter(
      (message) => getMessageType(message) === 'IMAGE' || getMessageType(message) === 'VIDEO'
    ).length;
    const sharedFileCount = sharedMediaItems.filter(
      (message) => getMessageType(message) === 'FILE'
    ).length;

    return (
      <>
        <section className="details-section" aria-labelledby="shared-media-title">
          <button
            type="button"
            className="details-section-toggle-btn"
            onClick={() => setSharedMediaExpanded((current) => !current)}
            aria-expanded={sharedMediaExpanded}
            aria-controls="shared-media-panel"
          >
            <div className="details-section-heading">
              <h4 id="shared-media-title">Media</h4>
              {sharedPhotoVideoCount > 0 ? <span>{sharedPhotoVideoCount}</span> : null}
            </div>
            <ChevronDownIcon className={`details-toggle-icon ${sharedMediaExpanded ? 'expanded' : ''}`} />
          </button>
          {sharedMediaExpanded ? (
            <div id="shared-media-panel" className="shared-content-panel">
              {renderSharedMediaContent()}
            </div>
          ) : null}
        </section>

        <section className="details-section" aria-labelledby="shared-files-title">
          <button
            type="button"
            className="details-section-toggle-btn"
            onClick={() => setSharedFilesExpanded((current) => !current)}
            aria-expanded={sharedFilesExpanded}
            aria-controls="shared-files-panel"
          >
            <div className="details-section-heading">
              <h4 id="shared-files-title">Files</h4>
              {sharedFileCount > 0 ? <span>{sharedFileCount}</span> : null}
            </div>
            <ChevronDownIcon className={`details-toggle-icon ${sharedFilesExpanded ? 'expanded' : ''}`} />
          </button>
          {sharedFilesExpanded ? (
            <div id="shared-files-panel" className="shared-content-panel">
              {renderSharedFilesContent()}
            </div>
          ) : null}
        </section>

        <section className="details-section" aria-labelledby="shared-links-title">
          <button
            type="button"
            className="details-section-toggle-btn"
            onClick={() => setSharedLinksExpanded((current) => !current)}
            aria-expanded={sharedLinksExpanded}
            aria-controls="shared-links-panel"
          >
            <div className="details-section-heading">
              <h4 id="shared-links-title">Links</h4>
              {sharedLinkItems.length > 0 ? <span>{sharedLinkItems.length}</span> : null}
            </div>
            <ChevronDownIcon className={`details-toggle-icon ${sharedLinksExpanded ? 'expanded' : ''}`} />
          </button>
          {sharedLinksExpanded ? (
            <div id="shared-links-panel" className="shared-content-panel">
              {renderSharedLinksContent()}
            </div>
          ) : null}
        </section>
      </>
    );
  };

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
          {hasUserSearch ? renderSidebarSearchList() : renderSidebarChatList()}
        </ConversationSidebar>

        <main className={`chat-area ${mainView !== 'chat' ? 'main-view-open' : ''}`}>
          {mainView === 'friends' ? (
            renderFriendsPanel()
          ) : mainView === 'requests' ? (
            renderRequestsPanel()
          ) : selectedConversationOpen ? (
            <>
              <ConversationHeader
                selectedUser={selectedUser}
                selectedRoom={selectedRoom}
                selectedConversationName={selectedConversationName}
                canStartPrivateCall={canStartPrivateCall}
                canAddMembers={currentUserCanManageSelectedRoom}
                detailsOpen={detailsOpen}
                rightSidebarTab={rightSidebarTab}
                onBackToChatList={handleReturnToConversationList}
                onStartCall={handleStartCall}
                onOpenUserProfile={(user) => void handleOpenUserProfile(user)}
                onOpenAddMembers={() => {
                  setGroupSettingsError('');
                  setSelectedAddMemberIds([]);
                  setAddMembersModalOpen(true);
                }}
                onToggleMessageSearch={handleToggleMessageSearch}
                onToggleConversationDetails={handleToggleConversationDetails}
              />

              {pinnedMessage ? (
                <div className="pinned-message-banner">
                  <button
                    type="button"
                    className="pinned-message-banner-body"
                    onClick={() => {
                      const msg = messages.find((m) => m.id === pinnedMessage.id);
                      if (msg) scrollToMessageById(msg.id);
                    }}
                    aria-label="Go to pinned message"
                  >
                    <span className="pinned-banner-icon">📌</span>
                    <span className="pinned-banner-content">
                      <span className="pinned-banner-label">Pinned message</span>
                      <span className="pinned-banner-text">
                        {pinnedMessage.recalled
                          ? 'Message recalled'
                          : pinnedMessage.content || '📎 Media'}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="pinned-banner-close"
                    onClick={() => void handleUnpinMessage()}
                    aria-label="Unpin message"
                    title="Unpin"
                  >
                    ×
                  </button>
                </div>
              ) : null}

              <div
                ref={messagesContainerRef}
                className={`messages-container ${isDraggingFile ? 'dragging-over' : ''}`}
                aria-busy={messagesLoading || olderMessagesLoading}
                onPointerDown={markMessagesScrollIntent}
                onScroll={handleMessagesScroll}
                onTouchMove={markMessagesScrollIntent}
                onWheel={markMessagesScrollIntent}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isDraggingFile) setIsDraggingFile(true);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setIsDraggingFile(false);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    handleFileSelected(file);
                  }
                }}
              >
                {isDraggingFile ? (
                  <div className="chat-drag-drop-overlay">
                    <PaperclipIcon className="chat-drag-drop-icon" />
                    <span>Drop file here to send</span>
                  </div>
                ) : null}
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
                  <>
                    {hasMoreMessages ? (
                      <button
                        type="button"
                        className="older-messages-btn"
                        onClick={() => void loadOlderMessages()}
                        disabled={olderMessagesLoading}
                      >
                        {olderMessagesLoading ? 'Loading older messages...' : 'Load older messages'}
                      </button>
                    ) : null}
                    {messageListItems.map((item) => (
                      <MessageItem
                        key={item.key}
                        item={item}
                        currentUser={currentUser}
                        selectedUser={selectedUser}
                        selectedRoom={selectedRoom}
                        unreadDividerRef={unreadDividerRef}
                        latestSeenOutgoingMessageId={latestSeenOutgoingMessageId}
                        latestOutgoingMessageId={latestOutgoingMessageId}
                        latestRoomSeenByByMessageId={latestRoomSeenByByMessageId}
                        seenByLoadingMessageIds={seenByLoadingMessageIds}
                        detailsOpen={detailsOpen}
                        rightSidebarTab={rightSidebarTab}
                        messageSearchQuery={messageSearchQuery}
                        messageSearchResultIds={messageSearchResultIds}
                        highlightedMessageId={highlightedMessageId}
                        renderCallMessageBody={renderCallMessageBody}
                        findKnownUserById={findKnownUserById}
                        handleOpenUserProfile={handleOpenUserProfile}
                        renderMessageActions={renderMessageActions}
                        renderMessageBody={renderMessageBody}
                        renderMessageReactions={renderMessageReactions}
                        handleRetryMessage={handleRetryMessage}
                        renderGroupSeenBy={renderGroupSeenBy}
                      />
                    ))}
                  </>
                )}
                {!messagesLoading && typingIndicatorLabel ? (
                  <div className="typing-indicator">{typingIndicatorLabel}</div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>

              {roomSummaryRoomId === selectedRoom?.id && (roomSummaryLoading || roomSummaryError || roomSummary) ? (
                <section className="room-summary-card" aria-live="polite" aria-label="Private chat summary">
                  <div className="room-summary-card-header">
                    <div>
                      <span>Private summary</span>
                      {roomSummary ? <small>{roomSummary.messageCount} recent messages</small> : null}
                    </div>
                    <button
                      type="button"
                      className="room-summary-close-btn"
                      onClick={() => {
                        setRoomSummary(null);
                        setRoomSummaryRoomId(null);
                        setRoomSummaryError('');
                      }}
                      disabled={roomSummaryLoading}
                      aria-label="Close summary"
                      title="Close summary"
                    >
                      <CloseIcon className="room-summary-close-icon" />
                    </button>
                  </div>
                  {roomSummaryLoading ? <div className="room-summary-loading">Summarizing recent messages...</div> : null}
                  {roomSummaryError ? <div className="room-summary-error">{roomSummaryError}</div> : null}
                  {roomSummary ? <div className="room-summary-content">{roomSummary.summary}</div> : null}
                </section>
              ) : null}

              <MessageInput
                onSubmit={handleSendMessage}
                mediaFileInputRef={mediaFileInputRef}
                docFileInputRef={docFileInputRef}
                mediaAccept={MEDIA_ACCEPT}
                onFileChange={handleMediaFileChange}
                replyPreview={activeReplyPreview}
                onCancelReply={handleCancelReply}
                pendingMedia={pendingMedia}
                mediaError={mediaError}
                mediaUploading={mediaUploading}
                canAttachMedia={Boolean(selectedRoom || (selectedUser && canChatWithUser(selectedUser)))}
                onClearPendingMedia={clearPendingMedia}
                onOpenMediaPicker={handleOpenMediaPicker}
                onOpenDocumentPicker={handleOpenDocPicker}
                onVoiceRecorded={handleVoiceRecorded}
                emojiButtonRef={emojiButtonRef}
                emojiPickerOpen={emojiPickerOpen}
                onToggleEmojiPicker={handleToggleEmojiPicker}
                messageInputRef={messageInputRef}
                messageInput={messageInput}
                onMessageInputChange={handleMessageInputChange}
                onMessageInputKeyDown={handleMessageInputKeyDown}
                onUpdateMessageInputSelection={updateMessageInputSelection}
                selectedConversationName={selectedConversationName}
                mentionQuery={mentionQuery}
                mentionCandidates={mentionCandidates}
                mentionActiveIndex={mentionActiveIndex}
                onInsertMention={insertMention}
                slashCommandQuery={slashCommandQuery}
                onInsertSummaryCommand={insertSummaryCommand}
                emojiPickerRef={emojiPickerRef}
                onInsertEmoji={handleInsertEmoji}
              />
            </>
          ) : (
            <div className="no-chat-selected">
              <span className="no-chat-selected-icon" aria-hidden="true">
                <FriendsIcon className="no-chat-selected-icon-svg" />
              </span>
              <strong>Choose a conversation</strong>
              <p>Select a friend or group to start chatting.</p>
            </div>
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

      {renderPreCallSetupModal()}
      {renderCallOverlay()}

      {mediaViewerUrl ? (
        <div
          className="modal-backdrop media-viewer-backdrop"
          onClick={() => setMediaViewerMessage(null)}
        >
          <div
            className="media-viewer-modal"
            role="dialog"
            aria-modal="true"
            aria-label={mediaViewerType === 'VIDEO' ? 'Video preview' : 'Image preview'}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="media-viewer-close"
              onClick={() => setMediaViewerMessage(null)}
              aria-label="Close media preview"
            >
              <CloseIcon className="media-viewer-close-icon" />
            </button>
            {mediaViewerType === 'VIDEO' ? (
              <video
                className="media-viewer-video"
                src={mediaViewerUrl}
                controls
                autoPlay
              />
            ) : (
              <img
                src={mediaViewerUrl}
                alt={mediaViewerMessage?.content || 'Shared image preview'}
              />
            )}
            {mediaViewerMessage?.content ? (
              <div className="media-viewer-caption">{mediaViewerMessage.content}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeViewedProfileUser ? (
        <div className="modal-backdrop">
          <div
            className="user-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-profile-title"
          >
            <div className="user-profile-header">
              <span>Profile</span>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseUserProfile}
                aria-label="Close user profile"
              >
                ×
              </button>
            </div>

            <div className="user-profile-body">
              {renderUserAvatar(activeViewedProfileUser, 'user-avatar profile-view-avatar')}
              <div className="user-profile-copy">
                <h3 id="view-profile-title">{getUserDisplayName(activeViewedProfileUser)}</h3>
                <span>@{activeViewedProfileUser.username}</span>
              </div>
              {activeViewedProfileUser.bio?.trim() ? (
                <p className="profile-bio">{activeViewedProfileUser.bio}</p>
              ) : null}
              {viewedProfileLoading ? <div className="profile-loading">Refreshing profile...</div> : null}
              {viewedProfileError ? <div className="profile-action-error">{viewedProfileError}</div> : null}

              <div className="profile-info-grid">
                <div className="profile-info-item">
                  <span>Status</span>
                  <strong className={activeViewedProfileUser.online ? 'online' : 'offline'}>
                    {getPresenceLabel(activeViewedProfileUser)}
                  </strong>
                </div>
                <div className="profile-info-item">
                  <span>Relationship</span>
                  <strong>{getRelationshipLabel(activeViewedProfileUser)}</strong>
                </div>
              </div>

              <div className="profile-action-row">
                {renderProfileAction(activeViewedProfileUser)}
              </div>
              {profileActionError ? (
                <div className="profile-action-error">{profileActionError}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {profileEditorOpen ? (
        <div className="modal-backdrop">
          <div
            className="group-modal profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
          >
            <form onSubmit={handleUpdateProfile} className="group-form profile-form">
              <div className="group-modal-header">
                <div>
                  <h3 id="edit-profile-title">Edit profile</h3>
                  <p>@{currentUser?.username}</p>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={handleCloseProfileEditor}
                  aria-label="Close edit profile"
                  disabled={profileSaving}
                >
                  ×
                </button>
              </div>

              <div className="profile-avatar-editor">
                <label className="profile-avatar-upload" aria-label="Change avatar">
                  <div className="user-avatar profile-avatar-preview">
                    {profileAvatarPreview ? (
                      <img src={profileAvatarPreview} alt="" />
                    ) : (
                      getUserInitial(currentUser)
                    )}
                  </div>
                  <span className="profile-avatar-edit-badge" aria-hidden="true">
                    <MediaIcon className="profile-avatar-edit-icon" />
                  </span>
                  <input
                    type="file"
                    accept={AVATAR_ACCEPT}
                    onChange={handleProfileAvatarChange}
                    disabled={profileSaving}
                  />
                </label>
                <small className="profile-avatar-help">
                  Click your avatar to change it · JPG, PNG, GIF, or WebP · Max {MAX_AVATAR_SIZE_MB}MB
                </small>
              </div>

              <label className="group-field">
                <span>Full name</span>
                <input
                  type="text"
                  value={profileFullName}
                  onChange={(event) => {
                    setProfileFullName(event.target.value);
                    setProfileError('');
                  }}
                  placeholder="Ngoc Thinh"
                  maxLength={100}
                  autoFocus
                  disabled={profileSaving}
                />
              </label>

              <label className="group-field">
                <span>Bio</span>
                <textarea
                  value={profileBio}
                  onChange={(event) => {
                    setProfileBio(event.target.value);
                    setProfileError('');
                  }}
                  placeholder="Write a short status"
                  maxLength={BIO_MAX_LENGTH}
                  rows={3}
                  disabled={profileSaving}
                />
                <small className="profile-bio-count">
                  {profileBio.trim().length}/{BIO_MAX_LENGTH}
                </small>
              </label>

              {profileError ? <div className="group-error">{profileError}</div> : null}

              <div className="group-modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleCloseProfileEditor}
                  disabled={profileSaving}
                >
                  Cancel
                </button>
                <button type="submit" className="send-btn" disabled={profileSaving}>
                  {profileSaving ? 'Saving' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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
                  <p>{groupMemberRequirementText}</p>
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
                  onChange={(event) => {
                    setGroupName(event.target.value);
                    setGroupError('');
                  }}
                  placeholder="Weekend plans"
                  maxLength={100}
                  autoFocus
                />
              </label>

              <div className="group-field">
                <div className="group-field-heading">
                  <span>Members</span>
                  <small>Minimum {MIN_GROUP_MEMBERS} members</small>
                </div>
                <div className="group-member-list">
                  {friends.length === 0 ? (
                    <div className="list-state">No friends available.</div>
                  ) : (
                    friends.map((user) => (
                      <label key={user.id} className="group-member-option">
                        <input
                          type="checkbox"
                          checked={selectedGroupMemberIds.includes(user.id)}
                          onChange={() => handleToggleGroupMember(user.id)}
                        />
                        {renderUserAvatar(user, 'user-avatar small-avatar')}
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

      {conversationDeleteTarget ? (
        <div
          className="modal-backdrop delete-conversation-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-conversation-title"
          aria-describedby="delete-conversation-description"
          onClick={(event) => {
            if (event.target === event.currentTarget && conversationSettingPendingKey === null) {
              setConversationDeleteTarget(null);
            }
          }}
        >
          <div className="delete-conversation-modal">
            <div className="delete-conversation-icon" aria-hidden="true">
              <TrashIcon />
            </div>
            <h3 id="delete-conversation-title">Delete chat?</h3>
            <p id="delete-conversation-description">
              This removes your conversation with{' '}
              <strong>
                {conversationDeleteTarget.type === 'user'
                  ? getUserDisplayName(conversationDeleteTarget.user)
                  : conversationDeleteTarget.room.name}
              </strong>{' '}
              from this account only. Other people will still see it, and new messages will appear normally.
            </p>
            {conversationSettingsError ? (
              <div className="delete-conversation-error" role="alert">{conversationSettingsError}</div>
            ) : null}
            <div className="delete-conversation-actions">
              <button
                type="button"
                className="secondary-btn"
                autoFocus
                disabled={conversationSettingPendingKey !== null}
                onClick={() => setConversationDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-conversation-btn"
                disabled={conversationSettingPendingKey !== null}
                onClick={() => void handleDeleteConversation()}
              >
                {conversationSettingPendingKey !== null ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Forward Picker Modal */}
      {forwardingMessage ? (
        <div
          className="forward-picker-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Forward message"
          onClick={(e) => { if (e.target === e.currentTarget) setForwardingMessage(null); }}
        >
          <div className="forward-picker-modal">
            <div className="forward-picker-header">
              <span className="forward-picker-title">Forward to…</span>
              <button
                type="button"
                className="forward-picker-close"
                onClick={() => setForwardingMessage(null)}
                aria-label="Close"
              >×</button>
            </div>
            <ForwardPickerBody
              friends={friends}
              rooms={rooms}
              onSelect={sendForwardMessage}
            />
          </div>
        </div>
      ) : null}

      {/* Invite Link Modal */}
      {addMembersModalOpen && selectedRoom ? (
        <AddMembersModal
          roomName={selectedRoom.name}
          candidates={addMemberCandidates}
          selectedMemberIds={selectedAddMemberIds}
          saving={groupSettingsSaving}
          error={groupSettingsError}
          onClose={() => {
            setSelectedAddMemberIds([]);
            setAddMembersModalOpen(false);
          }}
          onToggleMember={handleToggleAddRoomMember}
          onAddMembers={handleAddRoomMembers}
        />
      ) : null}

      {inviteModalOpen && selectedRoom ? (
        <div
          className="modal-backdrop invite-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInviteModalOpen(false);
          }}
        >
          <div className="group-modal invite-modal">
            <div className="group-modal-header">
              <div>
                <h3 id="invite-modal-title">Group Invite Link</h3>
                <span>Anyone with this link can join {selectedRoom.name}</span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setInviteModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="invite-modal-body">
              {inviteLoading ? (
                <div className="invite-modal-loading">Loading invite link...</div>
              ) : (
                <>
                  <div className="invite-link-box">
                    <input
                      type="text"
                      readOnly
                      value={getGroupInviteUrl()}
                      className="invite-link-input"
                    />
                    <button
                      type="button"
                      className={`invite-copy-btn ${inviteCopied ? 'copied' : ''}`}
                      onClick={() => void handleCopyInviteLink()}
                    >
                      {inviteCopied ? '✓ Copied' : 'Copy link'}
                    </button>
                  </div>

                  {inviteError ? <div className="invite-error-msg">{inviteError}</div> : null}

                  {currentUserCanManageSelectedRoom ? (
                    <div className="invite-admin-actions">
                      <p>You can revoke the old link and generate a new invite code if needed:</p>
                      <button
                        type="button"
                        className="invite-revoke-btn"
                        disabled={inviteRevoking}
                        onClick={() => void handleRevokeInviteLink()}
                      >
                        {inviteRevoking ? 'Generating...' : '🔄 Revoke & Generate new link'}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="group-modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setInviteModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lightboxState ? (
        <Suspense fallback={null}>
          <MediaLightbox
            items={lightboxState.items}
            currentIndex={lightboxState.index}
            onClose={() => setLightboxState(null)}
            onSelectIndex={(idx) => setLightboxState((prev) => (prev ? { ...prev, index: idx } : null))}
          />
        </Suspense>
      ) : null}

      {groupSeenModalMessage ? (
        <Suspense fallback={null}>
          <GroupSeenByModal
            message={groupSeenModalMessage.message}
            seenUsers={groupSeenModalMessage.seenUsers}
            onClose={() => setGroupSeenModalMessage(null)}
          />
        </Suspense>
      ) : null}

      {reactionModalGroups ? (
        <Suspense fallback={null}>
          <ReactionSummaryModal
            reactionGroups={reactionModalGroups}
            onClose={() => setReactionModalGroups(null)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
