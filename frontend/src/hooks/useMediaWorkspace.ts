import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessage, PendingMedia } from '../types/chat.types';
import type { LightboxMediaItem } from '../components/chat/MediaLightbox';
import {
  cloudinaryResultToMedia,
  getMessageType,
  getPendingMediaType,
} from '../utils/messageUtils';
import { getMediaUrl } from '../utils/userUtils';
import { getFileFormat, getMediaSizeError } from '../utils/mediaUtils';
import { useMediaPicker } from './useMediaPicker';
import { useMediaUpload } from './useMediaUpload';
import { useVoiceMessage } from './useVoiceMessage';

interface UseMediaWorkspaceOptions {
  selectedRoomId: number | null;
  selectedUserId: number | null;
  messages: ChatMessage[];
  sharedMediaItems: ChatMessage[];
  setEmojiPickerOpen: Dispatch<SetStateAction<boolean>>;
}

export function useMediaWorkspace({
  selectedRoomId,
  selectedUserId,
  messages,
  sharedMediaItems,
  setEmojiPickerOpen,
}: UseMediaWorkspaceOptions) {
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [mediaViewerMessage, setMediaViewerMessage] = useState<ChatMessage | null>(null);
  const [lightboxState, setLightboxState] = useState<{ items: LightboxMediaItem[]; index: number } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);

  const clearPendingMedia = useCallback(() => {
    setPendingMedia(null);
    setMediaError('');
    if (mediaFileInputRef.current) {
      mediaFileInputRef.current.value = '';
    }
    if (docFileInputRef.current) {
      docFileInputRef.current.value = '';
    }
  }, []);

  useEffect(() => () => {
    if (pendingMedia?.previewUrl) {
      URL.revokeObjectURL(pendingMedia.previewUrl);
    }
  }, [pendingMedia?.previewUrl]);

  useEffect(() => {
    clearPendingMedia();
    setMediaUploading(false);
    setMediaViewerMessage(null);
  }, [clearPendingMedia, selectedRoomId, selectedUserId]);

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

  const {
    handleOpenMediaPicker,
    handleOpenDocPicker,
    handleFileSelected,
    handleMediaFileChange,
    handleClipboardPaste,
  } = useMediaPicker({
    mediaFileInputRef,
    docFileInputRef,
    setEmojiPickerOpen,
    setMediaError,
    setPendingMedia,
    getPendingMediaType,
    getMediaSizeError,
  });

  const handleVoiceRecorded = useVoiceMessage(setPendingMedia);

  const { uploadPendingMedia } = useMediaUpload(
    getMediaUrl,
    getFileFormat,
    cloudinaryResultToMedia,
  );

  const mediaViewerUrl = getMediaUrl(mediaViewerMessage?.mediaUrl);
  const mediaViewerType = mediaViewerMessage ? getMessageType(mediaViewerMessage) : 'IMAGE';

  return {
    pendingMedia,
    setPendingMedia,
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
  };
}

