import { useCallback } from 'react';
import type React from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { PendingMedia } from '../types/chat.types';

interface Options {
  mediaFileInputRef: MutableRefObject<HTMLInputElement | null>;
  docFileInputRef: MutableRefObject<HTMLInputElement | null>;
  setEmojiPickerOpen: Dispatch<SetStateAction<boolean>>;
  setMediaError: Dispatch<SetStateAction<string>>;
  setPendingMedia: Dispatch<SetStateAction<PendingMedia | null>>;
  getPendingMediaType: (file: File) => Omit<PendingMedia, 'file' | 'previewUrl'> | null;
  getMediaSizeError: (file: File, media: Omit<PendingMedia, 'file' | 'previewUrl'>) => string | null;
}

const GENERIC_CLIPBOARD_NAME_PATTERN = /^(image|blob|clipboard|pasted[-_ ]?image)(\.[a-z0-9]+)?$/i;

function formatClipboardTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function resolveExtensionFromMime(mimeType: string, fallbackName: string): string {
  const nameMatch = fallbackName.match(/\.([a-z0-9]+)$/i);
  if (nameMatch) {
    return nameMatch[1].toLowerCase();
  }
  const normalizedMime = mimeType.toLowerCase();
  if (normalizedMime === 'image/png') return 'png';
  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') return 'jpg';
  if (normalizedMime === 'image/webp') return 'webp';
  if (normalizedMime === 'image/gif') return 'gif';
  const slashIndex = normalizedMime.indexOf('/');
  return slashIndex >= 0 ? normalizedMime.slice(slashIndex + 1).replace(/[^a-z0-9]/g, '') || 'bin' : 'bin';
}

export function normalizePastedFile(file: File): File {
  const trimmedName = (file.name || '').trim();
  if (trimmedName && !GENERIC_CLIPBOARD_NAME_PATTERN.test(trimmedName)) {
    return file;
  }

  const ext = resolveExtensionFromMime(file.type || '', trimmedName);
  const prefix = (file.type || '').startsWith('image/') ? 'screenshot' : 'clipboard';
  const nextName = `${prefix}-${formatClipboardTimestamp()}.${ext}`;

  try {
    return new File([file], nextName, {
      type: file.type,
      lastModified: file.lastModified || Date.now(),
    });
  } catch {
    return file;
  }
}

export function useMediaPicker({
  mediaFileInputRef,
  docFileInputRef,
  setEmojiPickerOpen,
  setMediaError,
  setPendingMedia,
  getPendingMediaType,
  getMediaSizeError,
}: Options) {
  const handleOpenMediaPicker = useCallback(() => {
    setEmojiPickerOpen(false);
    setMediaError('');
    mediaFileInputRef.current?.click();
  }, [mediaFileInputRef, setEmojiPickerOpen, setMediaError]);

  const handleOpenDocPicker = useCallback(() => {
    setEmojiPickerOpen(false);
    setMediaError('');
    docFileInputRef.current?.click();
  }, [docFileInputRef, setEmojiPickerOpen, setMediaError]);

  const handleFileSelected = useCallback((file: File) => {
    const type = getPendingMediaType(file);
    if (!type) {
      setMediaError('Unsupported file type.');
      return;
    }
    const sizeError = getMediaSizeError(file, type);
    if (sizeError) {
      setMediaError(sizeError);
      return;
    }
    setPendingMedia({ file, previewUrl: URL.createObjectURL(file), ...type });
    setMediaError('');
    setEmojiPickerOpen(false);
  }, [getMediaSizeError, getPendingMediaType, setEmojiPickerOpen, setMediaError, setPendingMedia]);

  const handleMediaFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) handleFileSelected(file);
  }, [handleFileSelected]);

  const handleClipboardPaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const items = Array.from(clipboardData.items ?? []);
    const fileItem = items.find((item) => item.kind === 'file');
    const rawFile = fileItem?.getAsFile() ?? clipboardData.files?.[0] ?? null;
    if (!rawFile) return;

    event.preventDefault();
    handleFileSelected(normalizePastedFile(rawFile));
  }, [handleFileSelected]);

  return {
    handleOpenMediaPicker,
    handleOpenDocPicker,
    handleFileSelected,
    handleMediaFileChange,
    handleClipboardPaste,
  };
}
