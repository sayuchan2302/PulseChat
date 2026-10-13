import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { apiClient } from '../services/api';
import type { RoomSummaryResponse } from '../types/chat.types';

interface Options {
  selectedRoomId: number | null;
  selectedRoomIdRef: MutableRefObject<number | null>;
}

export function useRoomSummary({ selectedRoomId, selectedRoomIdRef }: Options) {
  const [roomSummary, setRoomSummary] = useState<RoomSummaryResponse | null>(null);
  const [roomSummaryRoomId, setRoomSummaryRoomId] = useState<number | null>(null);
  const [roomSummaryLoading, setRoomSummaryLoading] = useState(false);
  const [roomSummaryError, setRoomSummaryError] = useState('');
  const requestIdRef = useRef(0);
  const requestPendingRef = useRef(false);

  useEffect(() => {
    requestIdRef.current += 1;
    requestPendingRef.current = false;
    setRoomSummary(null);
    setRoomSummaryRoomId(null);
    setRoomSummaryLoading(false);
    setRoomSummaryError('');
  }, [selectedRoomId]);

  const requestRoomSummary = useCallback(async (roomId: number) => {
    if (requestPendingRef.current || selectedRoomIdRef.current !== roomId) return;

    const requestId = ++requestIdRef.current;
    requestPendingRef.current = true;
    setRoomSummary(null);
    setRoomSummaryRoomId(roomId);
    setRoomSummaryError('');
    setRoomSummaryLoading(true);

    try {
      const response = await apiClient.post<RoomSummaryResponse>(`/rooms/${roomId}/summaries`);
      if (
        requestIdRef.current === requestId &&
        selectedRoomIdRef.current === roomId
      ) {
        setRoomSummary(response.data);
      }
    } catch (error) {
      console.error('Failed to summarize room messages:', error);
      if (
        requestIdRef.current === requestId &&
        selectedRoomIdRef.current === roomId
      ) {
        const responseError = error as { response?: { data?: { message?: string } } };
        setRoomSummaryError(
          responseError.response?.data?.message || 'Unable to summarize recent messages.'
        );
      }
    } finally {
      if (requestIdRef.current === requestId) {
        requestPendingRef.current = false;
        setRoomSummaryLoading(false);
      }
    }
  }, [selectedRoomIdRef]);

  return {
    roomSummary,
    roomSummaryRoomId,
    roomSummaryLoading,
    roomSummaryError,
    requestRoomSummary,
    setRoomSummary,
    setRoomSummaryRoomId,
    setRoomSummaryError,
  };
}

export default useRoomSummary;
