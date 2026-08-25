import { useCallback } from 'react';
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

export function useMediaPicker({ mediaFileInputRef, docFileInputRef, setEmojiPickerOpen, setMediaError, setPendingMedia, getPendingMediaType, getMediaSizeError }: Options) {
  const handleOpenMediaPicker = useCallback(() => { setEmojiPickerOpen(false); setMediaError(''); mediaFileInputRef.current?.click(); }, [mediaFileInputRef, setEmojiPickerOpen, setMediaError]);
  const handleOpenDocPicker = useCallback(() => { setEmojiPickerOpen(false); setMediaError(''); docFileInputRef.current?.click(); }, [docFileInputRef, setEmojiPickerOpen, setMediaError]);
  const handleFileSelected = useCallback((file: File) => {
    const type = getPendingMediaType(file);
    if (!type) { setMediaError('Unsupported file type.'); return; }
    const sizeError = getMediaSizeError(file, type);
    if (sizeError) { setMediaError(sizeError); return; }
    setPendingMedia({ file, previewUrl: URL.createObjectURL(file), ...type });
    setMediaError('');
    setEmojiPickerOpen(false);
  }, [getMediaSizeError, getPendingMediaType, setEmojiPickerOpen, setMediaError, setPendingMedia]);
  const handleMediaFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => { const file = event.currentTarget.files?.[0]; if (file) handleFileSelected(file); }, [handleFileSelected]);
  return { handleOpenMediaPicker, handleOpenDocPicker, handleFileSelected, handleMediaFileChange };
}
