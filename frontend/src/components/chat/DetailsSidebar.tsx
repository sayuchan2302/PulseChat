import type React from 'react';
import type { User, ChatRoom } from '../../types/chat.types';
import {
    CloseIcon,
    ChevronDownIcon,
} from '../../icons/ChatIcons';
import {
    getUserDisplayName,
    getPresenceLabel,
    shouldShowUsername,
    sortParticipantsForDetails,
} from '../../utils/userUtils';
import { renderUserAvatar, renderRoomAvatar } from '../../utils/renderUtils';

export interface DetailsSidebarProps {
    selectedUser: User | null;
    selectedRoom: ChatRoom | null;
    handleCloseConversationDetails: () => void;
    renderSharedContentSections: () => React.ReactNode;
    currentUserCanManageSelectedRoom: boolean;
    groupAvatarUploading: boolean;
    groupSettingsSaving: boolean;
    handleGroupAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    isEditingGroupName: boolean;
    handleUpdateGroupSettingsName: (e: React.FormEvent) => Promise<void>;
    groupSettingsName: string;
    setGroupSettingsError: (err: string) => void;
    setGroupSettingsName: (name: string) => void;
    canSaveGroupSettingsName: boolean;
    groupSettingsPendingAction: string | null;
    setIsEditingGroupName: (editing: boolean) => void;
    currentUserMemberRole: string | null;
    isCurrentUserOwner: boolean;
    isCurrentUserModerator: boolean;
    handleOpenInviteModal: () => Promise<void>;
    selectedRoomOwnerName: string;
    groupSettingsError: string;
    selectedAddMemberIds: number[];
    addMemberCandidates: User[];
    handleToggleAddRoomMember: (id: number) => void;
    canAddRoomMembers: boolean;
    handleAddRoomMembers: () => Promise<void>;
    groupMembersExpanded: boolean;
    setGroupMembersExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    renderDetailsMemberItem: (member: User) => React.ReactNode;
    handleDeleteSelectedGroup: () => Promise<void>;
    handleLeaveSelectedGroup: () => Promise<void>;
}

export function DetailsSidebar({
    selectedUser,
    selectedRoom,
    handleCloseConversationDetails,
    renderSharedContentSections,
    currentUserCanManageSelectedRoom,
    groupAvatarUploading,
    groupSettingsSaving,
    handleGroupAvatarChange,
    isEditingGroupName,
    handleUpdateGroupSettingsName,
    groupSettingsName,
    setGroupSettingsError,
    setGroupSettingsName,
    canSaveGroupSettingsName,
    groupSettingsPendingAction,
    setIsEditingGroupName,
    currentUserMemberRole,
    isCurrentUserOwner,
    isCurrentUserModerator,
    handleOpenInviteModal,
    selectedRoomOwnerName,
    groupSettingsError,
    selectedAddMemberIds,
    addMemberCandidates,
    handleToggleAddRoomMember,
    canAddRoomMembers,
    handleAddRoomMembers,
    groupMembersExpanded,
    setGroupMembersExpanded,
    renderDetailsMemberItem,
    handleDeleteSelectedGroup,
    handleLeaveSelectedGroup,
}: DetailsSidebarProps) {
    if (selectedUser) {
        return (
            <aside
                id="conversation-details"
                className="details-sidebar"
                aria-label="Conversation details"
            >
                <div className="details-header">
                    <h3>Details</h3>
                    <button
                        type="button"
                        className="details-close-btn"
                        onClick={handleCloseConversationDetails}
                        aria-label="Close conversation details"
                        title="Close details"
                    >
                        <CloseIcon className="details-close-icon" />
                    </button>
                </div>

                <div className="details-profile">
                    {renderUserAvatar(selectedUser, 'user-avatar details-avatar')}
                    <h4>{getUserDisplayName(selectedUser)}</h4>
                    {shouldShowUsername(selectedUser) ? <span>@{selectedUser.username}</span> : null}
                    <span className={`details-status ${selectedUser.online ? 'online' : 'offline'}`}>
                        {getPresenceLabel(selectedUser)}
                    </span>
                    {selectedUser.bio?.trim() ? <p className="details-bio">{selectedUser.bio}</p> : null}
                </div>

                <section className="details-section" aria-labelledby="private-details-title">
                    <h4 id="private-details-title">Account</h4>
                    <div className="details-row">
                        <span>Username</span>
                        <strong>@{selectedUser.username}</strong>
                    </div>
                    <div className="details-row">
                        <span>Friendship</span>
                        <strong>Friend</strong>
                    </div>
                </section>

                {renderSharedContentSections()}
            </aside>
        );
    }

    if (selectedRoom) {
        const sortedParticipants = sortParticipantsForDetails(selectedRoom.participants);

        return (
            <aside
                id="conversation-details"
                className="details-sidebar"
                aria-label="Conversation details"
            >
                <div className="details-header">
                    <h3>Details</h3>
                    <button
                        type="button"
                        className="details-close-btn"
                        onClick={handleCloseConversationDetails}
                        aria-label="Close conversation details"
                        title="Close details"
                    >
                        <CloseIcon className="details-close-icon" />
                    </button>
                </div>

                <div className="details-profile">
                    <div className="details-room-avatar-container">
                        {renderRoomAvatar(selectedRoom, 'user-avatar room-avatar details-avatar')}
                        {currentUserCanManageSelectedRoom ? (
                            <label className="details-avatar-upload-overlay" title="Change group avatar">
                                <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    disabled={groupAvatarUploading || groupSettingsSaving}
                                    onChange={(e) => void handleGroupAvatarChange(e)}
                                />
                                <span>{groupAvatarUploading ? '...' : '📷'}</span>
                            </label>
                        ) : null}
                    </div>
                    {isEditingGroupName ? (
                        <form
                            className="details-group-name-inline-form"
                            onSubmit={(e) => void handleUpdateGroupSettingsName(e)}
                        >
                            <input
                                type="text"
                                className="details-group-name-inline-input"
                                value={groupSettingsName}
                                onChange={(event) => {
                                    setGroupSettingsError('');
                                    setGroupSettingsName(event.target.value);
                                }}
                                maxLength={100}
                                disabled={groupSettingsSaving}
                                autoFocus
                                placeholder="Group name..."
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        setIsEditingGroupName(false);
                                        setGroupSettingsName(selectedRoom.name);
                                    }
                                }}
                            />
                            <div className="details-group-name-inline-actions">
                                <button
                                    type="submit"
                                    className="details-group-name-btn save"
                                    disabled={!canSaveGroupSettingsName || groupSettingsSaving}
                                    title="Save group name"
                                    aria-label="Save group name"
                                >
                                    {groupSettingsPendingAction === 'rename' ? '⏳' : '✓'}
                                </button>
                                <button
                                    type="button"
                                    className="details-group-name-btn cancel"
                                    disabled={groupSettingsSaving}
                                    onClick={() => {
                                        setIsEditingGroupName(false);
                                        setGroupSettingsName(selectedRoom.name);
                                    }}
                                    title="Cancel"
                                    aria-label="Cancel"
                                >
                                    ✕
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="details-group-name-row">
                            <h4>{selectedRoom.name}</h4>
                            {currentUserCanManageSelectedRoom ? (
                                <button
                                    type="button"
                                    className="details-group-name-edit-btn"
                                    onClick={() => {
                                        setGroupSettingsName(selectedRoom.name);
                                        setGroupSettingsError('');
                                        setIsEditingGroupName(true);
                                    }}
                                    title="Edit group name"
                                    aria-label="Edit group name"
                                >
                                    ✏️
                                </button>
                            ) : null}
                        </div>
                    )}
                    {currentUserMemberRole ? (
                        <span
                            className={`details-role-badge ${isCurrentUserOwner
                                ? 'owner-badge'
                                : isCurrentUserModerator
                                    ? 'mod-badge'
                                    : 'member-badge'
                                }`}
                        >
                            {isCurrentUserOwner ? '👑 Owner' : isCurrentUserModerator ? '🛡️ Moderator' : 'Member'}
                        </span>
                    ) : null}
                    <span className="details-member-count-label">
                        {selectedRoom.participants.length} members
                    </span>
                </div>

                <section className="details-section" aria-labelledby="group-settings-title">
                    <div className="details-section-heading">
                        <h4 id="group-settings-title">Group Management</h4>
                        {currentUserCanManageSelectedRoom ? (
                            <span>{isCurrentUserOwner ? 'Owner' : 'Moderator'}</span>
                        ) : null}
                    </div>

                    {currentUserCanManageSelectedRoom ? (
                        <div className="details-group-management-stack">
                            <button
                                type="button"
                                className="details-action-btn secondary details-invite-btn"
                                onClick={() => void handleOpenInviteModal()}
                            >
                                🔗 Group Invite Link
                            </button>

                        </div>
                    ) : (
                        <div className="details-row">
                            <span>Owner</span>
                            <strong>{selectedRoomOwnerName || 'Owner'}</strong>
                        </div>
                    )}

                    {groupSettingsError ? (
                        <div className="details-error">{groupSettingsError}</div>
                    ) : null}
                </section>

                {renderSharedContentSections()}

                {currentUserCanManageSelectedRoom ? (
                    <section className="details-section" aria-labelledby="add-members-title">
                        <div className="details-section-heading">
                            <h4 id="add-members-title">Add Members</h4>
                            {selectedAddMemberIds.length > 0 ? <span>{selectedAddMemberIds.length}</span> : null}
                        </div>

                        {addMemberCandidates.length === 0 ? (
                            <div className="details-empty-text">All friends are already in this group.</div>
                        ) : (
                            <div className="details-add-member-list">
                                {addMemberCandidates.map((friend) => (
                                    <label key={friend.id} className="details-add-member-option">
                                        <input
                                            type="checkbox"
                                            checked={selectedAddMemberIds.includes(friend.id)}
                                            disabled={groupSettingsSaving}
                                            onChange={() => handleToggleAddRoomMember(friend.id)}
                                        />
                                        {renderUserAvatar(friend, 'user-avatar small-avatar')}
                                        <span className="details-add-member-copy">
                                            <strong>{getUserDisplayName(friend)}</strong>
                                            <small>@{friend.username}</small>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}

                        <button
                            type="button"
                            className="details-action-btn"
                            disabled={!canAddRoomMembers}
                            onClick={() => void handleAddRoomMembers()}
                        >
                            {groupSettingsPendingAction === 'add' ? 'Adding...' : 'Add to group'}
                        </button>
                    </section>
                ) : null}

                <section className="details-section" aria-labelledby="group-members-title">
                    <button
                        type="button"
                        className="details-section-toggle-btn"
                        onClick={() => setGroupMembersExpanded((current) => !current)}
                        aria-expanded={groupMembersExpanded}
                        aria-controls="group-members-list"
                    >
                        <div className="details-section-heading">
                            <h4 id="group-members-title">Members</h4>
                            <span>{selectedRoom.participants.length}</span>
                        </div>
                        <ChevronDownIcon
                            className={`details-toggle-icon ${groupMembersExpanded ? 'expanded' : ''}`}
                        />
                    </button>
                    {groupMembersExpanded ? (
                        <div id="group-members-list" className="details-member-list">
                            {sortedParticipants.map(renderDetailsMemberItem)}
                        </div>
                    ) : null}
                </section>

                <section className="details-section details-danger-zone" aria-labelledby="leave-group-title">
                    <h4 id="leave-group-title">{isCurrentUserOwner ? 'Danger Zone' : 'Leave Group'}</h4>
                    {isCurrentUserOwner ? (
                        <button
                            type="button"
                            className="details-action-btn danger"
                            disabled={groupSettingsSaving}
                            onClick={() => void handleDeleteSelectedGroup()}
                        >
                            {groupSettingsPendingAction === 'delete-room' ? 'Dissolving...' : 'Dissolve Group'}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className={`details-action-btn ${isCurrentUserOwner ? 'ghost-danger' : 'danger'}`}
                        disabled={groupSettingsSaving}
                        onClick={() => void handleLeaveSelectedGroup()}
                    >
                        {groupSettingsPendingAction === 'leave' ? 'Leaving...' : 'Leave Group'}
                    </button>
                </section>
            </aside>
        );
    }

    return null;
}

export default DetailsSidebar;
