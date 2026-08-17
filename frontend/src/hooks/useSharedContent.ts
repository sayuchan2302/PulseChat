import { useState, useCallback } from 'react';
import type { ChatMessage } from '../types/chat.types';

export function useSharedContent() {
    const [sharedMediaExpanded, setSharedMediaExpanded] = useState(false);
    const [sharedFilesExpanded, setSharedFilesExpanded] = useState(false);
    const [sharedLinksExpanded, setSharedLinksExpanded] = useState(false);
    const [sharedMediaLoaded, setSharedMediaLoaded] = useState(false);
    const [sharedLinksLoaded, setSharedLinksLoaded] = useState(false);
    const [sharedMediaItems, setSharedMediaItems] = useState<ChatMessage[]>([]);
    const [sharedLinkItems, setSharedLinkItems] = useState<ChatMessage[]>([]);
    const [sharedMediaLoading, setSharedMediaLoading] = useState(false);
    const [sharedLinksLoading, setSharedLinksLoading] = useState(false);
    const [sharedMediaError, setSharedMediaError] = useState('');
    const [sharedLinksError, setSharedLinksError] = useState('');
    const [sharedMediaHasMore, setSharedMediaHasMore] = useState(false);
    const [sharedLinksHasMore, setSharedLinksHasMore] = useState(false);
    const [sharedMediaNextBefore, setSharedMediaNextBefore] = useState<number | null>(null);
    const [sharedLinksNextBefore, setSharedLinksNextBefore] = useState<number | null>(null);

    const resetSharedContent = useCallback(() => {
        setSharedMediaExpanded(false);
        setSharedFilesExpanded(false);
        setSharedLinksExpanded(false);
        setSharedMediaLoaded(false);
        setSharedLinksLoaded(false);
        setSharedMediaItems([]);
        setSharedLinkItems([]);
        setSharedMediaLoading(false);
        setSharedLinksLoading(false);
        setSharedMediaError('');
        setSharedLinksError('');
        setSharedMediaHasMore(false);
        setSharedLinksHasMore(false);
        setSharedMediaNextBefore(null);
        setSharedLinksNextBefore(null);
    }, []);

    return {
        sharedMediaExpanded,
        setSharedMediaExpanded,
        sharedFilesExpanded,
        setSharedFilesExpanded,
        sharedLinksExpanded,
        setSharedLinksExpanded,
        sharedMediaLoaded,
        setSharedMediaLoaded,
        sharedLinksLoaded,
        setSharedLinksLoaded,
        sharedMediaItems,
        setSharedMediaItems,
        sharedLinkItems,
        setSharedLinkItems,
        sharedMediaLoading,
        setSharedMediaLoading,
        sharedLinksLoading,
        setSharedLinksLoading,
        sharedMediaError,
        setSharedMediaError,
        sharedLinksError,
        setSharedLinksError,
        sharedMediaHasMore,
        setSharedMediaHasMore,
        sharedLinksHasMore,
        setSharedLinksHasMore,
        sharedMediaNextBefore,
        setSharedMediaNextBefore,
        sharedLinksNextBefore,
        setSharedLinksNextBefore,
        resetSharedContent,
    };
}

export default useSharedContent;
