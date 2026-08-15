import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL, CALL_RINGING_TIMEOUT_MS, ROUTES, RTC_ICE_SERVERS } from '../config/constants';
import type {
  CallSignalEvent,
  CallSignalPayload,
  CallType,
  ChatRoom,
  CloudinaryUploadSignature,
  ConnectionStatus,
  ConversationSetting,
  Friendship,
  FriendshipSummary,
  GroupInviteResponse,
  GroupMemberRole,
  LinkPreview,
  MediaAttachment,
  Message,
  MessagePage,
  MessageReply,
  MessageSeenByResponse,
  MessageType,
  PresenceEvent,
  ReadReceiptEvent,
  RoomReadReceiptEvent,
  TypingEvent,
  UnreadCount,
  User,
} from '../types';
import { apiClient, clearAuthSession } from '../services/api';
import { wsService } from '../services/websocket';
import { soundService } from '../services/soundService';
import { useTheme } from '../hooks/useTheme';
import './ChatPage.css';

const PRIVATE_MESSAGE_DESTINATION = '/app/chat.send';
const GROUP_MESSAGE_DESTINATION_PREFIX = '/app/rooms';
const TYPING_DESTINATION = '/app/chat.typing';
const READ_RECEIPT_DESTINATION = '/app/chat.read';
const CALL_SIGNAL_DESTINATION = '/app/calls.signal';
const STOP_TYPING_DELAY_MS = 1500;
const USER_SEARCH_DEBOUNCE_MS = 300;
const REMOTE_TYPING_VISIBLE_MS = 2500;
const OPTIMISTIC_SEND_TIMEOUT_MS = 10000;
const MESSAGE_GROUP_THRESHOLD_MS = 5 * 60 * 1000;
const MESSAGE_PAGE_SIZE = 30;
const SHARED_CONTENT_PAGE_SIZE = 12;
const MESSAGE_SEARCH_PAGE_SIZE = 12;
const MESSAGE_AROUND_PAGE_SIZE = 30;
const MESSAGE_JUMP_HIGHLIGHT_MS = 2200;
const LOAD_OLDER_SCROLL_THRESHOLD = 80;
const READ_BOTTOM_THRESHOLD = 96;
const AUTO_SCROLL_BOTTOM_THRESHOLD = 180;
const BROWSER_NOTIFICATION_CLOSE_MS = 9000;
const CALL_RECONNECT_TIMEOUT_MS = 10000;
const MIN_GROUP_MEMBERS = 3;
const MIN_GROUP_INVITED_MEMBERS = MIN_GROUP_MEMBERS - 1;
const BIO_MAX_LENGTH = 160;
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_AVATAR_SIZE_MB = MAX_AVATAR_SIZE_BYTES / 1024 / 1024;
const MAX_IMAGE_MEDIA_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_MEDIA_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_MEDIA_SIZE_MB = MAX_IMAGE_MEDIA_SIZE_BYTES / 1024 / 1024;
const MAX_VIDEO_MEDIA_SIZE_MB = MAX_VIDEO_MEDIA_SIZE_BYTES / 1024 / 1024;
const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AVATAR_ACCEPT = ACCEPTED_AVATAR_TYPES.join(',');
const MEDIA_ACCEPT = 'image/*,video/*';
const TEXT_URL_REGEX = /(https?:\/\/[^\s<>'"`]+)/gi;
const USER_SKELETON_KEYS = ['user-skeleton-1', 'user-skeleton-2', 'user-skeleton-3'];
const MESSAGE_SKELETON_KEYS = [
  'message-skeleton-1',
  'message-skeleton-2',
  'message-skeleton-3',
  'message-skeleton-4',
];
const CONVERSATION_FILTERS: Array<{ value: ConversationFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'archived', label: 'Archived' },
];
const QUICK_REACTION_EMOJIS = ['👍', '💜', '😂', '😮', '😢', '🔥'] as const;
const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    emojis: [
      { symbol: '😀', label: 'grinning face' },
      { symbol: '😄', label: 'smiling face' },
      { symbol: '😁', label: 'beaming face' },
      { symbol: '😂', label: 'face with tears of joy' },
      { symbol: '🤣', label: 'rolling on the floor laughing' },
      { symbol: '😊', label: 'smiling face with smiling eyes' },
      { symbol: '😍', label: 'smiling face with heart eyes' },
      { symbol: '😘', label: 'face blowing a kiss' },
      { symbol: '😎', label: 'smiling face with sunglasses' },
      { symbol: '🥹', label: 'holding back tears' },
      { symbol: '😭', label: 'loudly crying face' },
      { symbol: '😡', label: 'angry face' },
    ],
  },
  {
    name: 'Gestures',
    emojis: [
      { symbol: '👍', label: 'thumbs up' },
      { symbol: '👎', label: 'thumbs down' },
      { symbol: '👏', label: 'clapping hands' },
      { symbol: '🙌', label: 'raising hands' },
      { symbol: '🙏', label: 'folded hands' },
      { symbol: '🤝', label: 'handshake' },
      { symbol: '💪', label: 'flexed biceps' },
      { symbol: '👌', label: 'ok hand' },
      { symbol: '✌️', label: 'victory hand' },
      { symbol: '🤞', label: 'crossed fingers' },
      { symbol: '👋', label: 'waving hand' },
      { symbol: '🫶', label: 'heart hands' },
    ],
  },
  {
    name: 'Hearts',
    emojis: [
      { symbol: '❤️', label: 'red heart' },
      { symbol: '💜', label: 'purple heart' },
      { symbol: '💙', label: 'blue heart' },
      { symbol: '💚', label: 'green heart' },
      { symbol: '💛', label: 'yellow heart' },
      { symbol: '🧡', label: 'orange heart' },
      { symbol: '🤍', label: 'white heart' },
      { symbol: '💔', label: 'broken heart' },
      { symbol: '💕', label: 'two hearts' },
      { symbol: '💞', label: 'revolving hearts' },
      { symbol: '💘', label: 'heart with arrow' },
      { symbol: '💝', label: 'heart with ribbon' },
    ],
  },
  {
    name: 'Objects',
    emojis: [
      { symbol: '🔥', label: 'fire' },
      { symbol: '✨', label: 'sparkles' },
      { symbol: '🎉', label: 'party popper' },
      { symbol: '🎂', label: 'birthday cake' },
      { symbol: '🌟', label: 'glowing star' },
      { symbol: '💯', label: 'hundred points' },
      { symbol: '✅', label: 'check mark' },
      { symbol: '☕', label: 'hot beverage' },
      { symbol: '🍕', label: 'pizza' },
      { symbol: '🎧', label: 'headphones' },
      { symbol: '📚', label: 'books' },
      { symbol: '💻', label: 'laptop' },
    ],
  },
] as const;

type DeliveryStatus = 'sending' | 'sent' | 'failed';

type ChatMessage = Message & {
  deliveryStatus?: DeliveryStatus;
};

type ActiveCall = {
  callId?: number;
  type: CallType;
  status: 'ringing' | 'connecting' | 'connected' | 'ending';
  direction: 'incoming' | 'outgoing';
  peer: User;
};

type CallConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';
type CallPermissionStatus = PermissionState | 'unsupported' | 'unknown';
type CallPermissionSnapshot = {
  microphone: CallPermissionStatus;
  camera: CallPermissionStatus;
};
type PreCallSetup = {
  type: CallType;
  target: User;
} | null;

const UNKNOWN_CALL_PERMISSIONS: CallPermissionSnapshot = {
  microphone: 'unknown',
  camera: 'unknown',
};

function canSendWebRtcSignalForCall(call: ActiveCall | null, callId?: number) {
  return Boolean(
    call?.callId &&
    call.callId === callId &&
    (call.status === 'connecting' || call.status === 'connected')
  );
}

type SendMessagePayload = {
  receiverId: number;
  content: string;
  clientId: string;
  replyToMessageId?: number;
  type?: MessageType;
  media?: MediaAttachment;
};

type SendRoomMessagePayload = {
  content: string;
  clientId: string;
  replyToMessageId?: number;
  type?: MessageType;
  media?: MediaAttachment;
};

type PendingMedia = {
  file: File;
  previewUrl: string;
  type: Extract<MessageType, 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE'>;
  resourceType: 'image' | 'video' | 'raw';
  mediaDuration?: number;
};

type CloudinaryUploadResult = {
  secure_url: string;
  public_id: string;
  resource_type: 'image' | 'video' | 'raw';
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  duration?: number;
};

type LocalMediaUploadResult = {
  url: string;
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
  format?: string;
  bytes?: number;
};

type LoadOptions = {
  silent?: boolean;
  search?: string;
};

type MainView = 'chat' | 'friends' | 'requests';
type ConversationFilter = 'all' | 'unread' | 'archived';
type SharedContentKind = 'media' | 'links';
type SharedContentLoadOptions = {
  reset?: boolean;
};
type SharedContentPredicate = (message: Message) => boolean;
type MessageSearchLoadOptions = {
  reset?: boolean;
  query?: string;
};

type ChatRouteState =
  | { kind: 'chat' }
  | { kind: 'friends' }
  | { kind: 'requests' }
  | { kind: 'user'; username: string }
  | { kind: 'room'; roomId: number }
  | { kind: 'unknown' };

type HeaderIconProps = {
  className?: string;
};

type MessageDateDividerItem = {
  type: 'date';
  key: string;
  label: string;
};

type MessageUnreadDividerItem = {
  type: 'unread';
  key: string;
};

type MessageBubbleItem = {
  type: 'message';
  key: string;
  message: ChatMessage;
  groupedWithPrevious: boolean;
  groupedWithNext: boolean;
  showSender: boolean;
};

type MessageListItem = MessageDateDividerItem | MessageUnreadDividerItem | MessageBubbleItem;
type SidebarConversationItem =
  | { type: 'user'; user: User }
  | { type: 'room'; room: ChatRoom };
type ConversationTarget =
  | { type: 'user'; user: User }
  | { type: 'room'; room: ChatRoom };
type PendingReadConversation =
  | { type: 'user'; id: number; unreadCount: number }
  | { type: 'room'; id: number; unreadCount: number }
  | null;
type ChatBrowserNotification = {
  title: string;
  body: string;
  path?: string;
  user?: User | null;
  browserTag: string;
  isMention?: boolean;
};

function SoundIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function MuteIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

function SunIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function FriendsIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function FriendRequestIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </svg>
  );
}

function RefreshIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12a9 9 0 0 1-15.5 6.25" />
      <path d="M3 12A9 9 0 0 1 18.5 5.75" />
      <path d="M18 3v4h4" />
      <path d="M6 21v-4H2" />
    </svg>
  );
}

function GroupPlusIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M23 11h-6" />
    </svg>
  );
}

function ProfileIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 18a5.5 5.5 0 0 1 10 0" />
    </svg>
  );
}

function BellIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function InfoIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function MinimizeIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h14" />
    </svg>
  );
}

function ExpandIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 3H3v5" />
      <path d="M21 8V3h-5" />
      <path d="M3 16v5h5" />
      <path d="M16 21h5v-5" />
    </svg>
  );
}

function PhoneIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.66 2.8a2 2 0 0 1-.45 2.11L8.09 9.86a16 16 0 0 0 6.05 6.05l1.23-1.23a2 2 0 0 1 2.11-.45c.9.31 1.84.53 2.8.66A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function VideoCallIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 10 20 7v10l-5-3" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function ScreenShareIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M12 13V8" />
      <path d="m9 10 3-3 3 3" />
    </svg>
  );
}

function MicIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </svg>
  );
}

function MicOffIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m2 2 20 20" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <path d="M15 9.34V5a3 3 0 0 0-5.63-1.44" />
      <path d="M19 10v2a7 7 0 0 1-.74 3.13" />
      <path d="M5 10v2a7 7 0 0 0 11.67 5.22" />
      <path d="M12 19v3" />
    </svg>
  );
}

function VideoOffIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m2 2 20 20" />
      <path d="M15 10 20 7v8.5" />
      <path d="M11.65 6H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 1.73-1" />
    </svg>
  );
}

// ─── Voice Recorder Button ────────────────────────────────────────────────────

const MAX_VOICE_DURATION_MS = 120_000; // 2 minutes

interface VoiceRecorderButtonProps {
  disabled?: boolean;
  onRecorded: (blob: Blob, durationSeconds: number) => void;
}

function VoiceRecorderButton({ disabled, onRecorded }: VoiceRecorderButtonProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRecording = useCallback((cancelled = false) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    timerRef.current = null;
    autoStopRef.current = null;

    const mr = mediaRecorderRef.current;

    // If already inactive, stream tracks may still be alive – release them
    if (!mr || mr.state === 'inactive') {
      mr?.stream?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
      setRecording(false);
      setElapsed(0);
      return;
    }

    // Capture the stream reference BEFORE stop() clears internal state
    const stream = mr.stream;

    mr.onstop = () => {
      // Release mic INSIDE onstop – this is when MediaRecorder has fully stopped
      // and it's safe to stop the underlying stream tracks
      stream.getTracks().forEach((t) => t.stop());

      if (!cancelled && chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const dur = Math.round((Date.now() - startTimeRef.current) / 1000);
        onRecorded(blob, dur);
      }
      chunksRef.current = [];
      mediaRecorderRef.current = null;
    };

    mr.stop();
    setRecording(false);
    setElapsed(0);
  }, [onRecorded]);

  const startRecording = useCallback(async () => {
    if (disabled || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start(200);
      setRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);

      autoStopRef.current = setTimeout(() => stopRecording(false), MAX_VOICE_DURATION_MS);
    } catch {
      // Microphone not available or denied
    }
  }, [disabled, recording, stopRecording]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      const mr = mediaRecorderRef.current;
      if (mr) {
        try {
          if (mr.state !== 'inactive') mr.stop();
        } catch {
          // ignore
        }
        mr.stream?.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  if (recording) {
    return (
      <div className="voice-recorder-active">
        <span className="voice-recorder-dot" aria-hidden="true" />
        <span className="voice-recorder-timer">{mins}:{secs}</span>
        <button
          type="button"
          className="voice-recorder-cancel"
          onClick={() => stopRecording(true)}
          aria-label="Cancel recording"
          title="Cancel"
        >
          ✕
        </button>
        <button
          type="button"
          className="voice-recorder-send"
          onClick={() => stopRecording(false)}
          aria-label="Send voice message"
          title="Send"
        >
          ▶
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="composer-icon-btn voice-record-btn"
      onClick={startRecording}
      disabled={disabled}
      aria-label="Record voice message"
      title="Voice message"
    >
      <MicIcon className="composer-icon" />
    </button>
  );
}

// ─── Voice Message Player ─────────────────────────────────────────────────────

interface VoiceMessagePlayerProps {
  src: string;
  durationSeconds?: number | null;
}

function VoiceMessagePlayer({ src, durationSeconds }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      void audio.play();
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (audio && audio.duration && Number.isFinite(audio.duration)) {
      setDuration(audio.duration);
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const pct = Number(e.target.value);
    audio.currentTime = (pct / 100) * audio.duration;
    setProgress(pct);
  };

  return (
    <div className="voice-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
      />
      <button
        type="button"
        className="voice-player-btn"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <div className="voice-player-track">
        <input
          type="range"
          className="voice-player-scrub"
          min={0}
          max={100}
          step={0.1}
          value={progress}
          onChange={handleScrub}
          aria-label="Seek"
        />
      </div>
      <span className="voice-player-time">{formatTime(duration)}</span>
    </div>
  );
}

function SearchIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function JumpIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
      <path d="M5 5v14h14" />
    </svg>
  );
}

function CloseIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function EmojiIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </svg>
  );
}

function MediaIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="18" height="18" x="3" y="3" rx="3" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L7 19" />
      <path d="M16 5v4" />
      <path d="M18 7h-4" />
    </svg>
  );
}

function DocumentIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function DownloadIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function PaperclipIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function ReplyIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m9 17-5-5 5-5" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function CopyIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function ForwardIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="15 10 20 5 15 0" transform="translate(0,2)" />
      <path d="M4 20v-7a7 7 0 0 1 7-7h9" />
    </svg>
  );
}

function RecallIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function MoreIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function PinIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 17v5" />
      <path d="M9 3h6l1 7 3 3v2H5v-2l3-3 1-7Z" />
    </svg>
  );
}

function MutedIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="m17 9 4 4" />
      <path d="m21 9-4 4" />
    </svg>
  );
}

function ArchiveIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function ChevronDownIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function toDeliveredMessage(message: Message): ChatMessage {
  return {
    ...message,
    deliveryStatus: 'sent',
  };
}

function getMessageTimestampValue(message: ChatMessage) {
  const timestampValue = Date.parse(message.timestamp);
  return Number.isNaN(timestampValue) ? 0 : timestampValue;
}

function sortMessagesByTimeline(messages: ChatMessage[]) {
  return [...messages].sort((firstMessage, secondMessage) => {
    const timestampDelta =
      getMessageTimestampValue(firstMessage) - getMessageTimestampValue(secondMessage);

    if (timestampDelta !== 0) {
      return timestampDelta;
    }

    return firstMessage.id - secondMessage.id;
  });
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

function mergeKnownMessageUpdate(messages: ChatMessage[], incomingMessage: Message) {
  const deliveredMessage = toDeliveredMessage(incomingMessage);
  const existingMessageIndex = messages.findIndex((message) => message.id === incomingMessage.id);

  if (existingMessageIndex < 0) {
    return messages;
  }

  return messages.map((message, index) =>
    index === existingMessageIndex ? { ...message, ...deliveredMessage } : message
  );
}

function appendOptimisticMessage(messages: ChatMessage[], optimisticMessage: ChatMessage) {
  const alreadyExists = messages.some((message) => message.clientId === optimisticMessage.clientId);
  return alreadyExists ? messages : [...messages, optimisticMessage];
}

function appendOrUpdateRoom(rooms: ChatRoom[], incomingRoom: ChatRoom) {
  const existingRoom = rooms.some((room) => room.id === incomingRoom.id);
  const nextRooms = existingRoom
    ? rooms.map((room) => (room.id === incomingRoom.id ? incomingRoom : room))
    : [incomingRoom, ...rooms];

  return sortRoomsByChatActivity(nextRooms);
}

function isRoomParticipant(room: ChatRoom, userId: number | null) {
  return userId !== null && room.participants.some((participant) => participant.id === userId);
}

function mergeServerMessagesWithPending(
  currentMessages: ChatMessage[],
  serverMessages: Message[]
) {
  const mergedMessages = [...currentMessages];

  serverMessages.map(toDeliveredMessage).forEach((deliveredMessage) => {
    const existingMessageIndex = mergedMessages.findIndex(
      (message) => message.id === deliveredMessage.id
    );

    if (existingMessageIndex >= 0) {
      mergedMessages[existingMessageIndex] = {
        ...mergedMessages[existingMessageIndex],
        ...deliveredMessage,
      };
      return;
    }

    if (deliveredMessage.clientId) {
      const optimisticMessageIndex = mergedMessages.findIndex(
        (message) => message.clientId === deliveredMessage.clientId
      );

      if (optimisticMessageIndex >= 0) {
        mergedMessages[optimisticMessageIndex] = deliveredMessage;
        return;
      }
    }

    mergedMessages.push(deliveredMessage);
  });

  return sortMessagesByTimeline(mergedMessages);
}

function isConversationMessage(
  message: Message,
  currentUserId: number | null,
  selectedUserId: number | null
) {
  if (selectedUserId === null) {
    return false;
  }

  return getPrivateConversationUserId(message, currentUserId) === selectedUserId;
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
  if (user.id !== presence.userId) {
    return user;
  }

  const nextLastSeenAt = presence.lastSeenAt ?? user.lastSeenAt;
  if (user.online === presence.online && user.lastSeenAt === nextLastSeenAt) {
    return user;
  }

  return {
    ...user,
    online: presence.online,
    lastSeenAt: nextLastSeenAt,
  };
}

function applyProfileToUser(user: User, updatedUser: User) {
  if (user.id !== updatedUser.id) {
    return user;
  }

  return {
    ...user,
    ...updatedUser,
    unreadCount: user.unreadCount ?? updatedUser.unreadCount,
    friendshipStatus: user.friendshipStatus ?? updatedUser.friendshipStatus,
    friendshipId: user.friendshipId ?? updatedUser.friendshipId,
    lastMessageContent: user.lastMessageContent ?? updatedUser.lastMessageContent,
    lastMessageAt: user.lastMessageAt ?? updatedUser.lastMessageAt,
    lastMessageSenderId: user.lastMessageSenderId ?? updatedUser.lastMessageSenderId,
    pinned: user.pinned ?? updatedUser.pinned,
    muted: user.muted ?? updatedUser.muted,
    archived: user.archived ?? updatedUser.archived,
  };
}

function applyProfileToRoom(room: ChatRoom, updatedUser: User) {
  return {
    ...room,
    participants: room.participants.map((participant) => applyProfileToUser(participant, updatedUser)),
  };
}

function applyConversationSettingToUser(user: User, setting: ConversationSetting) {
  if (setting.targetUserId !== user.id) {
    return user;
  }

  return {
    ...user,
    pinned: setting.pinned,
    muted: setting.muted,
    archived: setting.archived,
  };
}

function applyConversationSettingToRoom(room: ChatRoom, setting: ConversationSetting) {
  if (setting.chatRoomId !== room.id) {
    return room;
  }

  return {
    ...room,
    pinned: setting.pinned,
    muted: setting.muted,
    archived: setting.archived,
  };
}

function getProfileUserFromFriendship(friendship: Friendship, currentUserId: number | null) {
  if (friendship.requester.id === currentUserId) {
    return friendship.receiver;
  }

  return friendship.requester;
}

function getUserFriendshipStatusFromFriendship(
  friendship: Friendship,
  currentUserId: number | null
): User['friendshipStatus'] {
  if (friendship.status === 'accepted') {
    return 'accepted';
  }

  if (friendship.status === 'declined') {
    return 'declined';
  }

  return friendship.receiver.id === currentUserId ? 'pending_incoming' : 'pending_outgoing';
}

function applyFriendshipToProfileUser(
  user: User,
  friendship: Friendship,
  currentUserId: number | null
) {
  const profileUser = getProfileUserFromFriendship(friendship, currentUserId);
  if (user.id !== profileUser.id) {
    return user;
  }

  return {
    ...applyProfileToUser(user, profileUser),
    friendshipId: friendship.id,
    friendshipStatus: getUserFriendshipStatusFromFriendship(friendship, currentUserId),
  };
}

function mergeViewedProfileUser(viewedUser: User, refreshedUser?: User) {
  if (!refreshedUser) {
    return viewedUser;
  }

  return {
    ...viewedUser,
    ...refreshedUser,
    friendshipId: viewedUser.friendshipId ?? refreshedUser.friendshipId,
    friendshipStatus: viewedUser.friendshipStatus ?? refreshedUser.friendshipStatus,
  };
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

function resetRoomUnreadCount(rooms: ChatRoom[], roomId: number) {
  return rooms.map((room) => (room.id === roomId ? { ...room, unreadCount: 0 } : room));
}

function applyReadReceipt(messages: ChatMessage[], receipt: ReadReceiptEvent) {
  return messages.map((message) =>
    message.id > 0 && message.senderId === receipt.senderId && message.receiverId === receipt.readerId
      ? { ...message, read: true, deliveryStatus: 'sent' as const }
      : message
  );
}

function appendSeenByUser(users: User[], nextUser: User) {
  if (users.some((user) => user.id === nextUser.id)) {
    return users;
  }

  return [...users, nextUser];
}

function isMessagesContainerNearBottom(container: HTMLElement | null, threshold = READ_BOTTOM_THRESHOLD) {
  if (!container) {
    return false;
  }

  return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
}

function getMessagesContainerBottomScrollTop(container: HTMLElement) {
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

function isUnreadMessageForCurrentUser(message: ChatMessage, currentUserId: number | null) {
  return currentUserId !== null && message.id > 0 && message.senderId !== currentUserId;
}

function getUnreadDividerCandidateId(
  messages: ChatMessage[],
  unreadCount: number,
  currentUserId: number | null
) {
  if (unreadCount <= 0) {
    return null;
  }

  const incomingMessages = messages.filter((message) =>
    isUnreadMessageForCurrentUser(message, currentUserId)
  );
  if (incomingMessages.length === 0) {
    return messages.find((message) => message.id > 0)?.id ?? null;
  }

  const unreadStartIndex = Math.max(incomingMessages.length - unreadCount, 0);
  return incomingMessages[unreadStartIndex]?.id ?? incomingMessages[0]?.id ?? null;
}

function createClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getChatRoute() {
  return ROUTES.CHAT;
}

function getFriendsRoute() {
  return `${ROUTES.CHAT}/friends`;
}

function getRequestsRoute() {
  return `${ROUTES.CHAT}/requests`;
}

function getUserChatRoute(username: string) {
  return `${ROUTES.CHAT}/u/${encodeURIComponent(username)}`;
}

function getRoomChatRoute(roomId: number) {
  return `${ROUTES.CHAT}/g/${roomId}`;
}

function safeDecodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return '';
  }
}

function parseChatRoute(pathname: string): ChatRouteState {
  const chatBase = ROUTES.CHAT.replace(/\/$/, '');
  const normalizedPath = pathname.replace(/\/+$/, '') || chatBase;
  if (normalizedPath === chatBase) {
    return { kind: 'chat' };
  }

  if (!normalizedPath.startsWith(`${chatBase}/`)) {
    return { kind: 'unknown' };
  }

  const segments = normalizedPath
    .slice(chatBase.length + 1)
    .split('/')
    .filter(Boolean)
    .map(safeDecodePathSegment);

  if (segments.length === 1 && segments[0] === 'friends') {
    return { kind: 'friends' };
  }

  if (segments.length === 1 && segments[0] === 'requests') {
    return { kind: 'requests' };
  }

  if (segments.length === 2 && segments[0] === 'u' && segments[1]) {
    return { kind: 'user', username: segments[1] };
  }

  if (segments.length === 2 && segments[0] === 'g') {
    const roomId = Number(segments[1]);
    return Number.isInteger(roomId) && roomId > 0 ? { kind: 'room', roomId } : { kind: 'unknown' };
  }

  return { kind: 'unknown' };
}

function getMessageType(message: Message): MessageType {
  return message.type ?? 'TEXT';
}

function isMediaMessage(message: Message) {
  const type = getMessageType(message);
  return type === 'IMAGE' || type === 'VIDEO' || type === 'AUDIO' || type === 'FILE';
}

function isCallMessage(message: Message) {
  return getMessageType(message) === 'CALL';
}

function getMessagePreviewContent(message: Message) {
  if (message.recalled) {
    return 'Message recalled';
  }

  const content = message.content?.trim();
  if (content) {
    return content;
  }

  if (getMessageType(message) === 'IMAGE') {
    return 'Photo';
  }

  if (getMessageType(message) === 'VIDEO') {
    return 'Video';
  }

  if (getMessageType(message) === 'AUDIO') {
    return '🎙 Voice message';
  }

  if (getMessageType(message) === 'FILE') {
    return '📁 File attachment';
  }

  if (isCallMessage(message)) {
    return 'Call';
  }

  return '';
}

function getMessageSearchPreview(message: Message) {
  const content = getMessagePreviewContent(message);
  if (content) {
    return content;
  }

  const previewTitle = message.linkPreview?.title?.trim();
  if (previewTitle) {
    return previewTitle;
  }

  return 'Message';
}

function getSearchableMessageValues(message: Message) {
  return [
    message.content,
    message.linkPreview?.title,
    message.linkPreview?.description,
    message.linkPreview?.domain,
  ].filter((value): value is string => Boolean(value?.trim()));
}

function getMessageSearchSnippet(message: Message, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const source =
    getSearchableMessageValues(message).find((value) =>
      value.toLowerCase().includes(normalizedQuery)
    ) ?? getMessageSearchPreview(message);
  const normalizedSource = source.replace(/\s+/g, ' ').trim() || 'Message';
  if (!normalizedQuery) {
    return normalizedSource;
  }

  const matchIndex = normalizedSource.toLowerCase().indexOf(normalizedQuery);
  if (matchIndex < 0) {
    return normalizedSource;
  }

  const contextBefore = 36;
  const contextAfter = 84;
  const startIndex = Math.max(0, matchIndex - contextBefore);
  const endIndex = Math.min(
    normalizedSource.length,
    matchIndex + normalizedQuery.length + contextAfter
  );

  return `${startIndex > 0 ? '...' : ''}${normalizedSource.slice(startIndex, endIndex)}${endIndex < normalizedSource.length ? '...' : ''
    }`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedSearchText(text: string, query: string) {
  const normalizedQuery = query.trim();
  if (!text || !normalizedQuery) {
    return text;
  }

  const matcher = new RegExp(escapeRegExp(normalizedQuery), 'gi');
  const nodes = [];
  let lastIndex = 0;

  for (const match of text.matchAll(matcher)) {
    const matchText = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    nodes.push(
      <mark key={`message-search-highlight-${matchIndex}-${nodes.length}`}>
        {matchText}
      </mark>
    );

    lastIndex = matchIndex + matchText.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : text;
}

function messageMatchesSearchQuery(message: Message, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || message.recalled) {
    return false;
  }

  return getSearchableMessageValues(message).some((value) =>
    value.toLowerCase().includes(normalizedQuery)
  );
}

function applyMediaPayload(message: ChatMessage, media?: MediaAttachment): ChatMessage {
  if (!media) {
    return message;
  }

  return {
    ...message,
    mediaUrl: media.url,
    mediaPublicId: media.publicId,
    mediaResourceType: media.resourceType,
    mediaFormat: media.format,
    mediaBytes: media.bytes,
    mediaWidth: media.width,
    mediaHeight: media.height,
    mediaDuration: media.duration,
  };
}

function getMediaPayloadFromMessage(message: Message): MediaAttachment | undefined {
  if (!isMediaMessage(message) || !message.mediaUrl || !message.mediaPublicId || !message.mediaResourceType) {
    return undefined;
  }

  return {
    url: message.mediaUrl,
    publicId: message.mediaPublicId,
    resourceType: message.mediaResourceType,
    format: message.mediaFormat,
    bytes: message.mediaBytes,
    width: message.mediaWidth,
    height: message.mediaHeight,
    duration: message.mediaDuration,
  };
}

function createReplyFromMessage(message: ChatMessage | null): MessageReply | null {
  if (!message || message.id <= 0) {
    return null;
  }

  return {
    id: message.id,
    content: getMessagePreviewContent(message) || 'Message',
    type: getMessageType(message),
    senderId: message.senderId,
    senderName: message.senderFullName?.trim() || message.senderUsername || 'Unknown',
    recalled: Boolean(message.recalled),
  };
}

function getPendingMediaType(file: File): Pick<PendingMedia, 'type' | 'resourceType'> {
  if (file.type.startsWith('image/')) {
    return { type: 'IMAGE', resourceType: 'image' };
  }

  if (file.type.startsWith('video/')) {
    return { type: 'VIDEO', resourceType: 'video' };
  }

  if (file.type.startsWith('audio/')) {
    // Cloudinary stores audio under resource_type "video"
    return { type: 'AUDIO', resourceType: 'video' };
  }

  return { type: 'FILE', resourceType: 'raw' };
}

function getMediaSizeError(file: File, pendingMediaType: Pick<PendingMedia, 'type'>) {
  if (pendingMediaType.type === 'IMAGE' && file.size > MAX_IMAGE_MEDIA_SIZE_BYTES) {
    return `Image must be ${MAX_IMAGE_MEDIA_SIZE_MB}MB or smaller.`;
  }

  if (pendingMediaType.type === 'VIDEO' && file.size > MAX_VIDEO_MEDIA_SIZE_BYTES) {
    return `Video must be ${MAX_VIDEO_MEDIA_SIZE_MB}MB or smaller.`;
  }

  if (pendingMediaType.type === 'AUDIO' && file.size > 20 * 1024 * 1024) {
    return 'Voice message must be 20MB or smaller.';
  }

  if (pendingMediaType.type === 'FILE' && file.size > 50 * 1024 * 1024) {
    return 'File must be 50MB or smaller.';
  }

  return '';
}

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(filenameOrFormat?: string | null) {
  if (!filenameOrFormat) return 'FILE';
  const clean = filenameOrFormat.split('?')[0].split('#')[0];
  const parts = clean.split('.');
  if (parts.length > 1) {
    const ext = parts[parts.length - 1];
    return ext.toUpperCase().slice(0, 5);
  }
  return clean.toUpperCase().slice(0, 5);
}

function getFileBadgeColor(formatOrExt?: string | null) {
  const ext = (formatOrExt || '').toLowerCase();
  if (['pdf'].includes(ext)) return 'file-badge-pdf';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'file-badge-word';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'file-badge-excel';
  if (['ppt', 'pptx'].includes(ext)) return 'file-badge-ppt';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'file-badge-archive';
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'html', 'css', 'json', 'xml', 'sql', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs'].includes(ext)) return 'file-badge-code';
  if (['txt', 'md', 'log'].includes(ext)) return 'file-badge-text';
  return 'file-badge-generic';
}

function getDownloadFilename(message: ChatMessage): string {
  if (message.content && message.content.trim()) {
    return message.content.trim();
  }
  const ext = getFileExtension(message.mediaFormat || message.mediaUrl);
  return `attachment.${ext.toLowerCase()}`;
}

function getFileFormat(file: File) {
  const extension = file.name.split('.').pop();
  return extension ? extension.toLowerCase() : undefined;
}

function cloudinaryResultToMedia(result: CloudinaryUploadResult): MediaAttachment {
  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format,
    bytes: result.bytes,
    width: result.width,
    height: result.height,
    duration: result.duration,
  };
}

function createOptimisticMessage(
  tempId: number,
  senderId: number,
  receiverId: number,
  content: string,
  clientId: string,
  type: MessageType = 'TEXT',
  media?: MediaAttachment,
  replyTo?: MessageReply | null
): ChatMessage {
  return applyMediaPayload({
    id: tempId,
    content,
    type,
    replyTo,
    senderId,
    receiverId,
    timestamp: new Date().toISOString(),
    read: false,
    clientId,
    deliveryStatus: 'sending',
  }, media);
}

function createOptimisticRoomMessage(
  tempId: number,
  sender: User,
  chatRoomId: number,
  content: string,
  clientId: string,
  type: MessageType = 'TEXT',
  media?: MediaAttachment,
  replyTo?: MessageReply | null
): ChatMessage {
  return applyMediaPayload({
    id: tempId,
    content,
    type,
    replyTo,
    senderId: sender.id,
    senderUsername: sender.username,
    senderFullName: getUserDisplayName(sender),
    receiverId: null,
    chatRoomId,
    timestamp: new Date().toISOString(),
    read: false,
    clientId,
    deliveryStatus: 'sending',
  }, media);
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

function getDeliveryStatusLabel(
  message: ChatMessage,
  selectedUser: User | null,
  isLatestSeen: boolean,
  isLatestOutgoing: boolean
) {
  if (message.deliveryStatus === 'sending') {
    return 'Sending';
  }

  if (message.deliveryStatus === 'failed') {
    return 'Failed';
  }

  if (message.read) {
    return isLatestSeen ? 'Seen' : '';
  }

  if (isLatestOutgoing) {
    if (!message.chatRoomId && selectedUser?.online) {
      return 'Delivered';
    }
    return 'Sent';
  }

  return '';
}

function getGroupedMessageReactions(message: ChatMessage, currentUserId: number | null) {
  const reactions = message.reactions ?? [];
  const groupedReactions = new Map<string, {
    emoji: string;
    count: number;
    reactedByCurrentUser: boolean;
    title: string;
  }>();

  reactions.forEach((reaction) => {
    const currentGroup = groupedReactions.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      reactedByCurrentUser: false,
      title: '',
    };
    const displayName = reaction.fullName?.trim() || reaction.username;

    currentGroup.count += 1;
    currentGroup.reactedByCurrentUser ||= reaction.userId === currentUserId;
    currentGroup.title = currentGroup.title ? `${currentGroup.title}, ${displayName}` : displayName;
    groupedReactions.set(reaction.emoji, currentGroup);
  });

  return Array.from(groupedReactions.values());
}

function hasCurrentUserReaction(message: ChatMessage, currentUserId: number | null, emoji?: string) {
  if (currentUserId === null) {
    return false;
  }

  return (message.reactions ?? []).some((reaction) =>
    reaction.userId === currentUserId && (!emoji || reaction.emoji === emoji)
  );
}

function canUseMessageActions(message: ChatMessage) {
  return message.id > 0 && message.deliveryStatus !== 'failed' && !message.recalled && !isCallMessage(message);
}

function getBrowserAwareConnectionStatus(status: ConnectionStatus): ConnectionStatus {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'offline';
  }

  return status;
}

function isBrowserNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function getCallMediaErrorMessage(error: unknown, callType: CallType) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return callType === 'VIDEO'
        ? 'Allow microphone and camera access, then retry the video call.'
        : 'Allow microphone access, then retry the audio call.';
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return callType === 'VIDEO'
        ? 'No microphone or camera was found for this video call.'
        : 'No microphone was found for this audio call.';
    }

    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return callType === 'VIDEO'
        ? 'Selected microphone or camera is already in use.'
        : 'Selected microphone is already in use.';
    }

    if (error.name === 'OverconstrainedError') {
      return callType === 'VIDEO'
        ? 'Selected microphone or camera is unavailable. Choose another device.'
        : 'Selected microphone is unavailable. Choose another device.';
    }
  }

  return callType === 'VIDEO'
    ? 'Unable to access microphone or camera.'
    : 'Unable to access microphone.';
}

async function queryCallPermission(name: 'microphone' | 'camera'): Promise<CallPermissionStatus> {
  if (!navigator.permissions?.query) {
    return 'unsupported';
  }

  try {
    const permission = await navigator.permissions.query({ name: name as PermissionName });
    return permission.state;
  } catch {
    return 'unsupported';
  }
}

function getCallPermissionLabel(status: CallPermissionStatus) {
  switch (status) {
    case 'granted':
      return 'Allowed';
    case 'prompt':
      return 'Ask';
    case 'denied':
      return 'Blocked';
    case 'unsupported':
      return 'Browser controlled';
    case 'unknown':
    default:
      return 'Checking';
  }
}

function getScreenShareErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Screen sharing was canceled or blocked.';
    }

    if (error.name === 'NotFoundError' || error.name === 'AbortError') {
      return 'No screen was selected.';
    }

    if (error.name === 'NotReadableError') {
      return 'Unable to capture the selected screen.';
    }
  }

  return 'Unable to share your screen.';
}

function buildCallMediaConstraints(
  callType: CallType,
  audioInputId: string,
  videoInputId: string
): MediaStreamConstraints {
  return {
    audio: audioInputId ? { deviceId: { exact: audioInputId } } : true,
    video: callType === 'VIDEO'
      ? videoInputId
        ? { deviceId: { exact: videoInputId } }
        : true
      : false,
  };
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function getBrowserNotificationPermission(): NotificationPermission {
  return isBrowserNotificationSupported() ? Notification.permission : 'denied';
}

function shouldShowBrowserNotification() {
  return typeof document === 'undefined' || document.hidden || !document.hasFocus();
}

function getBrowserNotificationStatusLabel(permission: NotificationPermission) {
  if (!isBrowserNotificationSupported()) {
    return 'Browser notifications unavailable';
  }

  if (permission === 'granted') {
    return 'Browser notifications enabled';
  }

  if (permission === 'denied') {
    return 'Browser notifications blocked';
  }

  return 'Enable browser notifications';
}

function getUserDisplayName(user: User | null) {
  return user?.nickname?.trim() || user?.fullName?.trim() || user?.username || '';
}

function getUserAccountDisplayName(user: User | null) {
  return user?.fullName?.trim() || user?.username || '';
}

function getUserInitial(user: User | null) {
  return getUserDisplayName(user).charAt(0).toUpperCase() || '?';
}

function getApiAssetUrl(assetUrl?: string | null) {
  const trimmedAssetUrl = assetUrl?.trim();
  if (!trimmedAssetUrl) {
    return '';
  }

  if (/^(https?:|blob:|data:)/i.test(trimmedAssetUrl)) {
    return trimmedAssetUrl;
  }

  const baseUrl = new URL(
    API_BASE_URL,
    typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  );
  const apiPath = baseUrl.pathname.replace(/\/$/, '');
  const assetPath = trimmedAssetUrl.startsWith('/') ? trimmedAssetUrl : `/${trimmedAssetUrl}`;
  const resolvedPath =
    apiPath && !assetPath.startsWith(`${apiPath}/`) ? `${apiPath}${assetPath}` : assetPath;

  return `${baseUrl.origin}${resolvedPath}`;
}

function getAvatarUrl(avatar?: string | null) {
  return getApiAssetUrl(avatar);
}

function getMediaUrl(mediaUrl?: string | null) {
  return getApiAssetUrl(mediaUrl);
}

function trimUrlToken(rawUrl: string) {
  let url = rawUrl;
  while (url && /[.,!?;:)\]}]/.test(url.charAt(url.length - 1))) {
    url = url.slice(0, -1);
  }

  return url;
}

const MENTION_TOKEN_REGEX = /@([a-zA-Z0-9_.-]+)/g;

function renderTextWithMentions(text: string): React.ReactNode {
  if (!text) {
    return null;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  MENTION_TOKEN_REGEX.lastIndex = 0;

  for (const match of text.matchAll(MENTION_TOKEN_REGEX)) {
    const rawMention = match[0];
    const mentionName = match[1] || '';
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }
    const isAll = mentionName.toLowerCase() === 'all';
    parts.push(
      <span
        key={`mention-${matchIndex}-${rawMention}`}
        className={`mention-tag ${isAll ? 'mention-tag-all' : ''}`}
      >
        {rawMention}
      </span>
    );
    lastIndex = matchIndex + rawMention.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function renderLinkedText(text: string) {
  if (!text) {
    return null;
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  TEXT_URL_REGEX.lastIndex = 0;

  for (const match of text.matchAll(TEXT_URL_REGEX)) {
    const rawUrl = match[0];
    const matchIndex = match.index ?? 0;
    const url = trimUrlToken(rawUrl);
    if (!url) {
      continue;
    }

    if (matchIndex > lastIndex) {
      nodes.push(renderTextWithMentions(text.slice(lastIndex, matchIndex)));
    }

    nodes.push(
      <a
        key={`link-${matchIndex}-${url}`}
        className="message-text-link"
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        {url}
      </a>
    );

    const trailingText = rawUrl.slice(url.length);
    if (trailingText) {
      nodes.push(renderTextWithMentions(trailingText));
    }

    lastIndex = matchIndex + rawUrl.length;
  }

  if (lastIndex < text.length) {
    nodes.push(renderTextWithMentions(text.slice(lastIndex)));
  }

  return nodes.length > 0 ? nodes : text;
}

function hasLinkPreview(preview?: LinkPreview | null) {
  return Boolean(preview?.url);
}

function isSharedMediaMessage(message: Message) {
  return !message.recalled && isMediaMessage(message) && Boolean(message.mediaUrl?.trim());
}

function isSharedLinkMessage(message: Message) {
  return !message.recalled && hasLinkPreview(message.linkPreview);
}

function mergeSharedContentPage(
  currentMessages: ChatMessage[],
  pageMessages: Message[],
  reset: boolean
) {
  const deliveredMessages = pageMessages.map(toDeliveredMessage);
  if (reset) {
    return deliveredMessages;
  }

  const existingIds = new Set(currentMessages.map((message) => message.id));
  return [
    ...currentMessages,
    ...deliveredMessages.filter((message) => !existingIds.has(message.id)),
  ];
}

function prependSharedContentItem(
  currentMessages: ChatMessage[],
  incomingMessage: Message,
  shouldInclude: SharedContentPredicate
) {
  if (!shouldInclude(incomingMessage)) {
    return currentMessages;
  }

  const deliveredMessage = toDeliveredMessage(incomingMessage);
  return [
    deliveredMessage,
    ...currentMessages.filter((message) => message.id !== deliveredMessage.id),
  ];
}

function updateKnownSharedContentItem(
  currentMessages: ChatMessage[],
  incomingMessage: Message,
  shouldInclude: SharedContentPredicate
) {
  const existingMessageIndex = currentMessages.findIndex((message) => message.id === incomingMessage.id);
  if (existingMessageIndex < 0) {
    return currentMessages;
  }

  if (!shouldInclude(incomingMessage)) {
    return currentMessages.filter((message) => message.id !== incomingMessage.id);
  }

  const deliveredMessage = toDeliveredMessage(incomingMessage);
  return currentMessages.map((message, index) =>
    index === existingMessageIndex ? { ...message, ...deliveredMessage } : message
  );
}

function getLinkPreviewDomain(preview?: LinkPreview | null) {
  const explicitDomain = preview?.domain?.trim();
  if (explicitDomain) {
    return explicitDomain;
  }

  const url = preview?.url?.trim();
  if (!url) {
    return '';
  }

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function renderLinkPreviewCard(preview?: LinkPreview | null, onImageLoad?: () => void) {
  const url = preview?.url;
  if (!url) {
    return null;
  }

  const imageUrl = preview?.imageUrl?.trim();
  const title = preview?.title?.trim() || url;
  const description = preview?.description?.trim();
  const domain = preview?.domain?.trim() || url;

  return (
    <a
      className="link-preview-card"
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open link preview for ${title}`}
    >
      {imageUrl ? (
        <img
          className="link-preview-image"
          src={imageUrl}
          alt=""
          loading="lazy"
          onLoad={onImageLoad}
          onError={onImageLoad}
        />
      ) : null}
      <span className="link-preview-copy">
        <span className="link-preview-domain">{domain}</span>
        <strong className="link-preview-title">{title}</strong>
        {description ? (
          <span className="link-preview-description">{description}</span>
        ) : null}
      </span>
    </a>
  );
}

function renderUserAvatar(user: User | null, className = 'user-avatar') {
  const avatarUrl = getAvatarUrl(user?.avatar);

  return (
    <div className={className}>
      {avatarUrl ? <img src={avatarUrl} alt="" /> : getUserInitial(user)}
    </div>
  );
}

function shouldShowUsername(user: User) {
  return getUserDisplayName(user) !== user.username;
}

function getRoomInitial(room: ChatRoom) {
  return room.name.trim().charAt(0).toUpperCase();
}

function renderRoomAvatar(room?: ChatRoom | null, className = 'user-avatar room-avatar') {
  if (!room) return null;
  if (room.avatar) {
    return (
      <div className={className}>
        <img src={room.avatar} alt={room.name} className="room-avatar-image" />
      </div>
    );
  }
  return <div className={className}>{getRoomInitial(room)}</div>;
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

function sortParticipantsForDetails(participants: User[], ownerId?: number | null) {
  return [...participants].sort((left, right) => {
    const leftIsOwner = left.id === ownerId || left.role === 'OWNER';
    const rightIsOwner = right.id === ownerId || right.role === 'OWNER';
    if (leftIsOwner !== rightIsOwner) {
      return leftIsOwner ? -1 : 1;
    }

    const leftIsMod = left.role === 'MODERATOR';
    const rightIsMod = right.role === 'MODERATOR';
    if (leftIsMod !== rightIsMod) {
      return leftIsMod ? -1 : 1;
    }

    if (left.online !== right.online) {
      return left.online ? -1 : 1;
    }

    return getUserDisplayName(left).localeCompare(getUserDisplayName(right));
  });
}

function shouldOpenConversationDetailsByDefault() {
  if (typeof window === 'undefined') {
    return true;
  }

  return !window.matchMedia('(max-width: 768px)').matches;
}

function getMessageSenderName(
  message: ChatMessage,
  selectedRoom: ChatRoom | null,
  findKnownUserById?: (id: number) => User | null
) {
  const participant = selectedRoom?.participants.find((user) => user.id === message.senderId);
  if (participant) {
    const displayName = getUserDisplayName(participant);
    if (displayName) {
      return displayName;
    }
  }

  const knownUser = findKnownUserById ? findKnownUserById(message.senderId) : null;
  if (knownUser) {
    const displayName = getUserDisplayName(knownUser);
    if (displayName) {
      return displayName;
    }
  }

  if (message.senderFullName?.trim()) {
    return message.senderFullName;
  }

  return message.senderUsername ?? 'Unknown';
}

function getMessageSenderUser(
  message: ChatMessage,
  selectedUser: User | null,
  selectedRoom: ChatRoom | null,
  findKnownUserById: (id: number) => User | null
): User {
  if (selectedUser && selectedUser.id === message.senderId) {
    return selectedUser;
  }
  const known = findKnownUserById(message.senderId);
  if (known) {
    return known;
  }
  const roomParticipant = selectedRoom?.participants.find((user) => user.id === message.senderId);
  if (roomParticipant) {
    return roomParticipant;
  }
  return {
    id: message.senderId,
    username: message.senderUsername || 'user',
    fullName: message.senderFullName,
    email: '',
    createdAt: '',
    online: false,
  };
}

function canChatWithUser(user: User) {
  return user.friendshipStatus === 'accepted';
}

function getFriendshipStatusLabel(user: User) {
  switch (user.friendshipStatus) {
    case 'pending_incoming':
      return 'Request received';
    case 'pending_outgoing':
      return 'Pending';
    case 'declined':
    case 'none':
      return 'Not friends';
    case 'accepted':
    default:
      return user.online ? 'Online' : 'Offline';
  }
}

function getRelationshipLabel(user: User) {
  switch (user.friendshipStatus) {
    case 'accepted':
      return 'Friend';
    case 'pending_incoming':
      return 'Request received';
    case 'pending_outgoing':
      return 'Pending';
    case 'declined':
    case 'none':
    case undefined:
    default:
      return 'Not friends';
  }
}

function formatRelativeTime(timestamp?: string) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const secondsDifference = Math.round((date.getTime() - Date.now()) / 1000);
  if (secondsDifference > 0) {
    return 'just now';
  }

  const absoluteSeconds = Math.abs(secondsDifference);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absoluteSeconds < 60) {
    return 'just now';
  }

  if (absoluteSeconds < 3600) {
    return formatter.format(Math.round(secondsDifference / 60), 'minute');
  }

  if (absoluteSeconds < 86400) {
    return formatter.format(Math.round(secondsDifference / 3600), 'hour');
  }

  if (absoluteSeconds < 2592000) {
    return formatter.format(Math.round(secondsDifference / 86400), 'day');
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getPresenceLabel(user: User | null) {
  if (!user) {
    return 'Offline';
  }

  if (user.online) {
    return 'Online';
  }

  const lastSeen = formatRelativeTime(user.lastSeenAt);
  return lastSeen ? `Last seen ${lastSeen}` : 'Offline';
}

function getTypingIndicatorLabel(typingUsers: User[]) {
  if (typingUsers.length === 0) {
    return '';
  }

  if (typingUsers.length === 1) {
    return `${getUserDisplayName(typingUsers[0])} is typing...`;
  }

  if (typingUsers.length === 2) {
    return `${getUserDisplayName(typingUsers[0])} and ${getUserDisplayName(typingUsers[1])} are typing...`;
  }

  return `${typingUsers.length} people are typing...`;
}

function getLatestSeenOutgoingMessageId(
  messages: ChatMessage[],
  currentUserId: number | null,
  selectedUserId: number | null
) {
  if (currentUserId === null || selectedUserId === null) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message.id > 0 &&
      !message.recalled &&
      Boolean(message.read) &&
      message.senderId === currentUserId &&
      getPrivateConversationUserId(message, currentUserId) === selectedUserId
    ) {
      return message.id;
    }
  }

  return null;
}

function getLatestOutgoingMessageId(
  messages: ChatMessage[],
  currentUserId: number | null
) {
  if (currentUserId === null) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message &&
      !message.recalled &&
      message.senderId === currentUserId
    ) {
      return message.id > 0 ? message.id : (message.clientId || null);
    }
  }

  return null;
}

function getUserStatusClass(user: User) {
  return canChatWithUser(user) ? (user.online ? 'online' : 'offline') : 'relationship';
}

function getPrivateConversationUserId(message: Message, currentUserId: number | null) {
  if (currentUserId === null || message.chatRoomId) {
    return null;
  }

  if (message.senderId === currentUserId) {
    return message.receiverId ?? null;
  }

  return message.receiverId === currentUserId || message.receiverId == null ? message.senderId : null;
}

function isMutedIncomingConversation(
  message: Message,
  currentUserId: number | null,
  users: User[],
  friends: User[],
  rooms: ChatRoom[]
) {
  if (message.chatRoomId) {
    return Boolean(rooms.find((room) => room.id === message.chatRoomId)?.muted);
  }

  const conversationUserId = getPrivateConversationUserId(message, currentUserId);
  if (conversationUserId === null) {
    return false;
  }

  return Boolean(
    users.find((user) => user.id === conversationUserId)?.muted ??
    friends.find((friend) => friend.id === conversationUserId)?.muted
  );
}

function getTimestampValue(timestamp?: string) {
  if (!timestamp) {
    return 0;
  }

  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? 0 : value;
}

function getRoomActivityTimestamp(room: ChatRoom) {
  return getTimestampValue(room.lastMessageAt) || getTimestampValue(room.createdAt);
}

function isPinnedConversation(item: SidebarConversationItem) {
  return item.type === 'user' ? Boolean(item.user.pinned) : Boolean(item.room.pinned);
}

function isArchivedUserConversation(user: User) {
  return Boolean(user.archived);
}

function isArchivedRoomConversation(room: ChatRoom) {
  return Boolean(room.archived);
}

function hasUnreadUserConversation(user: User) {
  return (user.unreadCount ?? 0) > 0;
}

function hasUnreadRoomConversation(room: ChatRoom) {
  return (room.unreadCount ?? 0) > 0;
}

function compareRoomsByChatActivity(firstRoom: ChatRoom, secondRoom: ChatRoom) {
  if (Boolean(firstRoom.pinned) !== Boolean(secondRoom.pinned)) {
    return firstRoom.pinned ? -1 : 1;
  }

  const activityDifference =
    getRoomActivityTimestamp(secondRoom) - getRoomActivityTimestamp(firstRoom);

  if (activityDifference !== 0) {
    return activityDifference;
  }

  return firstRoom.name.localeCompare(secondRoom.name);
}

function sortRoomsByChatActivity(rooms: ChatRoom[]) {
  return [...rooms].sort(compareRoomsByChatActivity);
}

function getUserActivityTimestamp(user: User) {
  return getTimestampValue(user.lastMessageAt);
}

function getSidebarConversationActivityTimestamp(item: SidebarConversationItem) {
  return item.type === 'user'
    ? getUserActivityTimestamp(item.user)
    : getRoomActivityTimestamp(item.room);
}

function getSidebarConversationLabel(item: SidebarConversationItem) {
  return item.type === 'user' ? getUserDisplayName(item.user) : item.room.name;
}

function compareSidebarConversationItems(
  firstItem: SidebarConversationItem,
  secondItem: SidebarConversationItem
) {
  if (isPinnedConversation(firstItem) !== isPinnedConversation(secondItem)) {
    return isPinnedConversation(firstItem) ? -1 : 1;
  }

  const activityDifference =
    getSidebarConversationActivityTimestamp(secondItem) -
    getSidebarConversationActivityTimestamp(firstItem);

  if (activityDifference !== 0) {
    return activityDifference;
  }

  return getSidebarConversationLabel(firstItem).localeCompare(
    getSidebarConversationLabel(secondItem)
  );
}

function shouldIncludeUserConversation(user: User, filter: ConversationFilter) {
  if (filter === 'archived') {
    return isArchivedUserConversation(user);
  }

  if (isArchivedUserConversation(user)) {
    return false;
  }

  return filter === 'unread' ? hasUnreadUserConversation(user) : true;
}

function shouldIncludeRoomConversation(room: ChatRoom, filter: ConversationFilter) {
  if (filter === 'archived') {
    return isArchivedRoomConversation(room);
  }

  if (isArchivedRoomConversation(room)) {
    return false;
  }

  return filter === 'unread' ? hasUnreadRoomConversation(room) : true;
}

function buildSidebarConversationItems(
  users: User[],
  rooms: ChatRoom[],
  filter: ConversationFilter
) {
  return [
    ...users
      .filter((user) => shouldIncludeUserConversation(user, filter))
      .map((user) => ({ type: 'user' as const, user })),
    ...rooms
      .filter((room) => shouldIncludeRoomConversation(room, filter))
      .map((room) => ({ type: 'room' as const, room })),
  ].sort(compareSidebarConversationItems);
}

function shouldUseMessageAsRoomPreview(room: ChatRoom, message: Message) {
  return getTimestampValue(message.timestamp) >= getTimestampValue(room.lastMessageAt);
}

function getMessageSenderDisplayName(message: Message) {
  return message.senderFullName?.trim() || message.senderUsername || 'Unknown';
}

function applyRoomPreviewToRoom(room: ChatRoom, message: Message) {
  if (message.chatRoomId !== room.id || !shouldUseMessageAsRoomPreview(room, message)) {
    return room;
  }

  return {
    ...room,
    lastMessageContent: getMessagePreviewContent(message),
    lastMessageAt: message.timestamp,
    lastMessageSenderId: message.senderId,
    lastMessageSenderName: getMessageSenderDisplayName(message),
  };
}

function applyRoomPreviewToRooms(
  rooms: ChatRoom[],
  message: Message,
  currentUserId: number | null,
  selectedRoomId: number | null
) {
  if (!message.chatRoomId) {
    return rooms;
  }

  let didUpdate = false;
  const nextRooms = rooms.map((room) => {
    if (room.id !== message.chatRoomId) {
      return room;
    }

    const withPreview = applyRoomPreviewToRoom(room, message);
    const shouldIncrementUnread =
      message.senderId !== currentUserId && room.id !== selectedRoomId;
    const nextRoom = {
      ...withPreview,
      unreadCount: shouldIncrementUnread
        ? (withPreview.unreadCount ?? 0) + 1
        : withPreview.unreadCount ?? 0,
    };

    didUpdate ||= nextRoom !== room;
    return nextRoom;
  });

  return didUpdate ? sortRoomsByChatActivity(nextRooms) : rooms;
}

function shouldUseMessageAsPreview(user: User, message: Message) {
  return getTimestampValue(message.timestamp) >= getTimestampValue(user.lastMessageAt);
}

function applyConversationPreviewToUser(user: User, message: Message, currentUserId: number | null) {
  const conversationUserId = getPrivateConversationUserId(message, currentUserId);
  if (conversationUserId !== user.id || !shouldUseMessageAsPreview(user, message)) {
    return user;
  }

  return {
    ...user,
    lastMessageContent: getMessagePreviewContent(message),
    lastMessageAt: message.timestamp,
    lastMessageSenderId: message.senderId,
  };
}

function compareUsersByChatActivity(firstUser: User, secondUser: User) {
  if (Boolean(firstUser.pinned) !== Boolean(secondUser.pinned)) {
    return firstUser.pinned ? -1 : 1;
  }

  const activityDifference =
    getTimestampValue(secondUser.lastMessageAt) - getTimestampValue(firstUser.lastMessageAt);
  if (activityDifference !== 0) {
    return activityDifference;
  }

  return getUserDisplayName(firstUser).localeCompare(getUserDisplayName(secondUser));
}

function applyConversationPreviewToUsers(
  users: User[],
  message: Message,
  currentUserId: number | null,
  moveUpdatedUserToTop: boolean
) {
  const conversationUserId = getPrivateConversationUserId(message, currentUserId);
  if (conversationUserId === null) {
    return users;
  }

  let didUpdate = false;
  const nextUsers = users.map((user) => {
    const nextUser = applyConversationPreviewToUser(user, message, currentUserId);
    didUpdate ||= nextUser !== user;
    return nextUser;
  });

  if (!didUpdate) {
    return users;
  }

  return moveUpdatedUserToTop ? [...nextUsers].sort(compareUsersByChatActivity) : nextUsers;
}

function formatSidebarTime(timestamp?: string) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getConversationPreviewText(user: User, currentUserId: number | null) {
  const content = user.lastMessageContent?.trim();
  if (content) {
    return user.lastMessageSenderId === currentUserId ? `You: ${content}` : content;
  }

  const username = shouldShowUsername(user) ? ` @${user.username}` : '';
  return `${getFriendshipStatusLabel(user)}${username}`;
}

function getRoomPreviewText(room: ChatRoom, currentUserId: number | null) {
  const content = room.lastMessageContent?.trim();
  if (!content) {
    return getRoomMemberSummary(room, currentUserId);
  }

  if (room.lastMessageSenderId === currentUserId) {
    return `You: ${content}`;
  }

  const senderName = room.lastMessageSenderName?.trim();
  return senderName ? `${senderName}: ${content}` : content;
}

function hasPrivateConversation(user: User) {
  return Boolean(user.lastMessageAt || user.lastMessageContent?.trim() || (user.unreadCount ?? 0) > 0);
}

function matchesFriendSearch(user: User, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    getUserDisplayName(user).toLowerCase().includes(normalizedQuery) ||
    user.username.toLowerCase().includes(normalizedQuery)
  );
}

function getLocalDateKeyFromDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalDateKey(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return getLocalDateKeyFromDate(date);
}

function formatMessageDateDivider(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const dateKey = getLocalDateKey(timestamp);

  if (dateKey === getLocalDateKeyFromDate(today)) {
    return 'Today';
  }

  if (dateKey === getLocalDateKeyFromDate(yesterday)) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

function formatMessageTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatCallDurationLabel(totalSeconds?: number | null) {
  if (!totalSeconds || totalSeconds <= 0) {
    return '';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${seconds}s`;
}

function formatCallTimer(totalSeconds: number) {
  const safeSeconds = Math.max(totalSeconds, 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getMediaDeviceLabel(device: MediaDeviceInfo, index: number) {
  if (device.label) {
    return device.label;
  }

  return `${device.kind === 'audioinput' ? 'Microphone' : 'Camera'} ${index + 1}`;
}

function getCallEventLabel(message: Message) {
  const content = message.content?.trim();
  if (content) {
    return content;
  }

  const typeLabel = message.callType === 'VIDEO' ? 'Video' : 'Audio';
  if (message.callStatus === 'ENDED') {
    const duration = formatCallDurationLabel(message.callDurationSeconds);
    return duration ? `${typeLabel} call ended · ${duration}` : `${typeLabel} call ended`;
  }

  if (message.callStatus === 'MISSED') {
    return `Missed ${typeLabel.toLowerCase()} call`;
  }

  if (message.callStatus === 'REJECTED') {
    return `${typeLabel} call declined`;
  }

  if (message.callStatus === 'CANCELED') {
    return `${typeLabel} call canceled`;
  }

  if (message.callStatus === 'BUSY') {
    return `${typeLabel} call not answered · Busy`;
  }

  return `${typeLabel} call`;
}

function shouldGroupAdjacentMessages(firstMessage: ChatMessage | undefined, secondMessage: ChatMessage | undefined) {
  if (!firstMessage || !secondMessage || firstMessage.senderId !== secondMessage.senderId) {
    return false;
  }

  if (isCallMessage(firstMessage) || isCallMessage(secondMessage)) {
    return false;
  }

  if (getLocalDateKey(firstMessage.timestamp) !== getLocalDateKey(secondMessage.timestamp)) {
    return false;
  }

  const firstTimestamp = getTimestampValue(firstMessage.timestamp);
  const secondTimestamp = getTimestampValue(secondMessage.timestamp);
  if (!firstTimestamp || !secondTimestamp) {
    return false;
  }

  return secondTimestamp - firstTimestamp <= MESSAGE_GROUP_THRESHOLD_MS;
}

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

function ForwardPickerBody({
  friends,
  rooms,
  onSelect,
}: {
  friends: User[];
  rooms: ChatRoom[];
  onSelect: (targetUserId: number | null, targetRoomId: number | null) => void;
}) {
  const [query, setQuery] = useState('');

  const lowerQuery = query.toLowerCase();

  const filteredFriends = friends.filter(
    (u) =>
      (u.fullName ?? u.username).toLowerCase().includes(lowerQuery) ||
      u.username.toLowerCase().includes(lowerQuery),
  );
  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(lowerQuery),
  );

  return (
    <>
      <div className="forward-picker-search-wrap">
        <input
          className="forward-picker-search"
          type="text"
          placeholder="Search people or groups…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="forward-picker-list">
        {filteredFriends.length === 0 && filteredRooms.length === 0 ? (
          <div className="forward-picker-empty">No results</div>
        ) : null}
        {filteredFriends.map((u) => (
          <button
            key={`dm-${u.id}`}
            type="button"
            className="forward-picker-item"
            onClick={() => onSelect(u.id, null)}
          >
            <div className="forward-picker-avatar">
              {u.avatar ? (
                <img src={u.avatar} alt={u.username} />
              ) : (
                <span>{(u.fullName ?? u.username).charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="forward-picker-name">
              <span>{u.fullName ?? u.username}</span>
              <small>@{u.username}</small>
            </div>
          </button>
        ))}
        {filteredRooms.map((r) => (
          <button
            key={`room-${r.id}`}
            type="button"
            className="forward-picker-item"
            onClick={() => onSelect(null, r.id)}
          >
            <div className="forward-picker-avatar group">
              <span>{r.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="forward-picker-name">
              <span>{r.name}</span>
              <small>{r.participants.length} members</small>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

export default function ChatPage() {
  const { isDark, toggleTheme } = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const [mentionActiveIndex, setMentionActiveIndex] = useState<number>(0);
  const [soundMuted, setSoundMuted] = useState(() => soundService.isMuted());

  useEffect(() => {
    return soundService.onMuteChange((muted) => setSoundMuted(muted));
  }, []);

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
    UNKNOWN_CALL_PERMISSIONS
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

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    if (!activeCall || (activeCall.direction === 'incoming' && activeCall.status === 'ringing')) {
      setCallMinimized(false);
    }
  }, [activeCall]);

  useEffect(() => {
    localCallStreamRef.current = localCallStream;
  }, [localCallStream]);

  useEffect(() => {
    preCallPreviewStreamRef.current = preCallPreviewStream;
  }, [preCallPreviewStream]);

  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);

  useEffect(() => {
    cameraOffRef.current = cameraOff;
  }, [cameraOff]);

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
    screenSharingRef.current = screenSharing;
  }, [screenSharing]);

  useEffect(() => {
    selectedAudioInputIdRef.current = selectedAudioInputId;
  }, [selectedAudioInputId]);

  useEffect(() => {
    selectedVideoInputIdRef.current = selectedVideoInputId;
  }, [selectedVideoInputId]);

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteCallStream;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteCallStream;
    }
  }, [remoteCallStream]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localCallStream;
    }
  }, [cameraOff, localCallStream]);

  useEffect(() => {
    if (preCallPreviewVideoRef.current) {
      preCallPreviewVideoRef.current.srcObject = preCallPreviewStream;
    }
  }, [cameraOff, preCallPreviewStream]);

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
    if (browserNotificationPermissionRef.current === 'default') {
      void requestBrowserNotificationPermission();
      return;
    }

    if (showBrowserNotification(notification)) {
      if (isMention) {
        soundService.playMentionSound();
      } else {
        soundService.playNotificationSound();
      }
    }
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
    const usersEndpoint = search ? '/friends/search' : '/friends';

    if (!options.silent) {
      setUsersLoading(true);
    }
    setUsersError('');

    try {
      const [usersResponse, unreadCountsResponse] = await Promise.all([
        apiClient.get<User[]>(usersEndpoint, {
          params: search ? { username: search } : undefined,
        }),
        apiClient.get<UnreadCount[]>('/messages/unread-counts'),
      ]);
      if (!isCurrentSearch()) {
        return;
      }

      const nextUsers = mergeUnreadCounts(usersResponse.data, unreadCountsResponse.data);
      setUsers(nextUsers);
      if (!search) {
        setFriends(nextUsers);
      }

      const selectedUserIdForUpdate = selectedUserIdRef.current;
      if (selectedUserIdForUpdate !== null) {
        const updatedSelectedUser = nextUsers.find((user) => user.id === selectedUserIdForUpdate);
        if (updatedSelectedUser && canChatWithUser(updatedSelectedUser)) {
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
  }, [resetMessagePagination]);

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
    const user = localStorage.getItem('user');
    if (!user) {
      navigate(ROUTES.HOME, { replace: true });
      return;
    }

    try {
      const parsedUser = JSON.parse(user) as User;
      setCurrentUser({ ...parsedUser, online: false });
      currentUserIdRef.current = parsedUser.id;
    } catch (error) {
      console.error('Failed to read current user:', error);
      clearAuthSession();
      navigate(ROUTES.HOME, { replace: true });
    }
  }, [navigate]);

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
    if (!activeCall || activeCall.status !== 'connected' || callStartedAt === null) {
      setCallElapsedSeconds(0);
      return undefined;
    }

    const updateElapsedSeconds = () => {
      setCallElapsedSeconds(Math.floor((Date.now() - callStartedAt) / 1000));
    };

    updateElapsedSeconds();
    const intervalId = window.setInterval(updateElapsedSeconds, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeCall, callStartedAt]);

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
    if (!canChatWithUser(user)) {
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
  }, [hideRemoteTyping, loadMessages, preparePendingReadConversation, stopRoomTyping, stopTyping]);

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
      if (canChatWithUser(userFromLists)) {
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

        if (canChatWithUser(response.data)) {
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
    if (!canChatWithUser(user)) {
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

  const handleCopyInviteLink = async () => {
    if (!groupInviteData?.inviteUrl && !groupInviteData?.inviteCode && !selectedRoom?.inviteCode) return;
    const code = groupInviteData?.inviteCode || selectedRoom?.inviteCode;
    const url =
      groupInviteData?.inviteUrl ||
      `${window.location.origin}/invite/${code}`;
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

  const handleMessageInputChange = (value: string) => {
    setMessageInput(value);
    const cursorPos = messageInputRef.current?.selectionStart ?? value.length;
    checkMentionTrigger(value, cursorPos);
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

    if (selectedUser) {
      publishTyping(selectedUser.id, true);
    } else if (selectedRoom) {
      publishRoomTyping(selectedRoom.id, true);
    }

    clearTypingTimeout();
    typingTimeoutRef.current = setTimeout(() => {
      if (selectedUser) {
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

  const uploadToLocalMedia = async (file: File): Promise<MediaAttachment> => {
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
        return await uploadToLocalMedia(media.file);
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
      };
    } catch {
      return await uploadToLocalMedia(media.file);
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
    localStorage.setItem('user', JSON.stringify(nextCurrentUser));
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

  const handleLogout = () => {
    if (selectedUserIdRef.current !== null) {
      stopTyping(selectedUserIdRef.current);
    }

    if (selectedRoomIdRef.current !== null) {
      stopRoomTyping(selectedRoomIdRef.current);
    }

    sendActiveCallCloseSignal();
    stopPreCallPreview();

    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      void apiClient.post('/auth/logout', { refreshToken }).catch((error) => {
        console.error('Failed to revoke refresh token:', error);
      });
    }

    wsService.disconnect();
    clearAuthSession();
    navigate(ROUTES.HOME, { replace: true });
  };

  const currentUserDisplayName = getUserDisplayName(currentUser) || 'Profile';
  const currentUserOnline = Boolean(currentUser?.online);
  const activeCallPeerName = getUserDisplayName(activeCall?.peer ?? null);
  const activeCallIsVideo = activeCall?.type === 'VIDEO';
  const activeCallTimerLabel = activeCall?.status === 'connected'
    ? formatCallTimer(callElapsedSeconds)
    : '';
  const preCallPeerName = getUserDisplayName(preCallSetup?.target ?? null);
  const preCallIsVideo = preCallSetup?.type === 'VIDEO';
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
  const canAddRoomMembers = Boolean(
    currentUserCanManageSelectedRoom &&
    selectedAddMemberIds.length > 0 &&
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
            title={reaction.title}
            aria-label={`${reaction.count} ${reaction.emoji} reactions`}
          >
            <span>{reaction.emoji}</span>
            {reaction.count > 1 ? <small>{reaction.count}</small> : null}
          </button>
        ))}
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
            onClick={() => setMediaViewerMessage(message)}
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
          <video
            className="message-video-preview"
            src={mediaUrl}
            controls
            preload="metadata"
            onLoadedMetadata={handleMessageAssetLoaded}
            onError={handleMessageAssetLoaded}
          />
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
          onClick={() =>
            setSeenByPopupMessageId((currentMessageId) =>
              currentMessageId === message.id ? null : message.id
            )
          }
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

  const renderPreCallSetupModal = () => {
    if (!preCallSetup) {
      return null;
    }

    const hasSelectedAudioDevice = audioInputDevices.some(
      (device) => device.deviceId === selectedAudioInputId
    );
    const hasSelectedVideoDevice = videoInputDevices.some(
      (device) => device.deviceId === selectedVideoInputId
    );
    const title = `${preCallIsVideo ? 'Video' : 'Audio'} call`;

    return (
      <div className="modal-backdrop pre-call-backdrop" onClick={handleClosePreCallSetup}>
        <div
          className="pre-call-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pre-call-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pre-call-header">
            <div>
              <h3 id="pre-call-title">{title}</h3>
              <p>{preCallPeerName}</p>
            </div>
            <button
              type="button"
              className="modal-close-btn"
              onClick={handleClosePreCallSetup}
              aria-label="Close call setup"
              disabled={preCallSubmitting}
            >
              ×
            </button>
          </div>

          <div className="pre-call-preview">
            {preCallPreviewLoading ? (
              <div className="pre-call-preview-placeholder">
                {renderUserAvatar(preCallSetup.target, 'user-avatar pre-call-avatar')}
                <span>Checking devices...</span>
              </div>
            ) : preCallIsVideo && preCallPreviewStream && !cameraOff ? (
              <video
                ref={preCallPreviewVideoRef}
                className="pre-call-video-preview"
                autoPlay
                muted
                playsInline
              />
            ) : (
              <div className="pre-call-preview-placeholder">
                {preCallIsVideo && cameraOff ? (
                  <span className="pre-call-camera-off">
                    <VideoOffIcon className="call-action-icon" />
                  </span>
                ) : (
                  renderUserAvatar(preCallSetup.target, 'user-avatar pre-call-avatar')
                )}
                <span>{preCallIsVideo && cameraOff ? 'Camera is off' : 'Ready to call'}</span>
              </div>
            )}
          </div>

          {renderCallPermissionStatus(preCallSetup.type)}

          <div className="pre-call-quick-actions" aria-label="Call setup controls">
            <button
              type="button"
              className={`call-round-btn ${micMuted ? 'active' : ''}`}
              onClick={handlePreCallToggleMic}
              disabled={preCallPreviewLoading || preCallSubmitting}
              aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
              title={micMuted ? 'Unmute' : 'Mute'}
            >
              {micMuted ? (
                <MicOffIcon className="call-action-icon" />
              ) : (
                <MicIcon className="call-action-icon" />
              )}
            </button>
            {preCallIsVideo ? (
              <button
                type="button"
                className={`call-round-btn ${cameraOff ? 'active' : ''}`}
                onClick={handlePreCallToggleCamera}
                disabled={preCallPreviewLoading || preCallSubmitting}
                aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                title={cameraOff ? 'Camera on' : 'Camera off'}
              >
                {cameraOff ? (
                  <VideoOffIcon className="call-action-icon" />
                ) : (
                  <VideoCallIcon className="call-action-icon" />
                )}
              </button>
            ) : null}
          </div>

          <div className="call-device-controls pre-call-device-controls" aria-label="Pre-call devices">
            <label className="call-device-field">
              <span>Mic</span>
              <select
                className="call-device-select"
                value={selectedAudioInputId}
                onChange={handlePreCallAudioInputChange}
                disabled={preCallPreviewLoading || preCallSubmitting}
              >
                <option value="">Default microphone</option>
                {selectedAudioInputId && !hasSelectedAudioDevice ? (
                  <option value={selectedAudioInputId}>Selected microphone</option>
                ) : null}
                {audioInputDevices.map((device, index) => (
                  <option key={device.deviceId || `pre-audio-${index}`} value={device.deviceId}>
                    {getMediaDeviceLabel(device, index)}
                  </option>
                ))}
              </select>
            </label>

            {preCallIsVideo ? (
              <label className="call-device-field">
                <span>Camera</span>
                <select
                  className="call-device-select"
                  value={selectedVideoInputId}
                  onChange={handlePreCallVideoInputChange}
                  disabled={preCallPreviewLoading || preCallSubmitting}
                >
                  <option value="">Default camera</option>
                  {selectedVideoInputId && !hasSelectedVideoDevice ? (
                    <option value={selectedVideoInputId}>Selected camera</option>
                  ) : null}
                  {videoInputDevices.map((device, index) => (
                    <option key={device.deviceId || `pre-video-${index}`} value={device.deviceId}>
                      {getMediaDeviceLabel(device, index)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {callDevicesLoading ? (
              <span className="call-device-helper">Refreshing device list...</span>
            ) : null}
            {callDeviceError ? <span className="call-device-error">{callDeviceError}</span> : null}
          </div>

          {preCallError ? (
            <div className="pre-call-error">
              <span>{preCallError}</span>
              <button type="button" onClick={handlePreCallRetryPreview}>
                Retry
              </button>
            </div>
          ) : null}

          <div className="pre-call-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={handleClosePreCallSetup}
              disabled={preCallSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="send-btn"
              onClick={() => void handleConfirmStartCall()}
              disabled={!preCallCanStart}
            >
              {preCallSubmitting ? 'Calling...' : 'Start call'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCallOverlay = () => {
    if (!activeCall) {
      return null;
    }

    const isIncomingRinging = activeCall.direction === 'incoming' && activeCall.status === 'ringing';
    const isOutgoingRinging = activeCall.direction === 'outgoing' && activeCall.status === 'ringing';
    const hasSelectedAudioDevice = audioInputDevices.some(
      (device) => device.deviceId === selectedAudioInputId
    );
    const hasSelectedVideoDevice = videoInputDevices.some(
      (device) => device.deviceId === selectedVideoInputId
    );
    const canShowDeviceControls = Boolean(
      localCallStream && activeCall.status !== 'ringing' && activeCall.status !== 'ending'
    );
    const canRetryActiveCall = Boolean(
      !isIncomingRinging &&
      activeCall.status !== 'ending' &&
      (callConnectionState === 'failed' || callConnectionState === 'closed')
    );
    const canToggleScreenShare = Boolean(
      activeCallIsVideo &&
      !isIncomingRinging &&
      activeCall.status !== 'ringing' &&
      activeCall.status !== 'ending' &&
      localCallStream &&
      callConnectionState !== 'failed' &&
      callConnectionState !== 'closed'
    );
    const screenShareLabel = screenSharing
      ? 'You are sharing your screen'
      : remoteScreenSharing
        ? `${activeCallPeerName} is sharing screen`
        : '';
    const screenShareButtonTitle = screenSharing ? 'Stop sharing screen' : 'Share screen';
    const statusLabel = isIncomingRinging
      ? `Incoming ${activeCall.type === 'VIDEO' ? 'video' : 'audio'} call`
      : isOutgoingRinging
        ? 'Ringing...'
        : callConnectionState === 'reconnecting'
          ? 'Reconnecting...'
          : callConnectionState === 'failed'
            ? 'Connection failed'
            : activeCall.status === 'connected'
              ? `Connected${activeCallTimerLabel ? ` · ${activeCallTimerLabel}` : ''}`
              : activeCall.status === 'ending'
                ? 'Ending call'
                : 'Connecting...';
    const canMinimizeCall = !isIncomingRinging && activeCall.status !== 'ending';
    const callOverlayClassName = `call-overlay ${callMinimized ? 'minimized' : ''}`;

    if (callMinimized && canMinimizeCall) {
      return (
        <div className={callOverlayClassName}>
          <audio ref={remoteAudioRef} autoPlay playsInline />
          <div
            className={`call-mini ${activeCallIsVideo ? 'video' : 'audio'} ${activeCall.status} ${callConnectionState}`}
            role="region"
            aria-label="Minimized active call"
          >
            <button
              type="button"
              className="call-mini-main"
              onClick={handleRestoreActiveCall}
              aria-label={`Restore call with ${activeCallPeerName}`}
            >
              {renderUserAvatar(activeCall.peer, 'user-avatar call-mini-avatar')}
              <span className="call-mini-copy">
                <strong>{activeCallPeerName}</strong>
                <span>
                  <span className={`call-status-dot ${callConnectionState}`} aria-hidden="true" />
                  {statusLabel}
                </span>
                {screenShareLabel ? (
                  <span className="call-mini-sharing">
                    <ScreenShareIcon className="call-mini-share-icon" />
                    {screenShareLabel}
                  </span>
                ) : null}
              </span>
            </button>

            <div className="call-mini-actions" aria-label="Minimized call controls">
              {!activeCallConversationOpen ? (
                <button
                  type="button"
                  className="call-mini-btn"
                  onClick={handleOpenActiveCallConversation}
                  aria-label="Open active call chat"
                  title="Open chat"
                >
                  <JumpIcon className="call-action-icon" />
                </button>
              ) : null}
              <button
                type="button"
                className={`call-mini-btn ${micMuted ? 'active' : ''}`}
                onClick={handleToggleMic}
                disabled={!localCallStream}
                aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                title={micMuted ? 'Unmute' : 'Mute'}
              >
                {micMuted ? (
                  <MicOffIcon className="call-action-icon" />
                ) : (
                  <MicIcon className="call-action-icon" />
                )}
              </button>
              {activeCallIsVideo ? (
                <button
                  type="button"
                  className={`call-mini-btn sharing ${screenSharing ? 'active' : ''}`}
                  onClick={() => {
                    void (screenSharing ? handleStopScreenShare() : handleStartScreenShare());
                  }}
                  disabled={!screenSharing && !canToggleScreenShare}
                  aria-label={screenShareButtonTitle}
                  title={screenShareButtonTitle}
                >
                  <ScreenShareIcon className="call-action-icon" />
                </button>
              ) : null}
              {activeCallIsVideo ? (
                <button
                  type="button"
                  className={`call-mini-btn ${cameraOff ? 'active' : ''}`}
                  onClick={handleToggleCamera}
                  disabled={!localCallStream || screenSharing}
                  aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                  title={
                    screenSharing
                      ? 'Stop sharing screen before changing camera'
                      : cameraOff
                        ? 'Camera on'
                        : 'Camera off'
                  }
                >
                  {cameraOff ? (
                    <VideoOffIcon className="call-action-icon" />
                  ) : (
                    <VideoCallIcon className="call-action-icon" />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                className="call-mini-btn"
                onClick={handleRestoreActiveCall}
                aria-label="Expand active call"
                title="Expand call"
              >
                <ExpandIcon className="call-action-icon" />
              </button>
              <button
                type="button"
                className="call-mini-btn end"
                onClick={handleEndCall}
                aria-label="End call"
                title="End call"
              >
                <PhoneIcon className="call-action-icon" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={callOverlayClassName} role="dialog" aria-modal="false" aria-label="Active call">
        <audio ref={remoteAudioRef} autoPlay playsInline />
        <div
          className={`call-card ${activeCallIsVideo ? 'video' : 'audio'} ${activeCall.direction} ${activeCall.status} ${callConnectionState}`}
        >
          <div className="call-header-row">
            <div className="call-identity">
              {renderUserAvatar(activeCall.peer, 'user-avatar call-avatar')}
              <div>
                <strong>{activeCallPeerName}</strong>
                <span className="call-status-row">
                  <span className={`call-status-dot ${callConnectionState}`} aria-hidden="true" />
                  {statusLabel}
                </span>
                <span className="call-type-chip">
                  {activeCall.type === 'VIDEO' ? 'Video call' : 'Audio call'}
                </span>
              </div>
            </div>
            <div className="call-header-actions">
              {!activeCallConversationOpen ? (
                <button
                  type="button"
                  className="call-open-chat-btn"
                  onClick={handleOpenActiveCallConversation}
                >
                  Open chat
                </button>
              ) : null}
              {canMinimizeCall ? (
                <button
                  type="button"
                  className="call-header-icon-btn"
                  onClick={handleMinimizeActiveCall}
                  aria-label="Minimize active call"
                  title="Minimize"
                >
                  <MinimizeIcon className="call-action-icon" />
                </button>
              ) : null}
            </div>
          </div>

          {activeCallIsVideo && activeCall.status !== 'ringing' ? (
            <div className="call-video-stage">
              {remoteCallStream ? (
                <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline />
              ) : (
                <div className="call-video-placeholder">
                  {renderUserAvatar(activeCall.peer, 'user-avatar call-video-avatar')}
                  <span>Waiting for video...</span>
                </div>
              )}
              {localCallStream ? (
                cameraOff && !screenSharing ? (
                  <div className="call-local-video-placeholder" title="Camera is off">
                    <VideoOffIcon className="call-action-icon" />
                  </div>
                ) : (
                  <video
                    ref={localVideoRef}
                    className={`call-local-video ${screenSharing ? 'screen' : ''}`}
                    autoPlay
                    muted
                    playsInline
                  />
                )
              ) : null}
              {screenShareLabel ? (
                <div className="call-share-indicator">
                  <ScreenShareIcon className="call-share-indicator-icon" />
                  <span>{screenShareLabel}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className={`call-audio-stage ${activeCall.status}`}>
              <div className="call-audio-avatar-shell">
                {renderUserAvatar(activeCall.peer, 'user-avatar call-stage-avatar')}
              </div>
              {activeCallTimerLabel ? <span>{activeCallTimerLabel}</span> : null}
            </div>
          )}

          {callError ? (
            <div className="call-error">
              <span>{callError}</span>
              {canRetryActiveCall ? (
                <button type="button" onClick={handleRetryActiveCall}>
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          {screenShareError ? (
            <div className="call-error call-share-error">
              <span>{screenShareError}</span>
            </div>
          ) : null}

          {canShowDeviceControls ? (
            <div className="call-device-controls" aria-label="Call devices">
              {renderCallPermissionStatus(activeCall.type)}

              <label className="call-device-field">
                <span>Mic</span>
                <select
                  className="call-device-select"
                  value={selectedAudioInputId}
                  onChange={handleAudioInputChange}
                  disabled={callDevicesLoading}
                >
                  <option value="">Default microphone</option>
                  {selectedAudioInputId && !hasSelectedAudioDevice ? (
                    <option value={selectedAudioInputId}>Selected microphone</option>
                  ) : null}
                  {audioInputDevices.map((device, index) => (
                    <option key={device.deviceId || `audio-${index}`} value={device.deviceId}>
                      {getMediaDeviceLabel(device, index)}
                    </option>
                  ))}
                </select>
              </label>

              {activeCallIsVideo ? (
                <label className="call-device-field">
                  <span>Camera</span>
                  <select
                    className="call-device-select"
                    value={selectedVideoInputId}
                    onChange={handleVideoInputChange}
                    disabled={callDevicesLoading || screenSharing}
                  >
                    <option value="">Default camera</option>
                    {selectedVideoInputId && !hasSelectedVideoDevice ? (
                      <option value={selectedVideoInputId}>Selected camera</option>
                    ) : null}
                    {videoInputDevices.map((device, index) => (
                      <option key={device.deviceId || `video-${index}`} value={device.deviceId}>
                        {getMediaDeviceLabel(device, index)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {callDevicesLoading ? (
                <span className="call-device-helper">Loading devices...</span>
              ) : null}
              {callDeviceError ? <span className="call-device-error">{callDeviceError}</span> : null}
            </div>
          ) : null}

          <div className="call-actions">
            {isIncomingRinging ? (
              <>
                <button type="button" className="call-action-btn accept" onClick={handleAcceptCall}>
                  <PhoneIcon className="call-action-icon" />
                  <span>Accept</span>
                </button>
                <button type="button" className="call-action-btn end" onClick={handleRejectCall}>
                  <CloseIcon className="call-action-icon" />
                  <span>Decline</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`call-round-btn ${micMuted ? 'active' : ''}`}
                  onClick={handleToggleMic}
                  disabled={!localCallStream}
                  aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                  title={micMuted ? 'Unmute' : 'Mute'}
                >
                  {micMuted ? (
                    <MicOffIcon className="call-action-icon" />
                  ) : (
                    <MicIcon className="call-action-icon" />
                  )}
                </button>
                {activeCallIsVideo ? (
                  <>
                    <button
                      type="button"
                      className={`call-round-btn sharing ${screenSharing ? 'active' : ''}`}
                      onClick={() => {
                        void (screenSharing ? handleStopScreenShare() : handleStartScreenShare());
                      }}
                      disabled={!screenSharing && !canToggleScreenShare}
                      aria-label={screenShareButtonTitle}
                      title={screenShareButtonTitle}
                    >
                      <ScreenShareIcon className="call-action-icon" />
                    </button>
                    <button
                      type="button"
                      className={`call-round-btn ${cameraOff ? 'active' : ''}`}
                      onClick={handleToggleCamera}
                      disabled={!localCallStream || screenSharing}
                      aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                      title={
                        screenSharing
                          ? 'Stop sharing screen before changing camera'
                          : cameraOff
                            ? 'Camera on'
                            : 'Camera off'
                      }
                    >
                      {cameraOff ? (
                        <VideoOffIcon className="call-action-icon" />
                      ) : (
                        <VideoCallIcon className="call-action-icon" />
                      )}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="call-round-btn end"
                  onClick={handleEndCall}
                  aria-label="End call"
                  title="End call"
                >
                  <PhoneIcon className="call-action-icon" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

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
    switch (user.friendshipStatus) {
      case 'accepted':
        return (
          <button
            type="button"
            className="send-btn profile-message-btn"
            onClick={() => handleUserSelect(user)}
          >
            Message
          </button>
        );
      case 'pending_incoming': {
        const requestId = user.friendshipId;
        return requestId ? (
          <>
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
          <button
            type="button"
            className="friend-action-btn"
            disabled={friendActionKeys.includes(`send-${user.id}`)}
            onClick={() => void handleSendFriendRequest(user)}
          >
            Add friend
          </button>
        );
    }
  };

  const renderUserIdentity = (user: User, showConversationPreview = false) => {
    const sidebarTime = showConversationPreview ? formatSidebarTime(user.lastMessageAt) : '';

    return (
      <>
        {renderUserAvatar(user)}
        <div className="user-info">
          <div className="user-title-row">
            <div className="user-name">{getUserDisplayName(user)}</div>
            {sidebarTime ? <span className="user-time">{sidebarTime}</span> : null}
          </div>
          {showConversationPreview ? (
            <div className="user-preview-row">
              <span className="user-preview">
                {getConversationPreviewText(user, currentUser?.id ?? null)}
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
          </div>
        ) : null}
      </div>
    );
  };

  const renderUserItem = (user: User) => {
    const unreadCount = user.unreadCount ?? 0;
    const showConversationPreview = !hasUserSearch && canChatWithUser(user);

    if (canChatWithUser(user) && !hasUserSearch) {
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
          onClick={() => void handleOpenUserProfile(user)}
          aria-label={`View profile for ${getUserDisplayName(user)}`}
        >
          {renderUserIdentity(user)}
        </button>
        {renderFriendshipAction(user)}
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
              {sidebarTime ? <span className="user-time">{sidebarTime}</span> : null}
            </div>
            <div className="user-preview-row">
              <span className="user-preview">
                {getRoomPreviewText(room, currentUser?.id ?? null)}
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
          : 'No conversations yet. Open Friends to start a new chat.';

    if (sidebarBusy && !hasAnyConversation) {
      return renderSidebarSkeletons();
    }

    if (!sidebarBusy && !usersError && !roomsError && !hasAnyConversation) {
      return (
        <div className="list-state empty-groups-state">
          <span>{emptyConversationMessage}</span>
          {conversationFilter === 'all' ? (
            <button type="button" className="retry-btn" onClick={handleOpenFriendsPanel}>
              Open friends
            </button>
          ) : null}
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
    <button
      type="button"
      key={user.id}
      className="main-list-item friend-main-item"
      onClick={() => handleUserSelect(user)}
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
      <span className={`main-status-pill ${user.online ? 'online' : 'offline'}`}>
        {user.online ? 'Online' : 'Offline'}
      </span>
    </button>
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
    const canShowMenu =
      currentUserCanManageSelectedRoom ||
      isCurrentUser;

    return (
      <div
        key={user.id}
        className={`details-member-item ${editingNickname ? 'editing' : ''}`}
      >
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

        {canShowMenu ? (
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
        ) : null}

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
      <aside
        id="conversation-search-sidebar"
        className="details-sidebar search-sidebar"
        aria-label="Search in conversation"
      >
        <div className="details-header search-sidebar-header">
          <div className="search-sidebar-title-group">
            <h3>Search Messages</h3>
            <span className="search-sidebar-subtitle">{conversationName}</span>
          </div>
          <button
            type="button"
            className="details-close-btn"
            onClick={handleCloseConversationDetails}
            aria-label="Close search"
            title="Close search"
          >
            <CloseIcon className="details-close-icon" />
          </button>
        </div>

        <div className="search-sidebar-body">
          <form
            className="search-sidebar-form"
            role="search"
            onSubmit={handleMessageSearchSubmit}
          >
            <div className="search-sidebar-input-box">
              <SearchIcon className="search-sidebar-input-icon" />
              <input
                ref={messageSearchInputRef}
                type="search"
                value={messageSearchQuery}
                onChange={(event) => handleMessageSearchChange(event.target.value)}
                onKeyDown={handleMessageSearchInputKeyDown}
                placeholder="Search in conversation..."
                aria-label="Search in conversation"
                autoComplete="off"
                spellCheck={false}
              />
              {messageSearchQuery ? (
                <button
                  type="button"
                  className="search-sidebar-clear-btn"
                  onClick={handleClearMessageSearch}
                  aria-label="Clear search"
                  title="Clear search"
                >
                  ✕
                </button>
              ) : null}
            </div>
          </form>

          {!messageSearchSubmitted || !query ? (
            <div className="search-sidebar-empty-state">
              <div className="search-sidebar-empty-icon">🔍</div>
              <p className="search-sidebar-empty-heading">Search in conversation</p>
              <p className="search-sidebar-empty-hint">Type keywords and press <strong>Enter</strong> to search.</p>
            </div>
          ) : showInitialSearchLoading ? (
            <div className="search-sidebar-loading-state">
              <div className="search-sidebar-spinner" />
              <span>Searching messages...</span>
            </div>
          ) : messageSearchError && messageSearchItems.length === 0 ? (
            <div className="search-sidebar-error-state">
              <span>{messageSearchError}</span>
              <button
                type="button"
                className="shared-content-retry-btn"
                onClick={() => void loadMessageSearch({ reset: true, query })}
              >
                Retry
              </button>
            </div>
          ) : messageSearchItems.length === 0 ? (
            <div className="search-sidebar-empty-state">
              <div className="search-sidebar-empty-icon">💬</div>
              <p className="search-sidebar-empty-heading">No results found</p>
              <p className="search-sidebar-empty-hint">No messages matching &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            <div className="search-sidebar-results-wrap">
              <div className="search-sidebar-results-bar">
                <span>{messageSearchItems.length}{messageSearchHasMore ? '+' : ''} matching messages</span>
              </div>
              <div className="search-sidebar-results-list">
                {messageSearchItems.map((message) => {
                  const senderName = getMessageSenderName(message, selectedRoom, findKnownUserById);
                  const senderUser = findKnownUserById(message.senderId);
                  const isActive = message.id === activeMessageSearchId;
                  const snippet = getMessageSearchSnippet(message, query);

                  return (
                    <button
                      key={message.id}
                      type="button"
                      className={`search-result-card ${isActive ? 'active' : ''}`}
                      onClick={() => void handleJumpToSearchResult(message.id)}
                    >
                      <div className="search-result-avatar-wrap">
                        {senderUser ? (
                          renderUserAvatar(senderUser, 'user-avatar small-avatar')
                        ) : (
                          <div className="user-avatar small-avatar search-fallback-avatar">
                            {senderName.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="search-result-content">
                        <div className="search-result-header">
                          <span className="search-result-sender">{senderName}</span>
                          <span className="search-result-time">{formatMessageTime(message.timestamp)}</span>
                        </div>
                        <div className="search-result-snippet">
                          {renderHighlightedSearchText(snippet, query)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {messageSearchHasMore ? (
                <button
                  type="button"
                  className="shared-content-load-btn search-sidebar-load-more"
                  disabled={messageSearchLoading}
                  onClick={() => void loadMessageSearch()}
                >
                  {messageSearchLoading ? 'Loading...' : 'Load more results'}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </aside>
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

  const renderConversationSettingsSection = (target: ConversationTarget) => {
    const pinned = target.type === 'user' ? Boolean(target.user.pinned) : Boolean(target.room.pinned);
    const muted = target.type === 'user' ? Boolean(target.user.muted) : Boolean(target.room.muted);
    const archived = target.type === 'user' ? Boolean(target.user.archived) : Boolean(target.room.archived);
    const pendingKey =
      target.type === 'user'
        ? `user-${target.user.id}`
        : `room-${target.room.id}`;
    const pending = conversationSettingPendingKey === pendingKey;

    return (
      <section className="details-section" aria-labelledby="conversation-controls-title">
        <div className="details-section-heading">
          <h4 id="conversation-controls-title">Conversation</h4>
          {pinned ? <span>Pinned</span> : null}
        </div>
        <div className="details-control-list">
          <button
            type="button"
            className={`details-control-btn ${pinned ? 'active' : ''}`}
            disabled={pending}
            onClick={() => void handleUpdateConversationSetting(target, { pinned: !pinned })}
          >
            <PinIcon className="details-control-icon" />
            <span>{pinned ? 'Unpin chat' : 'Pin chat'}</span>
          </button>
          <button
            type="button"
            className={`details-control-btn ${muted ? 'active' : ''}`}
            disabled={pending}
            onClick={() => void handleUpdateConversationSetting(target, { muted: !muted })}
          >
            <MutedIcon className="details-control-icon" />
            <span>{muted ? 'Unmute notifications' : 'Mute notifications'}</span>
          </button>
          <button
            type="button"
            className={`details-control-btn ${archived ? 'active' : ''}`}
            disabled={pending}
            onClick={() => void handleUpdateConversationSetting(target, { archived: !archived })}
          >
            <ArchiveIcon className="details-control-icon" />
            <span>{archived ? 'Unarchive chat' : 'Archive chat'}</span>
          </button>
        </div>
        {conversationSettingsError ? (
          <div className="details-error">{conversationSettingsError}</div>
        ) : null}
      </section>
    );
  };

  const renderConversationDetails = () => {
    if (selectedUser) {
      return (
        <aside
          id="conversation-details"
          className="details-sidebar"
          aria-label="Conversation details"
        >
          <div className="details-header">
            <h3>Details</h3>
            <button
              type="button"
              className="details-close-btn"
              onClick={handleCloseConversationDetails}
              aria-label="Close conversation details"
              title="Close details"
            >
              <CloseIcon className="details-close-icon" />
            </button>
          </div>

          <div className="details-profile">
            {renderUserAvatar(selectedUser, 'user-avatar details-avatar')}
            <h4>{getUserDisplayName(selectedUser)}</h4>
            {shouldShowUsername(selectedUser) ? <span>@{selectedUser.username}</span> : null}
            <span className={`details-status ${selectedUser.online ? 'online' : 'offline'}`}>
              {getPresenceLabel(selectedUser)}
            </span>
            {selectedUser.bio?.trim() ? <p className="details-bio">{selectedUser.bio}</p> : null}
          </div>

          <section className="details-section" aria-labelledby="private-details-title">
            <h4 id="private-details-title">Account</h4>
            <div className="details-row">
              <span>Username</span>
              <strong>@{selectedUser.username}</strong>
            </div>
            <div className="details-row">
              <span>Friendship</span>
              <strong>Friend</strong>
            </div>
          </section>

          {renderConversationSettingsSection({ type: 'user', user: selectedUser })}
          {renderSharedContentSections()}
        </aside>
      );
    }

    if (selectedRoom) {
      const sortedParticipants = sortParticipantsForDetails(selectedRoom.participants);

      return (
        <aside
          id="conversation-details"
          className="details-sidebar"
          aria-label="Conversation details"
        >
          <div className="details-header">
            <h3>Details</h3>
            <button
              type="button"
              className="details-close-btn"
              onClick={handleCloseConversationDetails}
              aria-label="Close conversation details"
              title="Close details"
            >
              <CloseIcon className="details-close-icon" />
            </button>
          </div>

          <div className="details-profile">
            <div className="details-room-avatar-container">
              {renderRoomAvatar(selectedRoom, 'user-avatar room-avatar details-avatar')}
              {currentUserCanManageSelectedRoom ? (
                <label className="details-avatar-upload-overlay" title="Change group avatar">
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    disabled={groupAvatarUploading || groupSettingsSaving}
                    onChange={(e) => void handleGroupAvatarChange(e)}
                  />
                  <span>{groupAvatarUploading ? '...' : '📷'}</span>
                </label>
              ) : null}
            </div>
            {isEditingGroupName ? (
              <form
                className="details-group-name-inline-form"
                onSubmit={(e) => void handleUpdateGroupSettingsName(e)}
              >
                <input
                  type="text"
                  className="details-group-name-inline-input"
                  value={groupSettingsName}
                  onChange={(event) => {
                    setGroupSettingsError('');
                    setGroupSettingsName(event.target.value);
                  }}
                  maxLength={100}
                  disabled={groupSettingsSaving}
                  autoFocus
                  placeholder="Group name..."
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsEditingGroupName(false);
                      setGroupSettingsName(selectedRoom.name);
                    }
                  }}
                />
                <div className="details-group-name-inline-actions">
                  <button
                    type="submit"
                    className="details-group-name-btn save"
                    disabled={!canSaveGroupSettingsName || groupSettingsSaving}
                    title="Save group name"
                    aria-label="Save group name"
                  >
                    {groupSettingsPendingAction === 'rename' ? '⏳' : '✓'}
                  </button>
                  <button
                    type="button"
                    className="details-group-name-btn cancel"
                    disabled={groupSettingsSaving}
                    onClick={() => {
                      setIsEditingGroupName(false);
                      setGroupSettingsName(selectedRoom.name);
                    }}
                    title="Cancel"
                    aria-label="Cancel"
                  >
                    ✕
                  </button>
                </div>
              </form>
            ) : (
              <div className="details-group-name-row">
                <h4>{selectedRoom.name}</h4>
                {currentUserCanManageSelectedRoom ? (
                  <button
                    type="button"
                    className="details-group-name-edit-btn"
                    onClick={() => {
                      setGroupSettingsName(selectedRoom.name);
                      setGroupSettingsError('');
                      setIsEditingGroupName(true);
                    }}
                    title="Edit group name"
                    aria-label="Edit group name"
                  >
                    ✏️
                  </button>
                ) : null}
              </div>
            )}
            {currentUserMemberRole ? (
              <span className={`details-role-badge ${isCurrentUserOwner ? 'owner-badge' : isCurrentUserModerator ? 'mod-badge' : 'member-badge'}`}>
                {isCurrentUserOwner ? '👑 Owner' : isCurrentUserModerator ? '🛡️ Moderator' : 'Member'}
              </span>
            ) : null}
            <span className="details-member-count-label">{selectedRoom.participants.length} members</span>
          </div>

          <section className="details-section" aria-labelledby="group-settings-title">
            <div className="details-section-heading">
              <h4 id="group-settings-title">Group Management</h4>
              {currentUserCanManageSelectedRoom ? <span>{isCurrentUserOwner ? 'Owner' : 'Moderator'}</span> : null}
            </div>

            {currentUserCanManageSelectedRoom ? (
              <div className="details-group-management-stack">
                <button
                  type="button"
                  className="details-action-btn secondary details-invite-btn"
                  onClick={() => void handleOpenInviteModal()}
                >
                  🔗 Group Invite Link
                </button>
              </div>
            ) : (
              <div className="details-row">
                <span>Owner</span>
                <strong>{selectedRoomOwnerName || 'Owner'}</strong>
              </div>
            )}

            {groupSettingsError ? (
              <div className="details-error">{groupSettingsError}</div>
            ) : null}
          </section>

          {renderSharedContentSections()}
          {renderConversationSettingsSection({ type: 'room', room: selectedRoom })}

          {currentUserCanManageSelectedRoom ? (
            <section className="details-section" aria-labelledby="add-members-title">
              <div className="details-section-heading">
                <h4 id="add-members-title">Add Members</h4>
                {selectedAddMemberIds.length > 0 ? <span>{selectedAddMemberIds.length}</span> : null}
              </div>

              {addMemberCandidates.length === 0 ? (
                <div className="details-empty-text">All friends are already in this group.</div>
              ) : (
                <div className="details-add-member-list">
                  {addMemberCandidates.map((friend) => (
                    <label key={friend.id} className="details-add-member-option">
                      <input
                        type="checkbox"
                        checked={selectedAddMemberIds.includes(friend.id)}
                        disabled={groupSettingsSaving}
                        onChange={() => handleToggleAddRoomMember(friend.id)}
                      />
                      {renderUserAvatar(friend, 'user-avatar small-avatar')}
                      <span className="details-add-member-copy">
                        <strong>{getUserDisplayName(friend)}</strong>
                        <small>@{friend.username}</small>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="details-action-btn"
                disabled={!canAddRoomMembers}
                onClick={() => void handleAddRoomMembers()}
              >
                {groupSettingsPendingAction === 'add' ? 'Adding...' : 'Add to group'}
              </button>
            </section>
          ) : null}

          <section className="details-section" aria-labelledby="group-members-title">
            <button
              type="button"
              className="details-section-toggle-btn"
              onClick={() => setGroupMembersExpanded((current) => !current)}
              aria-expanded={groupMembersExpanded}
              aria-controls="group-members-list"
            >
              <div className="details-section-heading">
                <h4 id="group-members-title">Members</h4>
                <span>{selectedRoom.participants.length}</span>
              </div>
              <ChevronDownIcon className={`details-toggle-icon ${groupMembersExpanded ? 'expanded' : ''}`} />
            </button>
            {groupMembersExpanded ? (
              <div id="group-members-list" className="details-member-list">
                {sortedParticipants.map(renderDetailsMemberItem)}
              </div>
            ) : null}
          </section>

          <section className="details-section details-danger-zone" aria-labelledby="leave-group-title">
            <h4 id="leave-group-title">{isCurrentUserOwner ? 'Danger Zone' : 'Leave Group'}</h4>
            {isCurrentUserOwner ? (
              <button
                type="button"
                className="details-action-btn danger"
                disabled={groupSettingsSaving}
                onClick={() => void handleDeleteSelectedGroup()}
              >
                {groupSettingsPendingAction === 'delete-room' ? 'Dissolving...' : 'Dissolve Group'}
              </button>
            ) : null}
            <button
              type="button"
              className={`details-action-btn ${isCurrentUserOwner ? 'ghost-danger' : 'danger'}`}
              disabled={groupSettingsSaving}
              onClick={() => void handleLeaveSelectedGroup()}
            >
              {groupSettingsPendingAction === 'leave' ? 'Leaving...' : 'Leave Group'}
            </button>
          </section>
        </aside>
      );
    }

    return null;
  };

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div className="header-left">
          <h2>Chat App</h2>
        </div>
        <nav className="header-right" aria-label="Account navigation">
          <button
            type="button"
            className="header-icon-btn theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <SunIcon className="header-icon" /> : <MoonIcon className="header-icon" />}
          </button>

          <button
            type="button"
            className={`header-icon-btn ${mainView === 'friends' ? 'active' : ''}`}
            onClick={handleOpenFriendsPanel}
            aria-pressed={mainView === 'friends'}
            aria-label="Friends list"
            title="Friends list"
          >
            <FriendsIcon className="header-icon" />
          </button>

          <div className="friend-request-menu">
            <button
              type="button"
              className={`header-icon-btn ${soundMuted ? 'muted' : ''}`}
              onClick={() => soundService.toggleMuted()}
              aria-label={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
              title={soundMuted ? 'Sounds muted (click to unmute)' : 'Sounds active (click to mute)'}
            >
              {soundMuted ? <MuteIcon className="header-icon" /> : <SoundIcon className="header-icon" />}
            </button>

            <button
              type="button"
              className={`header-icon-btn ${mainView === 'requests' ? 'active' : ''}`}
              onClick={handleOpenRequestsPanel}
              aria-pressed={mainView === 'requests'}
              aria-label={`Friend requests, ${friendRequestBadgeCount} pending`}
              title="Friend requests"
            >
              <FriendRequestIcon className="header-icon" />
              {friendRequestBadgeCount > 0 ? (
                <span className="request-badge">{friendRequestBadgeCount}</span>
              ) : null}
            </button>
          </div>

          <div className="profile-menu">
            <button
              type="button"
              className={`header-icon-btn profile-icon-btn ${profileMenuOpen ? 'active' : ''}`}
              onClick={handleToggleProfileMenu}
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              aria-label={`Profile menu for ${currentUserDisplayName}`}
              title="Profile"
            >
              <ProfileIcon className="header-icon" />
              <span
                className={`profile-presence-dot ${currentUserOnline ? 'online' : 'offline'}`}
                aria-hidden="true"
              />
            </button>

            {profileMenuOpen ? (
              <div className="profile-dropdown" role="menu">
                <div className="profile-summary">
                  {renderUserAvatar(currentUser, 'user-avatar small-avatar')}
                  <div className="profile-copy">
                    <strong>{currentUserDisplayName}</strong>
                    {currentUser?.username ? <span>@{currentUser.username}</span> : null}
                  </div>
                </div>
                <span
                  className={`account-status ${currentUserOnline ? 'online' : 'offline'}`}
                  aria-live="polite"
                  title={currentUserOnline ? 'Online' : 'Offline'}
                >
                  <span className="account-status-dot" aria-hidden="true" />
                  {currentUserOnline ? 'Online' : 'Offline'}
                </span>
                <button
                  type="button"
                  onClick={() => soundService.toggleMuted()}
                  className="profile-sound-btn"
                  role="menuitem"
                >
                  {soundMuted ? <MuteIcon className="profile-notification-icon" /> : <SoundIcon className="profile-notification-icon" />}
                  <span>{soundMuted ? 'Sounds: Muted' : 'Sounds: Enabled'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (browserNotificationPermission === 'granted') {
                      soundService.playNotificationSound();
                    } else {
                      void requestBrowserNotificationPermission();
                    }
                  }}
                  className="profile-notification-btn"
                  role="menuitem"
                  disabled={
                    !isBrowserNotificationSupported() ||
                    browserNotificationPermission === 'denied'
                  }
                  title={
                    browserNotificationPermission === 'granted'
                      ? 'Play notification sound'
                      : getBrowserNotificationStatusLabel(browserNotificationPermission)
                  }
                >
                  <BellIcon className="profile-notification-icon" />
                  <span>{getBrowserNotificationStatusLabel(browserNotificationPermission)}</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenProfileEditor}
                  className="profile-edit-btn"
                  role="menuitem"
                >
                  Edit profile
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="profile-logout-btn"
                  role="menuitem"
                >
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </nav>
      </header>

      <div className="chat-container">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-title-row">
              <h3>Chats</h3>
              <button
                type="button"
                className="new-group-btn"
                onClick={handleOpenCreateGroup}
                aria-label="Create group"
                title="Create group"
              >
                <GroupPlusIcon className="new-group-icon" />
              </button>
            </div>
            <div className="user-search" role="search">
              <input
                type="search"
                value={userSearchQuery}
                onChange={(event) => handleUserSearchChange(event.target.value)}
                className="user-search-input"
                placeholder="Search username to add"
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
            {!hasUserSearch ? (
              <div className="conversation-filter" role="tablist" aria-label="Conversation filter">
                {CONVERSATION_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    role="tab"
                    className={`conversation-filter-btn ${conversationFilter === filter.value ? 'active' : ''}`}
                    aria-selected={conversationFilter === filter.value}
                    onClick={() => setConversationFilter(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            ) : null}
            {conversationSettingsError ? (
              <div className="conversation-settings-error">{conversationSettingsError}</div>
            ) : null}
          </div>
          <div className="user-list" aria-busy={sidebarBusy} aria-label="Chat list">
            {hasUserSearch ? renderSidebarSearchList() : renderSidebarChatList()}
          </div>
        </aside>

        <main className={`chat-area ${mainView !== 'chat' ? 'main-view-open' : ''}`}>
          {mainView === 'friends' ? (
            renderFriendsPanel()
          ) : mainView === 'requests' ? (
            renderRequestsPanel()
          ) : selectedConversationOpen ? (
            <>
              <div className="chat-area-header">
                <div className="selected-user">
                  {selectedRoom ? (
                    <div className="user-avatar room-avatar">
                      {getRoomInitial(selectedRoom)}
                    </div>
                  ) : (
                    renderUserAvatar(selectedUser)
                  )}
                  <div className="selected-user-copy">
                    <div className="user-name">{selectedConversationName}</div>
                    {selectedRoom ? (
                      <div className="user-meta">
                        <span className="user-status">
                          {selectedRoom.participants.length} members
                        </span>
                      </div>
                    ) : selectedUser ? (
                      <div className="user-meta">
                        <span className={`user-status ${selectedUser.online ? 'online' : 'offline'}`}>
                          {getPresenceLabel(selectedUser)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="conversation-header-actions">
                  {selectedUser ? (
                    <>
                      <button
                        type="button"
                        className="conversation-call-btn"
                        onClick={() => handleStartCall('AUDIO')}
                        disabled={!canStartPrivateCall}
                        aria-label={`Start audio call with ${getUserDisplayName(selectedUser)}`}
                        title="Audio call"
                      >
                        <PhoneIcon className="conversation-call-icon" />
                      </button>
                      <button
                        type="button"
                        className="conversation-call-btn"
                        onClick={() => handleStartCall('VIDEO')}
                        disabled={!canStartPrivateCall}
                        aria-label={`Start video call with ${getUserDisplayName(selectedUser)}`}
                        title="Video call"
                      >
                        <VideoCallIcon className="conversation-call-icon" />
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className={`conversation-search-toggle ${detailsOpen && rightSidebarTab === 'search' ? 'active' : ''}`}
                    onClick={handleToggleMessageSearch}
                    aria-label={detailsOpen && rightSidebarTab === 'search' ? 'Close message search' : 'Search in conversation'}
                    title="Search in conversation"
                  >
                    <SearchIcon className="conversation-search-icon" />
                  </button>
                  <button
                    type="button"
                    className={`conversation-details-toggle ${detailsOpen && rightSidebarTab === 'details' ? 'active' : ''}`}
                    onClick={handleToggleConversationDetails}
                    aria-label={detailsOpen && rightSidebarTab === 'details' ? 'Hide conversation details' : 'Show conversation details'}
                    aria-expanded={detailsOpen && rightSidebarTab === 'details'}
                    aria-controls="conversation-details"
                    title={detailsOpen && rightSidebarTab === 'details' ? 'Hide details' : 'Show details'}
                  >
                    <InfoIcon className="conversation-details-icon" />
                  </button>
                </div>
              </div>

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
                    {messageListItems.map((item) => {
                      if (item.type === 'date') {
                        return (
                          <div key={item.key} className="message-date-divider">
                            <span>{item.label}</span>
                          </div>
                        );
                      }

                      if (item.type === 'unread') {
                        return (
                          <div
                            key={item.key}
                            ref={unreadDividerRef}
                            className="message-unread-divider"
                          >
                            <span>Unread messages</span>
                          </div>
                        );
                      }

                      const { message, groupedWithPrevious, groupedWithNext, showSender } = item;
                      const isSentByCurrentUser = message.senderId === currentUser?.id;
                      const hasVisibleMessageTime =
                        !groupedWithNext || message.deliveryStatus === 'failed';
                      const isLatestSeenOutgoingMessage =
                        Boolean(selectedUser) &&
                        isSentByCurrentUser &&
                        message.id > 0 &&
                        message.id === latestSeenOutgoingMessageId;
                      const isLatestOutgoingMessage =
                        isSentByCurrentUser &&
                        (message.id > 0
                          ? message.id === latestOutgoingMessageId
                          : message.clientId === latestOutgoingMessageId);
                      const deliveryStatusLabel = isSentByCurrentUser
                        ? getDeliveryStatusLabel(
                          message,
                          selectedUser,
                          isLatestSeenOutgoingMessage,
                          isLatestOutgoingMessage
                        )
                        : '';
                      const groupSeenByUsers =
                        selectedRoom && isSentByCurrentUser && message.id > 0 && !message.recalled
                          ? latestRoomSeenByByMessageId[message.id] ?? []
                          : [];
                      const groupSeenByLoading =
                        selectedRoom &&
                        isSentByCurrentUser &&
                        message.id > 0 &&
                        !message.recalled &&
                        groupSeenByUsers.length === 0 &&
                        seenByLoadingMessageIds.includes(message.id);
                      const isMessageSearchMatch = Boolean(
                        detailsOpen &&
                        rightSidebarTab === 'search' &&
                        messageSearchQuery.trim() &&
                        messageSearchResultIds.has(message.id)
                      );
                      const isCallEventMessage = isCallMessage(message);

                      if (isCallEventMessage) {
                        return (
                          <div
                            key={item.key}
                            data-message-id={message.id > 0 ? message.id : undefined}
                            className={`message call-system ${isMessageSearchMatch ? 'message-search-match' : ''} ${highlightedMessageId === message.id ? 'highlighted' : ''}`}
                          >
                            {renderCallMessageBody(message)}
                          </div>
                        );
                      }

                      const isMentioned = Boolean(
                        !isSentByCurrentUser && (
                          (currentUser && message.mentionedUserIds?.includes(currentUser.id)) ||
                          (currentUser && message.mentionedUsernames?.includes(currentUser.username)) ||
                          (selectedRoom && message.content && /@all\b/i.test(message.content))
                        )
                      );
                      const senderUser = !isSentByCurrentUser
                        ? getMessageSenderUser(message, selectedUser, selectedRoom, findKnownUserById)
                        : null;

                      return (
                        <div
                          key={item.key}
                          data-message-id={message.id > 0 ? message.id : undefined}
                          className={`message ${isSentByCurrentUser ? 'sent' : 'received'} ${message.deliveryStatus ?? ''} ${groupedWithPrevious ? 'grouped-with-previous' : ''} ${groupedWithNext ? 'grouped-with-next' : ''} ${hasVisibleMessageTime ? 'has-visible-time' : ''} ${isMessageSearchMatch ? 'message-search-match' : ''} ${highlightedMessageId === message.id ? 'highlighted' : ''} ${isMentioned ? 'message-mentioned' : ''}`}
                        >
                          {showSender ? (
                            <div className="message-sender">
                              {getMessageSenderName(message, selectedRoom, findKnownUserById)}
                            </div>
                          ) : null}
                          <div className="message-bubble-row">
                            {!isSentByCurrentUser && senderUser ? (
                              <div className="message-sender-avatar-wrap">
                                {!groupedWithNext ? (
                                  <button
                                    type="button"
                                    className="message-avatar-btn"
                                    onClick={() => handleOpenUserProfile(senderUser)}
                                    title={getUserDisplayName(senderUser)}
                                    aria-label={`View profile of ${getUserDisplayName(senderUser)}`}
                                  >
                                    {renderUserAvatar(senderUser, 'user-avatar message-bubble-avatar')}
                                  </button>
                                ) : (
                                  <div className="message-avatar-spacer" aria-hidden="true" />
                                )}
                              </div>
                            ) : null}
                            {isSentByCurrentUser ? renderMessageActions(message, isSentByCurrentUser) : null}
                            <div className="message-bubble-wrap">
                              {renderMessageBody(message)}
                              {renderMessageReactions(message)}
                            </div>
                            {!isSentByCurrentUser ? renderMessageActions(message, isSentByCurrentUser) : null}
                          </div>
                          {hasVisibleMessageTime ? (
                            <div className="message-time">
                              <span>{formatMessageTime(message.timestamp)}</span>
                              {isSentByCurrentUser ? (
                                <>
                                  {deliveryStatusLabel ? (
                                    <span className={`message-read-status ${message.deliveryStatus ?? ''}`}>
                                      {deliveryStatusLabel}
                                    </span>
                                  ) : null}
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
                          ) : null}
                          {isLatestSeenOutgoingMessage ? (
                            <div className="message-seen-avatar-row">
                              {renderUserAvatar(selectedUser, 'user-avatar message-seen-avatar')}
                            </div>
                          ) : null}
                          {groupSeenByUsers.length > 0 ? (
                            renderGroupSeenBy(message, groupSeenByUsers)
                          ) : groupSeenByLoading ? (
                            <div className="message-seen-by-row loading" aria-label="Loading seen by">
                              <span className="message-seen-by-loading-dot" />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </>
                )}
                {!messagesLoading && typingIndicatorLabel ? (
                  <div className="typing-indicator">{typingIndicatorLabel}</div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="message-input-form">
                <input
                  ref={mediaFileInputRef}
                  type="file"
                  className="media-file-input"
                  accept={MEDIA_ACCEPT}
                  onChange={handleMediaFileChange}
                />
                <input
                  ref={docFileInputRef}
                  type="file"
                  className="media-file-input"
                  accept="*/*"
                  onChange={handleMediaFileChange}
                />

                {activeReplyPreview ? (
                  <div className="replying-composer-preview">
                    <div className="replying-composer-copy">
                      <span>Replying to {activeReplyPreview.senderName}</span>
                      <p>{activeReplyPreview.content}</p>
                    </div>
                    <button
                      type="button"
                      className="replying-composer-close"
                      onClick={handleCancelReply}
                      aria-label="Cancel reply"
                      title="Cancel reply"
                    >
                      <CloseIcon className="replying-composer-close-icon" />
                    </button>
                  </div>
                ) : null}

                {pendingMedia || mediaError ? (
                  <div className="pending-media-wrap">
                    {pendingMedia ? (
                      <div className="pending-media-preview">
                        {pendingMedia.type === 'FILE' ? (
                          <div className={`pending-media-file-badge ${getFileBadgeColor(getFileExtension(pendingMedia.file.name))}`}>
                            <DocumentIcon className="pending-file-icon" />
                            <span className="pending-file-ext">{getFileExtension(pendingMedia.file.name)}</span>
                          </div>
                        ) : pendingMedia.resourceType === 'image' ? (
                          <img src={pendingMedia.previewUrl} alt="Selected media preview" />
                        ) : (
                          <video src={pendingMedia.previewUrl} muted preload="metadata" />
                        )}
                        <div className="pending-media-copy">
                          <strong>{pendingMedia.file.name}</strong>
                          <span>{mediaUploading ? 'Uploading...' : `${formatFileSize(pendingMedia.file.size)} • Ready to send`}</span>
                        </div>
                        <button
                          type="button"
                          className="pending-media-remove"
                          onClick={clearPendingMedia}
                          disabled={mediaUploading}
                          aria-label="Remove selected media"
                        >
                          <CloseIcon className="pending-media-remove-icon" />
                        </button>
                      </div>
                    ) : null}
                    {mediaError ? <div className="media-error-text">{mediaError}</div> : null}
                  </div>
                ) : null}

                <div className="message-input-row">
                  <div className="message-composer">
                    <button
                      type="button"
                      className="composer-icon-btn"
                      onClick={handleOpenMediaPicker}
                      disabled={mediaUploading}
                      aria-label="Attach image or video"
                      title="Attach photo/video"
                    >
                      <MediaIcon className="composer-icon" />
                    </button>
                    <button
                      type="button"
                      className="composer-icon-btn"
                      onClick={handleOpenDocPicker}
                      disabled={mediaUploading}
                      aria-label="Attach file or document"
                      title="Attach file"
                    >
                      <PaperclipIcon className="composer-icon" />
                    </button>
                    <VoiceRecorderButton
                      disabled={mediaUploading}
                      onRecorded={handleVoiceRecorded}
                    />
                    <button
                      ref={emojiButtonRef}
                      type="button"
                      className={`composer-icon-btn emoji-toggle-btn ${emojiPickerOpen ? 'active' : ''}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={handleToggleEmojiPicker}
                      disabled={mediaUploading}
                      aria-label={emojiPickerOpen ? 'Close emoji picker' : 'Open emoji picker'}
                      aria-expanded={emojiPickerOpen}
                      aria-controls="emoji-picker-panel"
                      aria-haspopup="dialog"
                      title="Emoji"
                    >
                      <EmojiIcon className="composer-icon" />
                    </button>
                    <textarea
                      ref={messageInputRef}
                      value={messageInput}
                      onChange={(e) => handleMessageInputChange(e.target.value)}
                      onKeyDown={handleMessageInputKeyDown}
                      onKeyUp={updateMessageInputSelection}
                      onClick={updateMessageInputSelection}
                      onSelect={updateMessageInputSelection}
                      placeholder={`Message ${selectedConversationName}`}
                      className="message-input"
                      rows={1}
                      disabled={mediaUploading}
                    />

                    {mentionQuery !== null && mentionCandidates.length > 0 ? (
                      <div className="mention-autocomplete-dropdown" role="listbox" aria-label="Mention members">
                        <div className="mention-dropdown-header">Mention member</div>
                        <div className="mention-dropdown-list">
                          {mentionCandidates.map((c, idx) => (
                            <button
                              key={`${c.id}-${c.username}`}
                              type="button"
                              className={`mention-dropdown-item ${idx === mentionActiveIndex ? 'active' : ''}`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                insertMention(c);
                              }}
                            >
                              <div className={`mention-dropdown-avatar ${c.isAll ? 'all' : ''}`}>
                                {c.isAll ? '@' : c.username.charAt(0).toUpperCase()}
                              </div>
                              <div className="mention-dropdown-info">
                                <span className="mention-dropdown-name">{c.fullName}</span>
                                <span className="mention-dropdown-username">@{c.username}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {emojiPickerOpen ? (
                      <div
                        ref={emojiPickerRef}
                        id="emoji-picker-panel"
                        className="emoji-picker-panel"
                        role="dialog"
                        aria-label="Emoji picker"
                      >
                        <div className="emoji-picker-header">Emoji</div>
                        <div className="emoji-category-list">
                          {EMOJI_CATEGORIES.map((category) => (
                            <section key={category.name} className="emoji-category">
                              <div className="emoji-category-title">{category.name}</div>
                              <div className="emoji-grid">
                                {category.emojis.map((emoji) => (
                                  <button
                                    key={`${category.name}-${emoji.symbol}`}
                                    type="button"
                                    className="emoji-option-btn"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => handleInsertEmoji(emoji.symbol)}
                                    aria-label={`Insert ${emoji.label}`}
                                    title={emoji.label}
                                  >
                                    {emoji.symbol}
                                  </button>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    className="send-btn"
                    disabled={(!messageInput.trim() && !pendingMedia) || mediaUploading}
                  >
                    {mediaUploading ? 'Uploading' : 'Send'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="no-chat-selected">
              <p>Select a friend or group to start chatting</p>
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
                <div className="user-avatar profile-avatar-preview">
                  {profileAvatarPreview ? (
                    <img src={profileAvatarPreview} alt="" />
                  ) : (
                    getUserInitial(currentUser)
                  )}
                </div>
                <div className="profile-avatar-actions">
                  <label className="avatar-upload-btn">
                    <input
                      type="file"
                      accept={AVATAR_ACCEPT}
                      onChange={handleProfileAvatarChange}
                      disabled={profileSaving}
                    />
                    Change avatar
                  </label>
                  <small>JPG, PNG, GIF, or WebP. Max {MAX_AVATAR_SIZE_MB}MB.</small>
                </div>
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
                      value={
                        groupInviteData?.inviteUrl ||
                        `${window.location.origin}/invite/${groupInviteData?.inviteCode || selectedRoom.inviteCode || ''}`
                      }
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
    </div>
  );
}
