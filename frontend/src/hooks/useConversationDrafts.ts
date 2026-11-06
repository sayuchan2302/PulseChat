import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

interface UseConversationDraftsOptions {
  currentUserId: number | null;
  selectedUserId: number | null;
  selectedRoomId: number | null;
  messageInput: string;
  setMessageInput: Dispatch<SetStateAction<string>>;
}

function getDraftStorageKey(userId: number): string {
  return `pulsechat:drafts:${userId}`;
}

function readStoredDrafts(userId: number | null): Record<string, string> {
  if (userId === null || typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.sessionStorage.getItem(getDraftStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Ignore storage read errors
  }
  return {};
}

function writeStoredDrafts(userId: number | null, drafts: Record<string, string>): void {
  if (userId === null || typeof window === 'undefined') {
    return;
  }
  try {
    const key = getDraftStorageKey(userId);
    if (Object.keys(drafts).length === 0) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, JSON.stringify(drafts));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function getConversationDraftKey(type: 'user' | 'room', id: number): string {
  return `${type}-${id}`;
}

export function useConversationDrafts({
  currentUserId,
  selectedUserId,
  selectedRoomId,
  messageInput,
  setMessageInput,
}: UseConversationDraftsOptions) {
  const [conversationDrafts, setConversationDrafts] = useState<Record<string, string>>(() =>
    readStoredDrafts(currentUserId),
  );
  const draftsRef = useRef<Record<string, string>>(conversationDrafts);
  const prevUserIdRef = useRef<number | null>(currentUserId);

  const activeConversationKey = useMemo(() => {
    if (selectedRoomId !== null) {
      return getConversationDraftKey('room', selectedRoomId);
    }
    if (selectedUserId !== null) {
      return getConversationDraftKey('user', selectedUserId);
    }
    return null;
  }, [selectedRoomId, selectedUserId]);

  const prevConversationKeyRef = useRef<string | null>(activeConversationKey);

  // Reload stored drafts when the authenticated user changes
  useEffect(() => {
    if (prevUserIdRef.current === currentUserId) {
      return;
    }
    prevUserIdRef.current = currentUserId;
    const loaded = readStoredDrafts(currentUserId);
    draftsRef.current = loaded;
    setConversationDrafts(loaded);
  }, [currentUserId]);

  // Restore draft when switching conversations, or persist draft when typing in the active conversation
  useEffect(() => {
    if (prevConversationKeyRef.current !== activeConversationKey) {
      prevConversationKeyRef.current = activeConversationKey;
      const restoredDraft = activeConversationKey
        ? (draftsRef.current[activeConversationKey] ?? '')
        : '';
      setMessageInput(restoredDraft);
      return;
    }

    if (!activeConversationKey) {
      return;
    }

    const trimmed = messageInput.trim();
    const currentSaved = draftsRef.current[activeConversationKey] ?? '';

    if (trimmed.length === 0) {
      if (activeConversationKey in draftsRef.current) {
        const nextDrafts = { ...draftsRef.current };
        delete nextDrafts[activeConversationKey];
        draftsRef.current = nextDrafts;
        setConversationDrafts(nextDrafts);
        writeStoredDrafts(currentUserId, nextDrafts);
      }
      return;
    }

    if (currentSaved !== messageInput) {
      const nextDrafts = {
        ...draftsRef.current,
        [activeConversationKey]: messageInput,
      };
      draftsRef.current = nextDrafts;
      setConversationDrafts(nextDrafts);
      writeStoredDrafts(currentUserId, nextDrafts);
    }
  }, [activeConversationKey, currentUserId, messageInput, setMessageInput]);

  return {
    conversationDrafts,
    activeConversationKey,
  };
}

