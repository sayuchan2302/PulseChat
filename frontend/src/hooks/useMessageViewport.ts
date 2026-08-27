import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message, MessagePage } from '../types';
import type { PendingReadConversation } from '../types/chat.types';
import { MESSAGE_JUMP_HIGHLIGHT_MS } from '../constants/chatConstants';
import {
  getMessagesContainerBottomScrollTop,
  getUnreadDividerCandidateId,
  toDeliveredMessage,
} from '../utils/messageUtils';

type MutableRef<T> = { current: T };

interface UseMessageViewportOptions {
  currentUserIdRef: MutableRef<number | null>;
}

export function useMessageViewport({ currentUserIdRef }: UseMessageViewportOptions) {
  const [unreadDividerMessageId, setUnreadDividerMessageIdState] = useState<number | null>(null);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);

  const unreadDividerMessageIdRef = useRef<number | null>(null);
  const pendingReadConversationRef = useRef<PendingReadConversation>(null);
  const olderMessagesLoadingRef = useRef(false);
  const hasMoreMessagesRef = useRef(false);
  const nextMessageBeforeRef = useRef<number | null>(null);
  const skipNextAutoScrollRef = useRef(false);
  const pendingInitialMessageScrollRef = useRef(false);
  const blockOlderMessagesAutoLoadRef = useRef(false);
  const hasUserInteractedWithMessagesRef = useRef(false);
  const releaseInitialScrollBlockFrameRef = useRef<number | null>(null);
  const messageJumpHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageJumpFrameRef = useRef<number | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const unreadDividerRef = useRef<HTMLDivElement | null>(null);

  const clearInitialScrollBlockRelease = useCallback(() => {
    if (releaseInitialScrollBlockFrameRef.current === null) {
      return;
    }
    window.cancelAnimationFrame(releaseInitialScrollBlockFrameRef.current);
    releaseInitialScrollBlockFrameRef.current = null;
  }, []);

  const scrollMessagesContainerToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current;
    if (container) {
      const bottomScrollTop = getMessagesContainerBottomScrollTop(container);
      if (behavior === 'auto') {
        container.scrollTop = bottomScrollTop;
      } else {
        container.scrollTo({ top: bottomScrollTop, behavior });
      }
      return true;
    }

    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
    return Boolean(messagesEndRef.current);
  }, []);

  const settleScrollToLatestMessage = useCallback((behavior: ScrollBehavior = 'auto') => {
    scrollMessagesContainerToBottom(behavior);
    window.requestAnimationFrame(() => {
      scrollMessagesContainerToBottom('auto');
      window.requestAnimationFrame(() => {
        scrollMessagesContainerToBottom('auto');
      });
    });
  }, [scrollMessagesContainerToBottom]);

  const forceScrollToLatestMessage = useCallback(() => {
    settleScrollToLatestMessage('auto');
  }, [settleScrollToLatestMessage]);

  const scrollToLatestMessage = useCallback((behavior: ScrollBehavior = 'smooth') => {
    settleScrollToLatestMessage(behavior);
  }, [settleScrollToLatestMessage]);

  const releaseInitialScrollBlock = useCallback(() => {
    clearInitialScrollBlockRelease();
    releaseInitialScrollBlockFrameRef.current = window.requestAnimationFrame(() => {
      releaseInitialScrollBlockFrameRef.current = window.requestAnimationFrame(() => {
        blockOlderMessagesAutoLoadRef.current = false;
        releaseInitialScrollBlockFrameRef.current = null;
      });
    });
  }, [clearInitialScrollBlockRelease]);

  const setUnreadDividerMessageId = useCallback((messageId: number | null) => {
    unreadDividerMessageIdRef.current = messageId;
    setUnreadDividerMessageIdState(messageId);
  }, []);

  const scrollToUnreadDivider = useCallback(() => {
    const divider = unreadDividerRef.current;
    if (!divider) {
      return false;
    }
    divider.scrollIntoView({ behavior: 'auto', block: 'start' });
    return true;
  }, []);

  const clearPendingReadConversation = useCallback(() => {
    pendingReadConversationRef.current = null;
    setUnreadDividerMessageId(null);
  }, [setUnreadDividerMessageId]);

  const preparePendingReadConversation = useCallback((
    type: NonNullable<PendingReadConversation>['type'],
    id: number,
    unreadCount: number,
  ) => {
    if (unreadCount <= 0) {
      clearPendingReadConversation();
      return;
    }
    pendingReadConversationRef.current = { type, id, unreadCount };
    setUnreadDividerMessageId(null);
  }, [clearPendingReadConversation, setUnreadDividerMessageId]);

  const applyPendingUnreadDivider = useCallback((
    pageMessages: Message[],
    type: NonNullable<PendingReadConversation>['type'],
    id: number,
  ) => {
    const pendingConversation = pendingReadConversationRef.current;
    if (
      !pendingConversation ||
      pendingConversation.type !== type ||
      pendingConversation.id !== id
    ) {
      return;
    }
    setUnreadDividerMessageId(getUnreadDividerCandidateId(
      pageMessages.map(toDeliveredMessage),
      pendingConversation.unreadCount,
      currentUserIdRef.current,
    ));
  }, [currentUserIdRef, setUnreadDividerMessageId]);

  const addPendingUnreadMessage = useCallback((
    type: NonNullable<PendingReadConversation>['type'],
    id: number,
    message: Message,
  ) => {
    const pendingConversation = pendingReadConversationRef.current;
    const unreadCount = pendingConversation?.type === type && pendingConversation.id === id
      ? pendingConversation.unreadCount + 1
      : 1;
    pendingReadConversationRef.current = { type, id, unreadCount };
    if (unreadDividerMessageIdRef.current === null && message.id > 0) {
      setUnreadDividerMessageId(message.id);
    }
  }, [setUnreadDividerMessageId]);

  const resetMessagePagination = useCallback(() => {
    olderMessagesLoadingRef.current = false;
    hasMoreMessagesRef.current = false;
    nextMessageBeforeRef.current = null;
    skipNextAutoScrollRef.current = false;
    pendingInitialMessageScrollRef.current = true;
    blockOlderMessagesAutoLoadRef.current = true;
    hasUserInteractedWithMessagesRef.current = false;
    clearInitialScrollBlockRelease();
    setOlderMessagesLoading(false);
    setHasMoreMessages(false);
  }, [clearInitialScrollBlockRelease]);

  const applyMessagePagination = useCallback((page: MessagePage) => {
    hasMoreMessagesRef.current = page.hasMore;
    nextMessageBeforeRef.current = page.nextBefore ?? null;
    setHasMoreMessages(page.hasMore);
  }, []);

  const clearMessageJumpEffects = useCallback(() => {
    if (messageJumpHighlightTimeoutRef.current) {
      clearTimeout(messageJumpHighlightTimeoutRef.current);
      messageJumpHighlightTimeoutRef.current = null;
    }
    if (messageJumpFrameRef.current !== null) {
      window.cancelAnimationFrame(messageJumpFrameRef.current);
      messageJumpFrameRef.current = null;
    }
  }, []);

  const scrollToMessageById = useCallback((messageId: number) => {
    const messageElement = messagesContainerRef.current
      ?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    messageElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const highlightMessageById = useCallback((messageId: number) => {
    clearMessageJumpEffects();
    setHighlightedMessageId(messageId);
    messageJumpFrameRef.current = window.requestAnimationFrame(() => {
      messageJumpFrameRef.current = window.requestAnimationFrame(() => {
        scrollToMessageById(messageId);
        messageJumpFrameRef.current = null;
      });
    });
    messageJumpHighlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId((currentMessageId) =>
        currentMessageId === messageId ? null : currentMessageId
      );
      messageJumpHighlightTimeoutRef.current = null;
    }, MESSAGE_JUMP_HIGHLIGHT_MS);
  }, [clearMessageJumpEffects, scrollToMessageById]);

  useEffect(() => () => {
    clearInitialScrollBlockRelease();
  }, [clearInitialScrollBlockRelease]);

  useEffect(() => () => {
    clearMessageJumpEffects();
  }, [clearMessageJumpEffects]);

  return {
    unreadDividerMessageId,
    unreadDividerMessageIdRef,
    pendingReadConversationRef,
    olderMessagesLoading,
    setOlderMessagesLoading,
    olderMessagesLoadingRef,
    hasMoreMessages,
    hasMoreMessagesRef,
    nextMessageBeforeRef,
    skipNextAutoScrollRef,
    pendingInitialMessageScrollRef,
    blockOlderMessagesAutoLoadRef,
    hasUserInteractedWithMessagesRef,
    messagesContainerRef,
    messagesEndRef,
    unreadDividerRef,
    highlightedMessageId,
    setHighlightedMessageId,
    forceScrollToLatestMessage,
    scrollToLatestMessage,
    releaseInitialScrollBlock,
    scrollToUnreadDivider,
    setUnreadDividerMessageId,
    clearPendingReadConversation,
    preparePendingReadConversation,
    applyPendingUnreadDivider,
    addPendingUnreadMessage,
    resetMessagePagination,
    applyMessagePagination,
    clearMessageJumpEffects,
    scrollToMessageById,
    highlightMessageById,
  };
}

export default useMessageViewport;
