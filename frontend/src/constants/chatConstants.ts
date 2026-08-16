/**
 * Application-level constants for the chat feature.
 * Keep numeric tuning values and static data here; import into ChatPage.tsx.
 */
import type { ConversationFilter } from '../types/chat.types';

// ─── Timing ───────────────────────────────────────────────────────────────────
export const STOP_TYPING_DELAY_MS = 1500;
export const USER_SEARCH_DEBOUNCE_MS = 300;
export const REMOTE_TYPING_VISIBLE_MS = 2500;
export const OPTIMISTIC_SEND_TIMEOUT_MS = 10000;
export const MESSAGE_GROUP_THRESHOLD_MS = 5 * 60 * 1000;
export const MESSAGE_JUMP_HIGHLIGHT_MS = 2200;
export const BROWSER_NOTIFICATION_CLOSE_MS = 9000;
export const CALL_RECONNECT_TIMEOUT_MS = 10000;

// ─── Pagination ───────────────────────────────────────────────────────────────
export const MESSAGE_PAGE_SIZE = 30;
export const SHARED_CONTENT_PAGE_SIZE = 12;
export const MESSAGE_SEARCH_PAGE_SIZE = 12;
export const MESSAGE_AROUND_PAGE_SIZE = 30;

// ─── Scroll ────────────────────────────────────────────────────────────────────
export const LOAD_OLDER_SCROLL_THRESHOLD = 80;
export const READ_BOTTOM_THRESHOLD = 96;
export const AUTO_SCROLL_BOTTOM_THRESHOLD = 180;

// ─── Groups / Validation ──────────────────────────────────────────────────────
export const MIN_GROUP_MEMBERS = 3;
export const MIN_GROUP_INVITED_MEMBERS = MIN_GROUP_MEMBERS - 1;
export const BIO_MAX_LENGTH = 160;

// ─── File / Media Limits ──────────────────────────────────────────────────────
export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
export const MAX_AVATAR_SIZE_MB = MAX_AVATAR_SIZE_BYTES / 1024 / 1024;
export const MAX_IMAGE_MEDIA_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_MEDIA_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_MEDIA_SIZE_MB = MAX_IMAGE_MEDIA_SIZE_BYTES / 1024 / 1024;
export const MAX_VIDEO_MEDIA_SIZE_MB = MAX_VIDEO_MEDIA_SIZE_BYTES / 1024 / 1024;

// ─── Accept Strings ───────────────────────────────────────────────────────────
export const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const AVATAR_ACCEPT = ACCEPTED_AVATAR_TYPES.join(',');
export const MEDIA_ACCEPT = 'image/*,video/*';

// ─── Regex ────────────────────────────────────────────────────────────────────
export const TEXT_URL_REGEX = /(https?:\/\/[^\s<>'"` + '`' + `]+)/gi;

// ─── Skeleton Keys ────────────────────────────────────────────────────────────
export const USER_SKELETON_KEYS = ['user-skeleton-1', 'user-skeleton-2', 'user-skeleton-3'];
export const MESSAGE_SKELETON_KEYS = [
    'message-skeleton-1',
    'message-skeleton-2',
    'message-skeleton-3',
    'message-skeleton-4',
];

// ─── UI Lists ─────────────────────────────────────────────────────────────────
export const CONVERSATION_FILTERS: Array<{ value: ConversationFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread' },
    { value: 'archived', label: 'Archived' },
];

export const QUICK_REACTION_EMOJIS = ['👍', '💜', '😂', '😮', '😢', '🔥'] as const;

export const EMOJI_CATEGORIES = [
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

// ─── Call ─────────────────────────────────────────────────────────────────────
export const MAX_VOICE_DURATION_MS = 120_000; // 2 minutes
