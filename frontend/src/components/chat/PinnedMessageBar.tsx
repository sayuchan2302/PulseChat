import type { Message } from '../../types';
import { formatMessageTime } from '../../utils/formatUtils';
import { PinIcon, CloseIcon } from '../../icons/ChatIcons';

export interface PinnedMessageBarProps {
    message: Message;
    onJumpTo: (messageId: number) => void;
    onUnpin: (messageId: number) => void;
}

export function PinnedMessageBar({
    message,
    onJumpTo,
    onUnpin,
}: PinnedMessageBarProps) {
    const senderName = message.senderFullName || message.senderUsername || 'Member';
    const previewContent = message.content || '[Attachment]';

    return (
        <div className="pinned-message-bar">
            <div className="pinned-message-content" onClick={() => onJumpTo(message.id)}>
                <PinIcon className="pinned-message-icon" />
                <div className="pinned-message-details">
                    <div className="pinned-message-header">
                        <span className="pinned-message-sender">{senderName}</span>
                        <span className="pinned-message-time">{formatMessageTime(message.timestamp)}</span>
                    </div>
                    <div className="pinned-message-snippet">{previewContent}</div>
                </div>
            </div>
            <button
                type="button"
                className="pinned-message-unpin-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    onUnpin(message.id);
                }}
                title="Unpin message"
                aria-label="Unpin message"
            >
                <CloseIcon className="pinned-message-close-icon" />
            </button>
        </div>
    );
}

export default PinnedMessageBar;
