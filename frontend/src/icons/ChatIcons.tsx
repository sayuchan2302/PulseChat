/**
 * Shared SVG icon components for the chat feature.
 * All icons follow a uniform `HeaderIconProps` interface.
 */
import type { HeaderIconProps } from '../types/chat.types';

// ─── Shared SVG attributes ────────────────────────────────────────────────────
const SVG_BASE = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
};

export function SoundIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
    );
}

export function MuteIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
    );
}

export function SunIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
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

export function MoonIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
    );
}

export function FriendsIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

export function FriendRequestIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <path d="M19 8v6" />
            <path d="M22 11h-6" />
        </svg>
    );
}

export function RefreshIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M21 12a9 9 0 0 1-15.5 6.25" />
            <path d="M3 12A9 9 0 0 1 18.5 5.75" />
            <path d="M18 3v4h4" />
            <path d="M6 21v-4H2" />
        </svg>
    );
}

export function GroupPlusIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M20 8v6" />
            <path d="M23 11h-6" />
        </svg>
    );
}

export function ProfileIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="10" r="3" />
            <path d="M7 18a5.5 5.5 0 0 1 10 0" />
        </svg>
    );
}

export function BellIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
    );
}

export function InfoIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
        </svg>
    );
}

export function MinimizeIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M5 12h14" />
        </svg>
    );
}

export function ExpandIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M8 3H3v5" />
            <path d="M21 8V3h-5" />
            <path d="M3 16v5h5" />
            <path d="M16 21h5v-5" />
        </svg>
    );
}

export function PhoneIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.66 2.8a2 2 0 0 1-.45 2.11L8.09 9.86a16 16 0 0 0 6.05 6.05l1.23-1.23a2 2 0 0 1 2.11-.45c.9.31 1.84.53 2.8.66A2 2 0 0 1 22 16.92z" />
        </svg>
    );
}

export function VideoCallIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M15 10 20 7v10l-5-3" />
            <rect x="3" y="6" width="12" height="12" rx="2" />
        </svg>
    );
}

export function ScreenShareIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
            <path d="M12 13V8" />
            <path d="m9 10 3-3 3 3" />
        </svg>
    );
}

export function MicIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <path d="M12 19v3" />
        </svg>
    );
}

export function MicOffIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="m2 2 20 20" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
            <path d="M15 9.34V5a3 3 0 0 0-5.63-1.44" />
            <path d="M19 10v2a7 7 0 0 1-.74 3.13" />
            <path d="M5 10v2a7 7 0 0 0 11.67 5.22" />
            <path d="M12 19v3" />
        </svg>
    );
}

export function VideoOffIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="m2 2 20 20" />
            <path d="M15 10 20 7v8.5" />
            <path d="M11.65 6H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 1.73-1" />
        </svg>
    );
}

export function SearchIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
        </svg>
    );
}

export function JumpIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M7 17 17 7" />
            <path d="M9 7h8v8" />
            <path d="M5 5v14h14" />
        </svg>
    );
}

export function CloseIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
        </svg>
    );
}

export function EmojiIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <path d="M9 9h.01" />
            <path d="M15 9h.01" />
        </svg>
    );
}

export function MediaIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <rect width="18" height="18" x="3" y="3" rx="3" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L7 19" />
            <path d="M16 5v4" />
            <path d="M18 7h-4" />
        </svg>
    );
}

export function DocumentIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
        </svg>
    );
}

export function DownloadIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    );
}

export function PaperclipIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
    );
}

export function ReplyIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="m9 17-5-5 5-5" />
            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
    );
}

export function CopyIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <rect width="14" height="14" x="8" y="8" rx="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
    );
}

export function ForwardIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <polyline points="15 10 20 5 15 0" transform="translate(0,2)" />
            <path d="M4 20v-7a7 7 0 0 1 7-7h9" />
        </svg>
    );
}

export function RecallIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v5" />
            <path d="M14 11v5" />
        </svg>
    );
}

export function MoreIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
        </svg>
    );
}

export function PinIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M12 17v5" />
            <path d="M9 3h6l1 7 3 3v2H5v-2l3-3 1-7Z" />
        </svg>
    );
}

export function MutedIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            <path d="m17 9 4 4" />
            <path d="m21 9-4 4" />
        </svg>
    );
}

export function ArchiveIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <rect x="3" y="4" width="18" height="4" rx="1" />
            <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
            <path d="M10 12h4" />
        </svg>
    );
}

export function ChevronDownIcon({ className }: HeaderIconProps) {
    return (
        <svg className={className} {...SVG_BASE}>
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}
