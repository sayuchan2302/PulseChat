import type { ChangeEvent, FormEvent } from 'react';
import type { User } from '../../types';
import { BIO_MAX_LENGTH, AVATAR_ACCEPT, MAX_AVATAR_SIZE_MB } from '../../constants/chatConstants';
import { MediaIcon } from '../../icons/ChatIcons';
import { getUserInitial } from '../../utils/userUtils';

export interface ProfileEditorModalProps {
  open: boolean;
  currentUser: User | null;
  fullName: string;
  bio: string;
  avatarPreview: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFullNameChange: (value: string) => void;
  onBioChange: (value: string) => void;
}

export function ProfileEditorModal({
  open,
  currentUser,
  fullName,
  bio,
  avatarPreview,
  saving,
  error,
  onClose,
  onSubmit,
  onAvatarChange,
  onFullNameChange,
  onBioChange,
}: ProfileEditorModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="group-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
        <form onSubmit={onSubmit} className="group-form profile-form">
          <div className="group-modal-header">
            <div><h3 id="edit-profile-title">Edit profile</h3><p>@{currentUser?.username}</p></div>
            <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close edit profile" disabled={saving}>×</button>
          </div>

          <div className="profile-avatar-editor">
            <label className="profile-avatar-upload" aria-label="Change avatar">
              <div className="user-avatar profile-avatar-preview">
                {avatarPreview ? <img src={avatarPreview} alt="" /> : getUserInitial(currentUser)}
              </div>
              <span className="profile-avatar-edit-badge" aria-hidden="true"><MediaIcon className="profile-avatar-edit-icon" /></span>
              <input type="file" accept={AVATAR_ACCEPT} onChange={onAvatarChange} disabled={saving} />
            </label>
            <small className="profile-avatar-help">Click your avatar to change it · JPG, PNG, GIF, or WebP · Max {MAX_AVATAR_SIZE_MB}MB</small>
          </div>

          <label className="group-field">
            <span>Full name</span>
            <input type="text" value={fullName} onChange={(event) => onFullNameChange(event.target.value)} placeholder="Ngoc Thinh" maxLength={100} autoFocus disabled={saving} />
          </label>
          <label className="group-field">
            <span>Bio</span>
            <textarea value={bio} onChange={(event) => onBioChange(event.target.value)} placeholder="Write a short status" maxLength={BIO_MAX_LENGTH} rows={3} disabled={saving} />
            <small className="profile-bio-count">{bio.trim().length}/{BIO_MAX_LENGTH}</small>
          </label>
          {error ? <div className="group-error">{error}</div> : null}
          <div className="group-modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="send-btn" disabled={saving}>{saving ? 'Saving' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProfileEditorModal;
