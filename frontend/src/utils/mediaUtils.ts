/**
 * File / media size, type, and extension utilities.
 */
import type { PendingMedia, CloudinaryUploadResult } from '../types/chat.types';
import type { Message, MediaAttachment, LinkPreview } from '../types';
import {
    MAX_IMAGE_MEDIA_SIZE_BYTES,
    MAX_VIDEO_MEDIA_SIZE_BYTES,
    MAX_IMAGE_MEDIA_SIZE_MB,
    MAX_VIDEO_MEDIA_SIZE_MB,
} from '../constants/chatConstants';

// ─── File sizes ───────────────────────────────────────────────────────────────

export function formatFileSize(bytes?: number | null) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(filenameOrFormat?: string | null) {
    if (!filenameOrFormat) return 'FILE';
    const clean = filenameOrFormat.split('?')[0].split('#')[0];
    const parts = clean.split('.');
    if (parts.length > 1) return parts[parts.length - 1].toUpperCase().slice(0, 5);
    return clean.toUpperCase().slice(0, 5);
}

export function getFileBadgeColor(formatOrExt?: string | null) {
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

export function getDownloadFilename(message: { content?: string | null; mediaFormat?: string | null; mediaUrl?: string | null }): string {
    if (message.content?.trim()) return message.content.trim();
    const ext = getFileExtension(message.mediaFormat || message.mediaUrl);
    return `attachment.${ext.toLowerCase()}`;
}

export function getFileFormat(file: File) {
    const ext = file.name.split('.').pop();
    return ext ? ext.toLowerCase() : undefined;
}

// ─── Media validation ─────────────────────────────────────────────────────────

export function getMediaSizeError(file: File, pendingMediaType: Pick<PendingMedia, 'type'>) {
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

// ─── Cloudinary ───────────────────────────────────────────────────────────────

export function cloudinaryResultToMedia(result: CloudinaryUploadResult): MediaAttachment {
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

// ─── Link preview ─────────────────────────────────────────────────────────────

export function hasLinkPreview(preview?: LinkPreview | null) {
    return Boolean(preview?.url);
}

export function isSharedLinkMessage(message: Message) {
    return !message.recalled && hasLinkPreview(message.linkPreview);
}

export function getLinkPreviewDomain(preview?: LinkPreview | null) {
    const explicit = preview?.domain?.trim();
    if (explicit) return explicit;
    const url = preview?.url?.trim();
    if (!url) return '';
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
