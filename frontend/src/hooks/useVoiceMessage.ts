import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { PendingMedia } from '../types/chat.types';

export function useVoiceMessage(setPendingMedia: Dispatch<SetStateAction<PendingMedia | null>>) {
  return useCallback((blob: Blob, durationSeconds: number) => {
    const mimeType = blob.type || 'audio/webm';
    const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    setPendingMedia({ file: new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType }), previewUrl: URL.createObjectURL(blob), type: 'AUDIO', resourceType: 'video', mediaDuration: durationSeconds });
    setTimeout(() => document.querySelector<HTMLFormElement>('.message-input-form')?.requestSubmit(), 50);
  }, [setPendingMedia]);
}
