import { useState, useRef, useCallback } from 'react';
import { isMessagesContainerNearBottom, getMessagesContainerBottomScrollTop } from '../utils/messageUtils';

export function useMessageScroll() {
    const messagesContainerRef = useRef<HTMLDivElement | null>(null);
    const [unreadDividerMessageId, setUnreadDividerMessageId] = useState<number | null>(null);
    const isAutoScrollingRef = useRef(false);

    const scrollToBottom = useCallback((smooth = false) => {
        const element = messagesContainerRef.current;
        if (!element) return;
        isAutoScrollingRef.current = true;
        const targetTop = getMessagesContainerBottomScrollTop(element);
        element.scrollTo({
            top: targetTop,
            behavior: smooth ? 'smooth' : 'auto',
        });
        setTimeout(() => {
            isAutoScrollingRef.current = false;
        }, 150);
    }, []);

    const isNearBottom = useCallback(() => {
        return isMessagesContainerNearBottom(messagesContainerRef.current);
    }, []);

    return {
        messagesContainerRef,
        unreadDividerMessageId,
        setUnreadDividerMessageId,
        scrollToBottom,
        isNearBottom,
        isAutoScrollingRef,
    };
}

export default useMessageScroll;
