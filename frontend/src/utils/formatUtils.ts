/**
 * Date / time / text formatting utilities.
 */


// ─── Timestamp helpers ────────────────────────────────────────────────────────

export function getTimestampValue(timestamp?: string) {
    if (!timestamp) return 0;
    const v = Date.parse(timestamp);
    return Number.isNaN(v) ? 0 : v;
}

// ─── Date-key helpers ─────────────────────────────────────────────────────────

export function getLocalDateKeyFromDate(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getLocalDateKey(timestamp: string) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return getLocalDateKeyFromDate(date);
}

// ─── Human-readable time formatters ──────────────────────────────────────────

export function formatRelativeTime(timestamp?: string) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const secondsDiff = Math.round((date.getTime() - Date.now()) / 1000);
    if (secondsDiff > 0) return 'just now';
    const abs = Math.abs(secondsDiff);
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (abs < 60) return 'just now';
    if (abs < 3600) return fmt.format(Math.round(secondsDiff / 60), 'minute');
    if (abs < 86400) return fmt.format(Math.round(secondsDiff / 3600), 'hour');
    if (abs < 2592000) return fmt.format(Math.round(secondsDiff / 86400), 'day');
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function formatSidebarTime(timestamp?: string) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';

    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0) return 'now';

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return 'now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;

    const weeks = Math.floor(days / 7);
    if (weeks < 52) return `${weeks}w`;

    const years = Math.floor(days / 365);
    return `${years}y`;
}

export function formatMessageDateDivider(timestamp: string) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const key = getLocalDateKey(timestamp);
    if (key === getLocalDateKeyFromDate(today)) return 'Today';
    if (key === getLocalDateKeyFromDate(yesterday)) return 'Yesterday';
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    }).format(date);
}

export function formatMessageTime(timestamp: string) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function formatCallTimer(totalSeconds: number) {
    const s = Math.max(totalSeconds, 0);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// ─── Text/URL helpers ─────────────────────────────────────────────────────────

export function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function trimUrlToken(rawUrl: string) {
    let url = rawUrl;
    while (url && /[.,!?;:)\]}]/.test(url.charAt(url.length - 1))) { url = url.slice(0, -1); }
    return url;
}

export function getMediaDeviceLabel(device: MediaDeviceInfo, index: number) {
    if (device.label) return device.label;
    return `${device.kind === 'audioinput' ? 'Microphone' : 'Camera'} ${index + 1}`;
}
