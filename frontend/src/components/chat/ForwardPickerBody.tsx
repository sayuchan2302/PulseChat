import { useState } from 'react';
import type { ChatRoom, User } from '../../types';

export interface ForwardPickerBodyProps {
  friends: User[];
  rooms: ChatRoom[];
  onSelect: (targetUserId: number | null, targetRoomId: number | null) => void;
}

export function ForwardPickerBody({
  friends,
  rooms,
  onSelect,
}: ForwardPickerBodyProps) {
  const [query, setQuery] = useState('');
  const lowerQuery = query.toLowerCase();
  const filteredFriends = friends.filter(
    (user) =>
      (user.fullName ?? user.username).toLowerCase().includes(lowerQuery) ||
      user.username.toLowerCase().includes(lowerQuery),
  );
  const filteredRooms = rooms.filter((room) => room.name.toLowerCase().includes(lowerQuery));

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
        {filteredFriends.map((user) => (
          <button
            key={`dm-${user.id}`}
            type="button"
            className="forward-picker-item"
            onClick={() => onSelect(user.id, null)}
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
          </button>
        ))}
        {filteredRooms.map((room) => (
          <button
            key={`room-${room.id}`}
            type="button"
            className="forward-picker-item"
            onClick={() => onSelect(null, room.id)}
          >
            <div className="forward-picker-avatar group">
              <span>{room.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="forward-picker-name">
              <span>{room.name}</span>
              <small>{room.participants.length} members</small>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

export default ForwardPickerBody;
