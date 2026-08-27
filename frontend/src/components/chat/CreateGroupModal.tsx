import type { FormEvent } from 'react';
import type { User } from '../../types';
import { MIN_GROUP_MEMBERS } from '../../constants/chatConstants';
import { renderUserAvatar } from '../../utils/renderUtils';
import { getUserDisplayName, shouldShowUsername } from '../../utils/userUtils';

export interface CreateGroupModalProps {
  open: boolean;
  friends: User[];
  groupName: string;
  selectedMemberIds: number[];
  requirementText: string;
  creating: boolean;
  canCreate: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGroupNameChange: (value: string) => void;
  onToggleMember: (userId: number) => void;
}

export function CreateGroupModal({
  open,
  friends,
  groupName,
  selectedMemberIds,
  requirementText,
  creating,
  canCreate,
  error,
  onClose,
  onSubmit,
  onGroupNameChange,
  onToggleMember,
}: CreateGroupModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="group-modal" role="dialog" aria-modal="true" aria-labelledby="create-group-title">
        <form onSubmit={onSubmit} className="group-form">
          <div className="group-modal-header">
            <div><h3 id="create-group-title">New group</h3><p>{requirementText}</p></div>
            <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close create group">×</button>
          </div>
          <label className="group-field">
            <span>Group name</span>
            <input type="text" value={groupName} onChange={(event) => onGroupNameChange(event.target.value)} placeholder="Weekend plans" maxLength={100} autoFocus />
          </label>
          <div className="group-field">
            <div className="group-field-heading"><span>Members</span><small>Minimum {MIN_GROUP_MEMBERS} members</small></div>
            <div className="group-member-list">
              {friends.length === 0 ? <div className="list-state">No friends available.</div> : friends.map((user) => (
                <label key={user.id} className="group-member-option">
                  <input type="checkbox" checked={selectedMemberIds.includes(user.id)} onChange={() => onToggleMember(user.id)} />
                  {renderUserAvatar(user, 'user-avatar small-avatar')}
                  <span className="group-member-copy"><span>{getUserDisplayName(user)}</span>{shouldShowUsername(user) ? <small>@{user.username}</small> : null}</span>
                </label>
              ))}
            </div>
          </div>
          {error ? <div className="group-error">{error}</div> : null}
          <div className="group-modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="send-btn" disabled={!canCreate}>{creating ? 'Creating' : 'Create group'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateGroupModal;
