import React, { useState } from 'react';
import type { Message, User } from '../../types';
import { getUserDisplayName } from '../../utils/userUtils';
import { renderUserAvatar } from '../../utils/renderUtils';
import { formatMessageTime } from '../../utils/formatUtils';
import { CloseIcon, SearchIcon } from '../../icons/ChatIcons';

export interface GroupSeenByModalProps {
    message: Message;
    seenUsers: User[];
    onClose: () => void;
}

export function GroupSeenByModal({
    message,
    seenUsers,
    onClose,
}: GroupSeenByModalProps) {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredUsers = seenUsers.filter((u) => {
        const name = getUserDisplayName(u).toLowerCase();
        const uname = (u.username || '').toLowerCase();
        const q = searchQuery.toLowerCase().trim();
        return !q || name.includes(q) || uname.includes(q);
    });

    return (
        <div
            className="modal-backdrop group-seen-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Seen by details"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="group-modal group-seen-modal">
                <div className="group-modal-header">
                    <div className="group-seen-modal-title-group">
                        <h3>Read Receipts</h3>
                        <span className="group-seen-modal-subtitle">
                            Seen by {seenUsers.length} {seenUsers.length === 1 ? 'member' : 'members'}
                        </span>
                    </div>
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

                <div className="group-seen-modal-preview">
                    <div className="group-seen-preview-label">Message</div>
                    <div className="group-seen-preview-text">
                        {message.content || '[Media attachment]'}
                    </div>
                    <div className="group-seen-preview-time">
                        Sent {formatMessageTime(message.timestamp)}
                    </div>
                </div>

                {seenUsers.length > 5 ? (
                    <div className="group-seen-search-box">
                        <SearchIcon className="group-seen-search-icon" />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter members..."
                            aria-label="Filter read members"
                        />
                    </div>
                ) : null}

                <div className="group-seen-user-list">
                    {filteredUsers.length === 0 ? (
                        <div className="group-seen-empty">No matching members</div>
                    ) : (
                        filteredUsers.map((user) => (
                            <div key={user.id} className="group-seen-user-item">
                                {renderUserAvatar(user, 'user-avatar small-avatar')}
                                <div className="group-seen-user-info">
                                    <span className="group-seen-user-name">{getUserDisplayName(user)}</span>
                                    <span className="group-seen-user-username">@{user.username}</span>
                                </div>
                                <span className="group-seen-check-icon" title="Read">
                                    ✓✓
                                </span>
                            </div>
                        ))
                    )}
                </div>

                <div className="group-modal-actions">
                    <button type="button" className="secondary-btn" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

export default GroupSeenByModal;
