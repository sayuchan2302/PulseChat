import { useState } from 'react';
import type { User } from '../../types';
import { getUserDisplayName } from '../../utils/userUtils';
import { renderUserAvatar } from '../../utils/renderUtils';
import { CloseIcon } from '../../icons/ChatIcons';

export interface ReactionDetailGroup {
    emoji: string;
    users: User[];
}

export interface ReactionSummaryModalProps {
    reactionGroups: ReactionDetailGroup[];
    onClose: () => void;
}

export function ReactionSummaryModal({
    reactionGroups,
    onClose,
}: ReactionSummaryModalProps) {
    const [selectedEmoji, setSelectedEmoji] = useState<string>('ALL');

    const allUsers = reactionGroups.flatMap((g) => g.users);
    const totalCount = allUsers.length;

    const currentUsers =
        selectedEmoji === 'ALL'
            ? allUsers
            : reactionGroups.find((g) => g.emoji === selectedEmoji)?.users || [];

    return (
        <div
            className="modal-backdrop reaction-summary-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Reactions breakdown"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="group-modal reaction-summary-modal">
                <div className="group-modal-header">
                    <h3>Reactions ({totalCount})</h3>
                    <button
                        type="button"
                        className="modal-close-btn"
                        onClick={onClose}
                        aria-label="Close"
                        title="Close"
                    >
                        <CloseIcon className="modal-close-icon" />
                    </button>
                </div>

                <div className="reaction-summary-tabs">
                    <button
                        type="button"
                        className={`reaction-tab ${selectedEmoji === 'ALL' ? 'active' : ''}`}
                        onClick={() => setSelectedEmoji('ALL')}
                    >
                        All ({totalCount})
                    </button>
                    {reactionGroups.map((g) => (
                        <button
                            key={g.emoji}
                            type="button"
                            className={`reaction-tab ${selectedEmoji === g.emoji ? 'active' : ''}`}
                            onClick={() => setSelectedEmoji(g.emoji)}
                        >
                            <span>{g.emoji}</span>
                            <small>{g.users.length}</small>
                        </button>
                    ))}
                </div>

                <div className="reaction-summary-user-list">
                    {currentUsers.map((user, idx) => (
                        <div key={`${user.id}-${idx}`} className="reaction-summary-user-item">
                            {renderUserAvatar(user, 'user-avatar small-avatar')}
                            <div className="reaction-summary-user-info">
                                <span className="reaction-summary-user-name">{getUserDisplayName(user)}</span>
                                <span className="reaction-summary-user-handle">@{user.username}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default ReactionSummaryModal;
