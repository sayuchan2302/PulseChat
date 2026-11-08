import { useState } from 'react';
import type { ChatRoom, User } from '../../types';

export interface ForwardPickerBodyProps {
  friends: User[];
  rooms: ChatRoom[];
  onSelect: (targetUserId: number | null, targetRoomId: number | null) => boolean | void | Promise<boolean | void>;
}

export function ForwardPickerBody({
  friends,
  rooms,
  onSelect,
}: ForwardPickerBodyProps) {
  const [query, setQuery] = useState('');
  const [sendingKeys, setSendingKeys] = useState<Record<string, boolean>>({});
  const [sentKeys, setSentKeys] = useState<Record<string, boolean>>({});

  const lowerQuery = query.toLowerCase();
  const filteredFriends = friends.filter(
    (user) =>
      (user.fullName ?? user.username).toLowerCase().includes(lowerQuery) ||
      user.username.toLowerCase().includes(lowerQuery),
  );
  const filteredRooms = rooms.filter((room) => room.name.toLowerCase().includes(lowerQuery));

  const handleSendToTarget = async (
    key: string,
    targetUserId: number | null,
    targetRoomId: number | null,
  ) => {
    if (sendingKeys[key] || sentKeys[key]) {
      return;
    }

    setSendingKeys((current) => ({ ...current, [key]: true }));
    try {
      const result = await onSelect(targetUserId, targetRoomId);
      if (result !== false) {
        setSentKeys((current) => ({ ...current, [key]: true }));
      }
    } finally {
      setSendingKeys((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <>
      <div className="forward-picker-search-wrap">
        <input
          className="forward-picker-search"
          type="text"
          placeholder="Search people or groups…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
      </div>
      <div className="forward-picker-list">
        {filteredFriends.length === 0 && filteredRooms.length === 0 ? (
          <div className="forward-picker-empty">No results</div>
        ) : null}
        {filteredFriends.map((user) => {
          const key = `dm-${user.id}`;
          const isSending = Boolean(sendingKeys[key]);
          const isSent = Boolean(sentKeys[key]);
          return (
            <button
              key={key}
              type="button"
              className="forward-picker-item"
              disabled={isSending || isSent}
              onClick={() => void handleSendToTarget(key, user.id, null)}
            >
              <div className="forward-picker-avatar">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.username} />
                ) : (
                  <span>{(user.fullName ?? user.username).charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="forward-picker-name">
                <span>{user.fullName ?? user.username}</span>
                <small>@{user.username}</small>
              </div>
              <span className={`forward-picker-send-btn ${isSent ? 'sent' : ''}`}>
                {isSent ? 'Sent ✓' : isSending ? 'Sending…' : 'Send'}
              </span>
            </button>
          );
        })}
        {filteredRooms.map((room) => {
          const key = `room-${room.id}`;
          const isSending = Boolean(sendingKeys[key]);
          const isSent = Boolean(sentKeys[key]);
          return (
            <button
              key={key}
              type="button"
              className="forward-picker-item"
              disabled={isSending || isSent}
              onClick={() => void handleSendToTarget(key, null, room.id)}
            >
              <div className="forward-picker-avatar group">
                <span>{room.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="forward-picker-name">
                <span>{room.name}</span>
                <small>{room.participants.length} members</small>
              </div>
              <span className={`forward-picker-send-btn ${isSent ? 'sent' : ''}`}>
                {isSent ? 'Sent ✓' : isSending ? 'Sending…' : 'Send'}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export default ForwardPickerBody;
