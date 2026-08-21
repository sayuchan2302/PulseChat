import type { User } from '../../types';
import { getUserDisplayName } from '../../utils/userUtils';
import { renderUserAvatar } from '../../utils/renderUtils';

export interface AddMembersModalProps {
  roomName: string;
  candidates: User[];
  selectedMemberIds: number[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onToggleMember: (userId: number) => void;
  onAddMembers: () => Promise<void>;
}

export function AddMembersModal({
  roomName,
  candidates,
  selectedMemberIds,
  saving,
  error,
  onClose,
  onToggleMember,
  onAddMembers,
}: AddMembersModalProps) {
  const canAddMembers = selectedMemberIds.length > 0 && !saving;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-members-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="group-modal add-members-modal">
        <div className="group-modal-header">
          <div>
            <h3 id="add-members-modal-title">Add members</h3>
            <p>Add friends to {roomName}</p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="add-members-modal-body">
          {candidates.length === 0 ? (
            <div className="details-empty-text">All friends are already in this group.</div>
          ) : (
            <div className="details-add-member-list">
              {candidates.map((friend) => (
                <label key={friend.id} className="details-add-member-option">
                  <input
                    type="checkbox"
                    checked={selectedMemberIds.includes(friend.id)}
                    disabled={saving}
                    onChange={() => onToggleMember(friend.id)}
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
          {error ? <div className="group-error">{error}</div> : null}
        </div>

        <div className="group-modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={!canAddMembers}
            onClick={() => void onAddMembers()}
          >
            {saving ? 'Adding...' : 'Add to group'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddMembersModal;
