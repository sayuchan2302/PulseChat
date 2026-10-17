import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRoom, User } from '../types';
import type { ChatMessage } from '../types/chat.types';
import { apiClient } from '../services/api';
import { useMessageHistory } from './useMessageHistory';

vi.mock('../services/api', () => ({ apiClient: { get: vi.fn() } }));

type DeferredCall = {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
};

function deferredCall(): DeferredCall {
  let resolve: (value: unknown) => void = () => {};
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createSentRoomMessage(): ChatMessage {
  return {
    id: 42,
    chatRoomId: 7,
    senderId: 1,
    content: 'hello room',
    type: 'TEXT',
    timestamp: '2026-10-18T10:00:00',
    read: true,
  } as unknown as ChatMessage;
}

function createOptions() {
  const selectedRoomIdRef: MutableRefObject<number | null> = { current: 7 };
  const roomSeenByLoadedMessageIdsRef: MutableRefObject<Set<number>> = { current: new Set<number>() };

  return {
    selectedRoomIdRef,
    roomSeenByLoadedMessageIdsRef,
    options: {
      currentUser: { id: 1 } as User,
      selectedRoom: { id: 7 } as ChatRoom,
      messages: [createSentRoomMessage()],
      currentUserIdRef: { current: 1 } as MutableRefObject<number | null>,
      selectedUserIdRef: { current: null } as MutableRefObject<number | null>,
      selectedRoomIdRef,
      roomSeenByLoadedMessageIdsRef,
      olderMessagesLoadingRef: { current: false } as MutableRefObject<boolean>,
      hasMoreMessagesRef: { current: true } as MutableRefObject<boolean>,
      nextMessageBeforeRef: { current: null } as MutableRefObject<number | null>,
      skipNextAutoScrollRef: { current: false } as MutableRefObject<boolean>,
      messagesContainerRef: { current: null } as MutableRefObject<HTMLDivElement | null>,
      applyMessagePagination: vi.fn(),
      setMessages: vi.fn() as unknown as Dispatch<SetStateAction<ChatMessage[]>>,
      setMessagesError: vi.fn() as unknown as Dispatch<SetStateAction<string>>,
      setOlderMessagesLoading: vi.fn() as unknown as Dispatch<SetStateAction<boolean>>,
      setRoomSeenByByMessageId: vi.fn() as unknown as Dispatch<SetStateAction<Record<number, User[]>>>,
      setSeenByLoadingMessageIds: vi.fn() as unknown as Dispatch<SetStateAction<number[]>>,
    },
  };
}

describe('useMessageHistory room seen-by loading', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('releases the seen-by marker when the room changed before the response arrived', async () => {
    const pendingResponse = deferredCall();
    vi.mocked(apiClient.get).mockReturnValue(pendingResponse.promise as never);
    const { roomSeenByLoadedMessageIdsRef, options } = createOptions();

    renderHook(() => useMessageHistory(options));

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/rooms/7/messages/42/seen-by'));
    expect(roomSeenByLoadedMessageIdsRef.current.has(42)).toBe(true);

    options.selectedRoomIdRef.current = 8;
    await act(async () => {
      pendingResponse.resolve({ data: { seenBy: [] } });
    });

    expect(roomSeenByLoadedMessageIdsRef.current.has(42)).toBe(false);
  });

  it('retries the seen-by request after a stale response released the marker', async () => {
    const pendingResponse = deferredCall();
    vi.mocked(apiClient.get)
      .mockReturnValueOnce(pendingResponse.promise as never)
      .mockResolvedValueOnce({ data: { seenBy: [] } } as never);
    const { roomSeenByLoadedMessageIdsRef, options } = createOptions();

    const { rerender } = renderHook((props) => useMessageHistory(props), {
      initialProps: options,
    });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

    options.selectedRoomIdRef.current = 8;
    await act(async () => {
      pendingResponse.resolve({ data: { seenBy: [] } });
    });
    expect(roomSeenByLoadedMessageIdsRef.current.has(42)).toBe(false);

    options.selectedRoomIdRef.current = 7;
    rerender({ ...options, messages: [createSentRoomMessage()] });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
  });
});
