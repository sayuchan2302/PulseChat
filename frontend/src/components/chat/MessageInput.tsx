import type React from 'react';
import type { MessageReply } from '../../types';
import type { MentionCandidate, PendingMedia } from '../../types/chat.types';
import { EMOJI_CATEGORIES } from '../../constants/chatConstants';
import { CloseIcon, DocumentIcon, EmojiIcon, MediaIcon, PaperclipIcon } from '../../icons/ChatIcons';
import VoiceRecorderButton from '../VoiceRecorderButton';
import { formatFileSize, getFileBadgeColor, getFileExtension } from '../../utils/mediaUtils';

export interface MessageInputProps {
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  mediaFileInputRef: React.RefObject<HTMLInputElement | null>;
  docFileInputRef: React.RefObject<HTMLInputElement | null>;
  mediaAccept: string;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  replyPreview: MessageReply | null;
  onCancelReply: () => void;
  pendingMedia: PendingMedia | null;
  mediaError: string;
  mediaUploading: boolean;
  onClearPendingMedia: () => void;
  onOpenMediaPicker: () => void;
  onOpenDocumentPicker: () => void;
  onVoiceRecorded: (blob: Blob, durationSeconds: number) => void;
  emojiButtonRef: React.RefObject<HTMLButtonElement | null>;
  emojiPickerOpen: boolean;
  onToggleEmojiPicker: () => void;
  messageInputRef: React.RefObject<HTMLTextAreaElement | null>;
  messageInput: string;
  onMessageInputChange: (value: string) => void;
  onMessageInputKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onUpdateMessageInputSelection: () => void;
  selectedConversationName: string;
  mentionQuery: string | null;
  mentionCandidates: MentionCandidate[];
  mentionActiveIndex: number;
  onInsertMention: (candidate: MentionCandidate) => void;
  emojiPickerRef: React.RefObject<HTMLDivElement | null>;
  onInsertEmoji: (emoji: string) => void;
}

export function MessageInput(props: MessageInputProps) {
  const {
    onSubmit, mediaFileInputRef, docFileInputRef, mediaAccept, onFileChange,
    replyPreview, onCancelReply, pendingMedia, mediaError, mediaUploading,
    onClearPendingMedia, onOpenMediaPicker, onOpenDocumentPicker, onVoiceRecorded,
    emojiButtonRef, emojiPickerOpen, onToggleEmojiPicker, messageInputRef,
    messageInput, onMessageInputChange, onMessageInputKeyDown,
    onUpdateMessageInputSelection, selectedConversationName, mentionQuery,
    mentionCandidates, mentionActiveIndex, onInsertMention, emojiPickerRef, onInsertEmoji,
  } = props;

  return (
    <form onSubmit={onSubmit} className="message-input-form">
      <input ref={mediaFileInputRef} type="file" className="media-file-input" accept={mediaAccept} onChange={onFileChange} />
      <input ref={docFileInputRef} type="file" className="media-file-input" accept="*/*" onChange={onFileChange} />

      {replyPreview ? (
        <div className="replying-composer-preview">
          <div className="replying-composer-copy">
            <span>Replying to {replyPreview.senderName}</span>
            <p>{replyPreview.content}</p>
          </div>
          <button type="button" className="replying-composer-close" onClick={onCancelReply} aria-label="Cancel reply" title="Cancel reply">
            <CloseIcon className="replying-composer-close-icon" />
          </button>
        </div>
      ) : null}

      {pendingMedia || mediaError ? (
        <div className="pending-media-wrap">
          {pendingMedia ? (
            <div className="pending-media-preview">
              {pendingMedia.type === 'FILE' ? (
                <div className={`pending-media-file-badge ${getFileBadgeColor(getFileExtension(pendingMedia.file.name))}`}>
                  <DocumentIcon className="pending-file-icon" />
                  <span className="pending-file-ext">{getFileExtension(pendingMedia.file.name)}</span>
                </div>
              ) : pendingMedia.resourceType === 'image' ? (
                <img src={pendingMedia.previewUrl} alt="Selected media preview" />
              ) : <video src={pendingMedia.previewUrl} muted preload="metadata" />}
              <div className="pending-media-copy">
                <strong>{pendingMedia.file.name}</strong>
                <span>{mediaUploading ? 'Uploading...' : `${formatFileSize(pendingMedia.file.size)} • Ready to send`}</span>
              </div>
              <button type="button" className="pending-media-remove" onClick={onClearPendingMedia} disabled={mediaUploading} aria-label="Remove selected media">
                <CloseIcon className="pending-media-remove-icon" />
              </button>
            </div>
          ) : null}
          {mediaError ? <div className="media-error-text">{mediaError}</div> : null}
        </div>
      ) : null}

      <div className="message-input-row">
        <div className="message-composer">
          <button type="button" className="composer-icon-btn" onClick={onOpenMediaPicker} disabled={mediaUploading} aria-label="Attach image or video" title="Attach photo/video">
            <MediaIcon className="composer-icon" />
          </button>
          <button type="button" className="composer-icon-btn" onClick={onOpenDocumentPicker} disabled={mediaUploading} aria-label="Attach file or document" title="Attach file">
            <PaperclipIcon className="composer-icon" />
          </button>
          <VoiceRecorderButton disabled={mediaUploading} onRecorded={onVoiceRecorded} />
          <button
            ref={emojiButtonRef}
            type="button"
            className={`composer-icon-btn emoji-toggle-btn ${emojiPickerOpen ? 'active' : ''}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onToggleEmojiPicker}
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
            onChange={(event) => onMessageInputChange(event.target.value)}
            onKeyDown={onMessageInputKeyDown}
            onKeyUp={onUpdateMessageInputSelection}
            onClick={onUpdateMessageInputSelection}
            onSelect={onUpdateMessageInputSelection}
            placeholder={`Message ${selectedConversationName}`}
            className="message-input"
            rows={1}
            disabled={mediaUploading}
          />

          {mentionQuery !== null && mentionCandidates.length > 0 ? (
            <div className="mention-autocomplete-dropdown" role="listbox" aria-label="Mention members">
              <div className="mention-dropdown-header">Mention member</div>
              <div className="mention-dropdown-list">
                {mentionCandidates.map((candidate, index) => (
                  <button
                    key={`${candidate.id}-${candidate.username}`}
                    type="button"
                    className={`mention-dropdown-item ${index === mentionActiveIndex ? 'active' : ''}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onInsertMention(candidate);
                    }}
                  >
                    <div className={`mention-dropdown-avatar ${candidate.isAll ? 'all' : ''}`}>
                      {candidate.isAll ? '@' : candidate.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="mention-dropdown-info">
                      <span className="mention-dropdown-name">{candidate.fullName}</span>
                      <span className="mention-dropdown-username">@{candidate.username}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {emojiPickerOpen ? (
            <div ref={emojiPickerRef} id="emoji-picker-panel" className="emoji-picker-panel" role="dialog" aria-label="Emoji picker">
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
                          onClick={() => onInsertEmoji(emoji.symbol)}
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
        <button type="submit" className="send-btn" disabled={(!messageInput.trim() && !pendingMedia) || mediaUploading}>
          {mediaUploading ? 'Uploading' : 'Send'}
        </button>
      </div>
    </form>
  );
}

export default MessageInput;
