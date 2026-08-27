import type { User } from '../../types';
import type { ChatMessage } from '../../types/chat.types';
import { getUserDisplayName } from '../../utils/userUtils';
import { renderUserAvatar } from '../../utils/renderUtils';

interface GroupSeenByProps {
  message: ChatMessage;
  users: User[];
  open: boolean;
  onOpenModal: (message: ChatMessage, users: User[]) => void;
}

export default function GroupSeenBy({ message, users, open, onOpenModal }: GroupSeenByProps) {
  if (users.length === 0) return null;
  const visibleUsers = users.slice(0, 3);
  const extraCount = users.length - visibleUsers.length;
  const label = `Seen by ${users.map(getUserDisplayName).join(', ')}`;
  return (
    <div className="message-seen-by-row">
      <button type="button" className="message-seen-by-btn" onClick={() => onOpenModal(message, users)} aria-label={label} title={label}>
        <span className="message-seen-by-avatars">
          {visibleUsers.map((reader) => <span key={reader.id} className="message-seen-by-avatar-shell">{renderUserAvatar(reader, 'user-avatar message-seen-by-avatar')}</span>)}
        </span>
        {extraCount > 0 ? <span className="message-seen-by-count">+{extraCount}</span> : null}
      </button>
      {open ? <div className="message-seen-by-popover" role="dialog" aria-label="Seen by members"><strong>Seen by</strong><div className="message-seen-by-list">
        {users.map((reader) => <div key={reader.id} className="message-seen-by-item">{renderUserAvatar(reader, 'user-avatar message-seen-by-list-avatar')}<span>{getUserDisplayName(reader)}</span></div>)}
      </div></div> : null}
    </div>
  );
}
