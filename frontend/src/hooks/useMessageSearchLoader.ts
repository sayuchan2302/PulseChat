import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { apiClient } from '../services/api';
import { MESSAGE_SEARCH_PAGE_SIZE } from '../constants/chatConstants';
import type { MessagePage } from '../types';
import type { ChatMessage, MessageSearchLoadOptions } from '../types/chat.types';
import { mergeSharedContentPage } from '../utils/messageUtils';

interface Options {
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  queryRef: MutableRefObject<string>;
  requestedQueryRef: MutableRefObject<string>;
  loading: boolean;
  hasMore: boolean;
  nextBefore: number | null;
  setItems: Dispatch<SetStateAction<ChatMessage[]>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setHasMore: Dispatch<SetStateAction<boolean>>;
  setNextBefore: Dispatch<SetStateAction<number | null>>;
  setActiveId: Dispatch<SetStateAction<number | null>>;
}

export function useMessageSearchLoader(options: Options) {
  const {
    selectedUserIdRef, selectedRoomIdRef, queryRef, requestedQueryRef, loading, hasMore,
    nextBefore, setItems, setLoading, setError, setHasMore, setNextBefore, setActiveId,
  } = options;
  return useCallback(async (loadOptions: MessageSearchLoadOptions = {}) => {
    const userId = selectedUserIdRef.current;
    const roomId = selectedRoomIdRef.current;
    const query = (loadOptions.query ?? queryRef.current).trim();
    if (userId === null && roomId === null) return;
    if (!query) {
      requestedQueryRef.current = '';
      setItems([]); setError(''); setHasMore(false); setNextBefore(null); setActiveId(null);
      return;
    }
    const before = loadOptions.reset ? null : nextBefore;
    if (!loadOptions.reset && (loading || !hasMore || before === null)) return;
    setLoading(true); setError('');
    try {
      const endpoint = userId !== null ? `/messages/${userId}/search` : `/rooms/${roomId}/search`;
      const response = await apiClient.get<MessagePage>(endpoint, {
        params: { query, size: MESSAGE_SEARCH_PAGE_SIZE, ...(before === null ? {} : { before }) },
      });
      if (selectedUserIdRef.current !== userId || selectedRoomIdRef.current !== roomId || queryRef.current.trim() !== query) return;
      setItems((items) => mergeSharedContentPage(items, response.data.items, Boolean(loadOptions.reset)));
      setHasMore(response.data.hasMore); setNextBefore(response.data.nextBefore ?? null);
    } catch (error) {
      console.error('Failed to search messages:', error);
      if (selectedUserIdRef.current === userId && selectedRoomIdRef.current === roomId && queryRef.current.trim() === query) setError('Unable to search messages.');
    } finally {
      if (selectedUserIdRef.current === userId && selectedRoomIdRef.current === roomId && queryRef.current.trim() === query) setLoading(false);
    }
  }, [hasMore, loading, nextBefore, queryRef, requestedQueryRef, selectedRoomIdRef, selectedUserIdRef, setActiveId, setError, setHasMore, setItems, setLoading, setNextBefore]);
}
