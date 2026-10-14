import type { User } from '../../types';
import { renderUserAvatar } from '../../utils/renderUtils';
import { getUserDisplayName } from '../../utils/userUtils';

export interface BlockedUsersModalProps {
  open: boolean;
  users: User[];
  loading: boolean;
  error: string;
  pendingUserId: number | null;
  onClose: () => void;
  onUnblock: (user: User) => void;
}

export function BlockedUsersModal({
  open,
  users,
  loading,
  error,
  pendingUserId,
  onClose,
  onUnblock,
}: BlockedUsersModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop blocked-users-backdrop" role="dialog" aria-modal="true" aria-labelledby="blocked-users-title" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="blocked-users-modal">
        <header className="blocked-users-header">
          <div><span className="main-panel-eyebrow">Privacy</span><h2 id="blocked-users-title">Blocked users</h2></div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close blocked users">×</button>
        </header>
        <p className="blocked-users-description">Blocked users cannot contact you through private messages, calls, or friend requests. Group chats are unchanged. Unblocking does not restore a previous friendship.</p>
        {error ? <div className="blocked-users-error" role="alert">{error}</div> : null}
        {loading ? <div className="blocked-users-state">Loading blocked users…</div> : null}
        {!loading && !error && users.length === 0 ? <div className="blocked-users-state">You have not blocked anyone.</div> : null}
        {!loading && users.length > 0 ? (
          <div className="blocked-users-list">
            {users.map((user) => (
              <div className="blocked-user-row" key={user.id}>
                {renderUserAvatar(user, 'user-avatar small-avatar')}
                <div className="blocked-user-copy"><strong>{getUserDisplayName(user)}</strong><span>@{user.username}</span></div>
                <button type="button" className="blocked-user-unblock" disabled={pendingUserId === user.id} onClick={() => onUnblock(user)}>
                  {pendingUserId === user.id ? 'Unblocking…' : 'Unblock'}
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <footer className="blocked-users-footer"><button type="button" className="secondary-btn" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  );
}

export default BlockedUsersModal;
