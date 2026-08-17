import React from 'react';
import type { ChatMessage, ChatRoom, User } from '../../types/chat.types';
import { SearchIcon, CloseIcon } from '../../icons/ChatIcons';
import {
    getMessageSenderName,
    getMessageSearchSnippet,
    renderHighlightedSearchText,
} from '../../utils/messageUtils';
import { formatMessageTime } from '../../utils/formatUtils';
import { renderUserAvatar } from '../../utils/renderUtils';

export interface SearchSidebarProps {
    conversationName: string;
    handleCloseConversationDetails: () => void;
    handleMessageSearchSubmit: (e: React.FormEvent) => void;
    messageSearchInputRef: React.RefObject<HTMLInputElement | null>;
    messageSearchQuery: string;
    handleMessageSearchChange: (query: string) => void;
    handleMessageSearchInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    handleClearMessageSearch: () => void;
    messageSearchSubmitted: boolean;
    query: string;
    showInitialSearchLoading: boolean;
    messageSearchError: string;
    messageSearchItems: ChatMessage[];
    messageSearchHasMore: boolean;
    messageSearchLoading: boolean;
    loadMessageSearch: (options?: { reset?: boolean; query?: string }) => Promise<void>;
    selectedRoom: ChatRoom | null;
    findKnownUserById: (id: number) => User | undefined;
    activeMessageSearchId: number | null;
    handleJumpToSearchResult: (id: number) => Promise<void>;
}

export function SearchSidebar({
    conversationName,
    handleCloseConversationDetails,
    handleMessageSearchSubmit,
    messageSearchInputRef,
    messageSearchQuery,
    handleMessageSearchChange,
    handleMessageSearchInputKeyDown,
    handleClearMessageSearch,
    messageSearchSubmitted,
    query,
    showInitialSearchLoading,
    messageSearchError,
    messageSearchItems,
    messageSearchHasMore,
    messageSearchLoading,
    loadMessageSearch,
    selectedRoom,
    findKnownUserById,
    activeMessageSearchId,
    handleJumpToSearchResult,
}: SearchSidebarProps) {
    return (
        <aside
            id="conversation-search-sidebar"
            className="details-sidebar search-sidebar"
            aria-label="Search in conversation"
        >
            <div className="details-header search-sidebar-header">
                <div className="search-sidebar-title-group">
                    <h3>Search Messages</h3>
                    <span className="search-sidebar-subtitle">{conversationName}</span>
                </div>
                <button
                    type="button"
                    className="details-close-btn"
                    onClick={handleCloseConversationDetails}
                    aria-label="Close search"
                    title="Close search"
                >
                    <CloseIcon className="details-close-icon" />
                </button>
            </div>

            <div className="search-sidebar-body">
                <form
                    className="search-sidebar-form"
                    role="search"
                    onSubmit={handleMessageSearchSubmit}
                >
                    <div className="search-sidebar-input-box">
                        <SearchIcon className="search-sidebar-input-icon" />
                        <input
                            ref={messageSearchInputRef}
                            type="search"
                            value={messageSearchQuery}
                            onChange={(event) => handleMessageSearchChange(event.target.value)}
                            onKeyDown={handleMessageSearchInputKeyDown}
                            placeholder="Search in conversation..."
                            aria-label="Search in conversation"
                            autoComplete="off"
                            spellCheck={false}
                        />
                        {messageSearchQuery ? (
                            <button
                                type="button"
                                className="search-sidebar-clear-btn"
                                onClick={handleClearMessageSearch}
                                aria-label="Clear search"
                                title="Clear search"
                            >
                                ✕
                            </button>
                        ) : null}
                    </div>
                </form>

                {!messageSearchSubmitted || !query ? (
                    <div className="search-sidebar-empty-state">
                        <div className="search-sidebar-empty-icon">🔍</div>
                        <p className="search-sidebar-empty-heading">Search in conversation</p>
                        <p className="search-sidebar-empty-hint">Type keywords and press <strong>Enter</strong> to search.</p>
                    </div>
                ) : showInitialSearchLoading ? (
                    <div className="search-sidebar-loading-state">
                        <div className="search-sidebar-spinner" />
                        <span>Searching messages...</span>
                    </div>
                ) : messageSearchError && messageSearchItems.length === 0 ? (
                    <div className="search-sidebar-error-state">
                        <span>{messageSearchError}</span>
                        <button
                            type="button"
                            className="shared-content-retry-btn"
                            onClick={() => void loadMessageSearch({ reset: true, query })}
                        >
                            Retry
                        </button>
                    </div>
                ) : messageSearchItems.length === 0 ? (
                    <div className="search-sidebar-empty-state">
                        <div className="search-sidebar-empty-icon">💬</div>
                        <p className="search-sidebar-empty-heading">No results found</p>
                        <p className="search-sidebar-empty-hint">No messages matching &ldquo;{query}&rdquo;</p>
                    </div>
                ) : (
                    <div className="search-sidebar-results-wrap">
                        <div className="search-sidebar-results-bar">
                            <span>{messageSearchItems.length}{messageSearchHasMore ? '+' : ''} matching messages</span>
                        </div>
                        <div className="search-sidebar-results-list">
                            {messageSearchItems.map((message) => {
                                const senderName = getMessageSenderName(message, selectedRoom, findKnownUserById);
                                const senderUser = findKnownUserById(message.senderId);
                                const isActive = message.id === activeMessageSearchId;
                                const snippet = getMessageSearchSnippet(message, query);

                                return (
                                    <button
                                        key={message.id}
                                        type="button"
                                        className={`search-result-card ${isActive ? 'active' : ''}`}
                                        onClick={() => void handleJumpToSearchResult(message.id)}
                                    >
                                        <div className="search-result-avatar-wrap">
                                            {senderUser ? (
                                                renderUserAvatar(senderUser, 'user-avatar small-avatar')
                                            ) : (
                                                <div className="user-avatar small-avatar search-fallback-avatar">
                                                    {senderName.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="search-result-content">
                                            <div className="search-result-header">
                                                <span className="search-result-sender">{senderName}</span>
                                                <span className="search-result-time">{formatMessageTime(message.timestamp)}</span>
                                            </div>
                                            <div className="search-result-snippet">
                                                {renderHighlightedSearchText(snippet, query)}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {messageSearchHasMore ? (
                            <button
                                type="button"
                                className="shared-content-load-btn search-sidebar-load-more"
                                disabled={messageSearchLoading}
                                onClick={() => void loadMessageSearch()}
                            >
                                {messageSearchLoading ? 'Loading...' : 'Load more results'}
                            </button>
                        ) : null}
                    </div>
                )}
            </div>
        </aside>
    );
}

export default SearchSidebar;
