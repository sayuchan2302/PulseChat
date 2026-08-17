import { useState, useRef, useCallback } from 'react';
import type { ChatMessage } from '../types/chat.types';

export interface UseMessageSearchOptions {
    selectedUserId: number | null;
    selectedRoomId: number | null;
}

export function useMessageSearch() {
    const [messageSearchQuery, setMessageSearchQuery] = useState('');
    const [messageSearchSubmitted, setMessageSearchSubmitted] = useState(false);
    const messageSearchInputRef = useRef<HTMLInputElement | null>(null);
    const [messageSearchItems, setMessageSearchItems] = useState<ChatMessage[]>([]);
    const [messageSearchLoading, setMessageSearchLoading] = useState(false);
    const [messageSearchError, setMessageSearchError] = useState('');
    const [messageSearchHasMore, setMessageSearchHasMore] = useState(false);
    const [messageSearchNextBefore, setMessageSearchNextBefore] = useState<number | null>(null);
    const [activeMessageSearchId, setActiveMessageSearchId] = useState<number | null>(null);

    const clearMessageSearch = useCallback(() => {
        setMessageSearchQuery('');
        setMessageSearchSubmitted(false);
        setMessageSearchItems([]);
        setMessageSearchLoading(false);
        setMessageSearchError('');
        setMessageSearchHasMore(false);
        setMessageSearchNextBefore(null);
        setActiveMessageSearchId(null);
    }, []);

    const navigateSearchIndex = useCallback((direction: 'next' | 'prev') => {
        if (messageSearchItems.length === 0) return;
        const currentIdx = messageSearchItems.findIndex((m) => m.id === activeMessageSearchId);
        let nextIdx = 0;
        if (currentIdx >= 0) {
            if (direction === 'next') {
                nextIdx = (currentIdx + 1) % messageSearchItems.length;
            } else {
                nextIdx = (currentIdx - 1 + messageSearchItems.length) % messageSearchItems.length;
            }
        } else {
            nextIdx = 0;
        }
        const target = messageSearchItems[nextIdx];
        if (target) {
            setActiveMessageSearchId(target.id);
        }
    }, [activeMessageSearchId, messageSearchItems]);

    return {
        messageSearchQuery,
        setMessageSearchQuery,
        messageSearchSubmitted,
        setMessageSearchSubmitted,
        messageSearchInputRef,
        messageSearchItems,
        setMessageSearchItems,
        messageSearchLoading,
        setMessageSearchLoading,
        messageSearchError,
        setMessageSearchError,
        messageSearchHasMore,
        setMessageSearchHasMore,
        messageSearchNextBefore,
        setMessageSearchNextBefore,
        activeMessageSearchId,
        setActiveMessageSearchId,
        clearMessageSearch,
        navigateSearchIndex,
    };
}

export default useMessageSearch;
