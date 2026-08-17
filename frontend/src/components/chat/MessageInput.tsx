import React from 'react';
import type { ChatMessage, PendingMedia, MentionCandidate } from '../../types/chat.types';
import { EMOJI_CATEGORIES } from '../../constants/chatConstants';
import {
    MediaIcon,
    PaperclipIcon,
    EmojiIcon,
    CloseIcon,
    DocumentIcon,
} from '../../icons/ChatIcons';
import { VoiceRecorderButton } from '../VoiceRecorderButton';
import {
    getFileExtension,
    getFileBadgeColor,
    formatFileSize,
} from '../../utils/formatUtils';

export interface MessageInputProps {
    handleSendMessage: (e: React.FormEvent) => void;
    replyingToMessage: ChatMessage | null;
    getReplySenderName: (msg: ChatMessage) => string;
    getReplySnippet: (msg: ChatMessage) => string;
    setReplyingToMessage: (msg: ChatMessage | null) => void;
    pendingMedia: PendingMedia | null;
    mediaError: string;
    mediaUploading: boolean;
    clearPendingMedia: () => void;
    handleOpenMediaPicker: () => void;
    handleOpenDocPicker: () => void;
    handleVoiceRecorded: (file: File, durationSeconds: number) => void;
    emojiButtonRef: React.RefObject<HTMLButtonElement | null>;
    emojiPickerOpen: boolean;
    handleToggleEmojiPicker: () => void;
    messageInputRef: React.RefObject<HTMLTextAreaElement | null>;
    messageInput: string;
    handleMessageInputChange: (value: string) => void;
    handleMessageInputKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    updateMessageInputSelection: () => void;
    selectedConversationName: string;
    mentionQuery: string | null;
    mentionCandidates: MentionCandidate[];
    mentionActiveIndex: number;
    insertMention: (candidate: MentionCandidate) => void;
    emojiPickerRef: React.RefObject<HTMLDivElement | null>;
    handleInsertEmoji: (symbol: string) => void;
}

export function MessageInput({
    handleSendMessage,
    replyingToMessage,
    getReplySenderName,
    getReplySnippet,
    setReplyingToMessage,
    pendingMedia,
    mediaError,
    mediaUploading,
    clearPendingMedia,
    handleOpenMediaPicker,
    handleOpenDocPicker,
    handleVoiceRecorded,
    emojiButtonRef,
    emojiPickerOpen,
    handleToggleEmojiPicker,
    messageInputRef,
    messageInput,
    handleMessageInputChange,
    handleMessageInputKeyDown,
    updateMessageInputSelection,
    selectedConversationName,
    mentionQuery,
    mentionCandidates,
    mentionActiveIndex,
    insertMention,
    emojiPickerRef,
    handleInsertEmoji,
}: MessageInputProps) {
    return (
        <form className="message-input-form" onSubmit={handleSendMessage}>
            <div className="message-input-container">
                {replyingToMessage ? (
                    <div className="replying-composer-bar">
                        <div className="replying-composer-copy">
                            <span className="replying-composer-label">
                                Replying to <strong>{getReplySenderName(replyingToMessage)}</strong>
                            </span>
                            <span className="replying-composer-snippet">
                                {getReplySnippet(replyingToMessage)}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="replying-composer-close"
                            onClick={() => setReplyingToMessage(null)}
                            aria-label="Cancel reply"
                        >
                            <CloseIcon className="replying-composer-close-icon" />
                        </button>
                    </div>
                ) : null}

                {pendingMedia || mediaError ? (
                    <div className="pending-media-wrap">
                        {pendingMedia ? (
                            <div className="pending-media-preview">
                                {pendingMedia.type === 'FILE' ? (
                                    <div
                                        className={`pending-media-file-badge ${getFileBadgeColor(
                                            getFileExtension(pendingMedia.file.name)
                                        )}`}
                                    >
                                        <DocumentIcon className="pending-file-icon" />
                                        <span className="pending-file-ext">
                                            {getFileExtension(pendingMedia.file.name)}
                                        </span>
                                    </div>
                                ) : pendingMedia.resourceType === 'image' ? (
                                    <img src={pendingMedia.previewUrl} alt="Selected media preview" />
                                ) : (
                                    <video src={pendingMedia.previewUrl} muted preload="metadata" />
                                )}
                                <div className="pending-media-copy">
                                    <strong>{pendingMedia.file.name}</strong>
                                    <span>
                                        {mediaUploading
                                            ? 'Uploading...'
                                            : `${formatFileSize(pendingMedia.file.size)} • Ready to send`}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className="pending-media-remove"
                                    onClick={clearPendingMedia}
                                    disabled={mediaUploading}
                                    aria-label="Remove selected media"
                                >
                                    <CloseIcon className="pending-media-remove-icon" />
                                </button>
                            </div>
                        ) : null}
                        {mediaError ? <div className="media-error-text">{mediaError}</div> : null}
                    </div>
                ) : null}

                <div className="message-input-row">
                    <div className="message-composer">
                        <button
                            type="button"
                            className="composer-icon-btn"
                            onClick={handleOpenMediaPicker}
                            disabled={mediaUploading}
                            aria-label="Attach image or video"
                            title="Attach photo/video"
                        >
                            <MediaIcon className="composer-icon" />
                        </button>
                        <button
                            type="button"
                            className="composer-icon-btn"
                            onClick={handleOpenDocPicker}
                            disabled={mediaUploading}
                            aria-label="Attach file or document"
                            title="Attach file"
                        >
                            <PaperclipIcon className="composer-icon" />
                        </button>
                        <VoiceRecorderButton
                            disabled={mediaUploading}
                            onRecorded={handleVoiceRecorded}
                        />
                        <button
                            ref={emojiButtonRef}
                            type="button"
                            className={`composer-icon-btn emoji-toggle-btn ${emojiPickerOpen ? 'active' : ''}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={handleToggleEmojiPicker}
                            disabled={mediaUploading}
                            aria-label={emojiPickerOpen ? 'Close emoji picker' : 'Open emoji picker'}
                            aria-expanded={emojiPickerOpen}
                            aria-controls="emoji-picker-panel"
                            aria-haspopup="dialog"
                            title="Emoji"
                        >
                            <EmojiIcon className="composer-icon" />
                        </button>
                        <textarea
                            ref={messageInputRef}
                            value={messageInput}
                            onChange={(e) => handleMessageInputChange(e.target.value)}
                            onKeyDown={handleMessageInputKeyDown}
                            onKeyUp={updateMessageInputSelection}
                            onClick={updateMessageInputSelection}
                            onSelect={updateMessageInputSelection}
                            placeholder={`Message ${selectedConversationName}`}
                            className="message-input"
                            rows={1}
                            disabled={mediaUploading}
                        />

                        {mentionQuery !== null && mentionCandidates.length > 0 ? (
                            <div
                                className="mention-autocomplete-dropdown"
                                role="listbox"
                                aria-label="Mention members"
                            >
                                <div className="mention-dropdown-header">Mention member</div>
                                <div className="mention-dropdown-list">
                                    {mentionCandidates.map((c, idx) => (
                                        <button
                                            key={`${c.id}-${c.username}`}
                                            type="button"
                                            className={`mention-dropdown-item ${idx === mentionActiveIndex ? 'active' : ''
                                                }`}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                insertMention(c);
                                            }}
                                        >
                                            <div className={`mention-dropdown-avatar ${c.isAll ? 'all' : ''}`}>
                                                {c.isAll ? '@' : c.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="mention-dropdown-info">
                                                <span className="mention-dropdown-name">{c.fullName}</span>
                                                <span className="mention-dropdown-username">@{c.username}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {emojiPickerOpen ? (
                            <div
                                ref={emojiPickerRef}
                                id="emoji-picker-panel"
                                className="emoji-picker-panel"
                                role="dialog"
                                aria-label="Emoji picker"
                            >
                                <div className="emoji-picker-header">Emoji</div>
                                <div className="emoji-category-list">
                                    {EMOJI_CATEGORIES.map((category) => (
                                        <section key={category.name} className="emoji-category">
                                            <div className="emoji-category-title">{category.name}</div>
                                            <div className="emoji-grid">
                                                {category.emojis.map((emoji) => (
                                                    <button
                                                        key={`${category.name}-${emoji.symbol}`}
                                                        type="button"
                                                        className="emoji-option-btn"
                                                        onMouseDown={(event) => event.preventDefault()}
                                                        onClick={() => handleInsertEmoji(emoji.symbol)}
                                                        aria-label={`Insert ${emoji.label}`}
                                                        title={emoji.label}
                                                    >
                                                        {emoji.symbol}
                                                    </button>
                                                ))}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                    <button
                        type="submit"
                        className="send-btn"
                        disabled={(!messageInput.trim() && !pendingMedia) || mediaUploading}
                    >
                        {mediaUploading ? 'Uploading' : 'Send'}
                    </button>
                </div>
            </div>
        </form>
    );
}

export default MessageInput;
