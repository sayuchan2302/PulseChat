import type { GroupMemberRole, User } from '../../types';
import { MoreIcon } from '../../icons/ChatIcons';
import { renderUserAvatar } from '../../utils/renderUtils';
import { getUserAccountDisplayName, getUserDisplayName } from '../../utils/userUtils';

export interface GroupMemberListItemProps {
  user: User;
  currentUserId: number | null;
  ownerId: number | null;
  currentUserIsOwner: boolean;
  saving: boolean;
  pendingAction: string | null;
  nicknameValue: string;
  menuOpen: boolean;
  editingNickname: boolean;
  canKick: boolean;
  onToggleMenu: (userId: number) => void;
  onOpenProfile: (user: User) => void;
  onStartEditNickname: (user: User) => void;
  onUpdateRole: (user: User, role: GroupMemberRole) => void;
  onTransferOwner: (user: User) => void;
  onKick: (user: User) => void;
  onNicknameChange: (userId: number, value: string) => void;
  onSaveNickname: (user: User) => void;
  onCancelNicknameEdit: (user: User) => void;
}

export function GroupMemberListItem({
  user,
  currentUserId,
  ownerId,
  currentUserIsOwner,
  saving,
  pendingAction,
  nicknameValue,
  menuOpen,
  editingNickname,
  canKick,
  onToggleMenu,
  onOpenProfile,
  onStartEditNickname,
  onUpdateRole,
  onTransferOwner,
  onKick,
  onNicknameChange,
  onSaveNickname,
  onCancelNicknameEdit,
}: GroupMemberListItemProps) {
  const isCurrentUser = user.id === currentUserId;
  const isOwner = user.id === ownerId || user.role === 'OWNER';
  const isModerator = user.role === 'MODERATOR';
  const memberDisplayName = getUserDisplayName(user);
  const accountDisplayName = getUserAccountDisplayName(user);
  const nicknameChanged = nicknameValue.trim() !== (user.nickname ?? '').trim();

  return (
    <div className={`details-member-item ${editingNickname ? 'editing' : ''}`}>
      {renderUserAvatar(user, 'user-avatar small-avatar')}
      <div className="details-member-copy">
        <div className="details-member-title">
          <strong>{memberDisplayName}</strong>
          {isOwner ? <span className="details-role-badge owner-badge">👑 Owner</span> : isModerator ? <span className="details-role-badge mod-badge">🛡️ Moderator</span> : null}
        </div>
        {user.username ? <span>@{user.username}</span> : null}
      </div>
      <div className="details-member-menu-wrap">
        <button type="button" className="details-member-menu-btn" disabled={saving} onClick={() => onToggleMenu(user.id)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`Member actions for ${memberDisplayName}`} title="Member actions"><MoreIcon className="details-member-menu-icon" /></button>
        {menuOpen ? <div className="details-member-menu" role="menu">
          {!isCurrentUser ? <button type="button" role="menuitem" onClick={() => onOpenProfile(user)}>View profile</button> : null}
          <button type="button" role="menuitem" onClick={() => onStartEditNickname(user)}>Edit nickname</button>
          {currentUserIsOwner && !isCurrentUser ? <>
            <button type="button" role="menuitem" disabled={saving} onClick={() => onUpdateRole(user, isModerator ? 'MEMBER' : 'MODERATOR')}>{pendingAction === `role-${user.id}` ? 'Updating...' : isModerator ? 'Demote from moderator' : 'Promote to moderator'}</button>
            <button type="button" role="menuitem" disabled={saving} onClick={() => onTransferOwner(user)}>{pendingAction === `owner-${user.id}` ? 'Transferring...' : 'Transfer group ownership'}</button>
          </> : null}
          {canKick ? <button type="button" role="menuitem" className="danger" disabled={saving} onClick={() => onKick(user)}>{pendingAction === `kick-${user.id}` ? 'Removing...' : 'Remove from group'}</button> : null}
        </div> : null}
      </div>
      {editingNickname ? <div className="details-member-editor">
        <input type="text" value={nicknameValue} placeholder={accountDisplayName} maxLength={80} disabled={saving} autoComplete="off" spellCheck={false} aria-label={`Nickname for ${accountDisplayName}`} onChange={(event) => onNicknameChange(user.id, event.target.value)} />
        <div className="details-member-editor-actions">
          <button type="button" className="details-small-action-btn" disabled={!nicknameChanged || saving} onClick={() => onSaveNickname(user)}>{pendingAction === `nickname-${user.id}` ? 'Saving' : 'Save'}</button>
          <button type="button" className="details-small-action-btn secondary" disabled={saving} onClick={() => onCancelNicknameEdit(user)}>Cancel</button>
        </div>
      </div> : null}
    </div>
  );
}

export default GroupMemberListItem;
