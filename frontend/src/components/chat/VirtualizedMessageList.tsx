import React, {
    useState,
    useEffect,
    useRef,
    useCallback,
    useLayoutEffect,
} from 'react';
import type { MessageListItem } from '../../types/chat.types';

export interface VirtualizedMessageListProps {
    items: MessageListItem[];
    renderItem: (item: MessageListItem, index: number) => React.ReactNode;
    messagesContainerRef: React.RefObject<HTMLDivElement | null>;
    onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
    onPointerDown?: () => void;
    onTouchMove?: () => void;
    onWheel?: () => void;
    onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragLeave?: (e: React.DragEvent<HTMLDivElement>) => void;
    onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
    isDraggingFile?: boolean;
    messagesLoading?: boolean;
    olderMessagesLoading?: boolean;
    hasMoreMessages?: boolean;
    loadOlderMessages?: () => void;
    typingIndicatorLabel?: string;
    messagesEndRef?: React.RefObject<HTMLDivElement | null>;
    overscan?: number;
    estimatedItemHeight?: number;
    targetMessageId?: number | null;
}

export function VirtualizedMessageList({
    items,
    renderItem,
    messagesContainerRef,
    onScroll,
    onPointerDown,
    onTouchMove,
    onWheel,
    onDragOver,
    onDragLeave,
    onDrop,
    isDraggingFile,
    messagesLoading,
    olderMessagesLoading,
    hasMoreMessages,
    loadOlderMessages,
    typingIndicatorLabel,
    messagesEndRef,
    overscan = 6,
    estimatedItemHeight = 70,
    targetMessageId,
}: VirtualizedMessageListProps) {
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(600);
    const itemHeightsRef = useRef<Map<string, number>>(new Map());
    const itemOffsetsRef = useRef<number[]>([]);
    const containerNodeRef = messagesContainerRef;

    // Track heights of items dynamically
    const measureItem = useCallback((key: string, node: HTMLElement | null) => {
        if (node) {
            const height = node.getBoundingClientRect().height;
            if (height > 0 && itemHeightsRef.current.get(key) !== height) {
                itemHeightsRef.current.set(key, height);
            }
        }
    }, []);

    // Compute accumulated offsets for items
    let totalHeight = 0;
    const offsets: number[] = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
        offsets[i] = totalHeight;
        const key = items[i].key;
        const measuredHeight = itemHeightsRef.current.get(key) ?? estimatedItemHeight;
        totalHeight += measuredHeight;
    }
    itemOffsetsRef.current = offsets;

    // Compute visible range based on scrollTop and containerHeight
    let startIndex = 0;
    let endIndex = items.length - 1;

    if (items.length > 0) {
        // Find first item whose bottom > scrollTop
        let low = 0;
        let high = items.length - 1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const itemTop = offsets[mid];
            const itemKey = items[mid].key;
            const itemH = itemHeightsRef.current.get(itemKey) ?? estimatedItemHeight;
            const itemBottom = itemTop + itemH;

            if (itemBottom >= scrollTop) {
                startIndex = mid;
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }

        // Find last item whose top <= scrollTop + containerHeight
        low = startIndex;
        high = items.length - 1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const itemTop = offsets[mid];
            if (itemTop <= scrollTop + containerHeight) {
                endIndex = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
    }

    // Apply overscan
    const visibleStart = Math.max(0, startIndex - overscan);
    const visibleEnd = Math.min(items.length - 1, endIndex + overscan);

    // Observer for container height
    useLayoutEffect(() => {
        const el = containerNodeRef.current;
        if (!el) return;
        setContainerHeight(el.clientHeight);
        setScrollTop(el.scrollTop);

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.height > 0) {
                    setContainerHeight(entry.contentRect.height);
                }
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [containerNodeRef]);

    // Jump to target message when targetMessageId changes
    useEffect(() => {
        if (!targetMessageId || items.length === 0) return;
        const targetIndex = items.findIndex(
            (item) => item.type === 'message' && item.message.id === targetMessageId
        );

        if (targetIndex !== -1) {
            const targetTop = itemOffsetsRef.current[targetIndex] ?? (targetIndex * estimatedItemHeight);
            const targetScrollTop = Math.max(0, targetTop - containerHeight / 2 + 40);

            const el = containerNodeRef.current;
            if (el) {
                el.scrollTop = targetScrollTop;
                setScrollTop(targetScrollTop);

                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => {
                        const targetNode = el.querySelector<HTMLElement>(`[data-message-id="${targetMessageId}"]`);
                        if (targetNode) {
                            targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    });
                });
            }
        }
    }, [targetMessageId, items, estimatedItemHeight, containerHeight, containerNodeRef]);

    const handleScrollInternal = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
        onScroll?.(e);
    };

    const visibleItems = items.slice(visibleStart, visibleEnd + 1);

    return (
        <div
            ref={containerNodeRef}
            className={`messages-container ${isDraggingFile ? 'dragging-over' : ''}`}
            aria-busy={messagesLoading || olderMessagesLoading}
            onScroll={handleScrollInternal}
            onPointerDown={onPointerDown}
            onTouchMove={onTouchMove}
            onWheel={onWheel}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {isDraggingFile ? (
                <div className="chat-drag-drop-overlay">
                    <span>Drop file here to send</span>
                </div>
            ) : null}

            {hasMoreMessages ? (
                <button
                    type="button"
                    className="older-messages-btn"
                    onClick={loadOlderMessages}
                    disabled={olderMessagesLoading}
                >
                    {olderMessagesLoading ? 'Loading older messages...' : 'Load older messages'}
                </button>
            ) : null}

            <div
                className="virtualized-scroll-spacer"
                style={{
                    position: 'relative',
                    height: `${totalHeight}px`,
                    width: '100%',
                }}
            >
                {visibleItems.map((item, idx) => {
                    const actualIndex = visibleStart + idx;
                    const topOffset = offsets[actualIndex] ?? 0;

                    return (
                        <div
                            key={item.key}
                            ref={(node) => measureItem(item.key, node)}
                            style={{
                                position: 'absolute',
                                top: `${topOffset}px`,
                                left: 0,
                                right: 0,
                                width: '100%',
                            }}
                        >
                            {renderItem(item, actualIndex)}
                        </div>
                    );
                })}
            </div>

            {!messagesLoading && typingIndicatorLabel ? (
                <div className="typing-indicator">{typingIndicatorLabel}</div>
            ) : null}

            <div ref={messagesEndRef} />
        </div>
    );
}

export default VirtualizedMessageList;
