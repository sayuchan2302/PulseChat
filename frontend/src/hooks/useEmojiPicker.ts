import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

interface UseEmojiPickerOptions {
  /** The composer textarea, refocused when Escape closes the picker. */
  messageInputRef: RefObject<HTMLTextAreaElement | null>;
}

/** Owns the emoji picker popover: open state, anchor refs and outside-click/Escape dismissal. */
export function useEmojiPicker({ messageInputRef }: UseEmojiPickerOptions) {
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);

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
  }, [emojiPickerOpen, messageInputRef]);

  return { emojiPickerOpen, setEmojiPickerOpen, emojiPickerRef, emojiButtonRef };
}
