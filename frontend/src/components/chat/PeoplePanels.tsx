import type { Friendship, User } from '../../types';
import { FriendRequestIcon, FriendsIcon, RefreshIcon } from '../../icons/ChatIcons';
import { renderUserAvatar } from '../../utils/renderUtils';
import { getUserDisplayName, shouldShowUsername } from '../../utils/userUtils';

const SKELETON_KEYS = ['friend-panel-1', 'friend-panel-2', 'friend-panel-3'];

function PeoplePanelSkeletons() {
  return (
    <div className="main-list" aria-hidden="true">
      {SKELETON_KEYS.map((key) => (
        <div key={key} className="main-list-item main-list-item-skeleton">
          <div className="skeleton-avatar" />
          <div className="skeleton-user-info">
            <div className="skeleton-line name" />
            <div className="skeleton-line status" />
          </div>
        </div>
      ))}
    </div>
  );
}

export type FriendsPanelProps = {
  friends: User[];
  filteredFriends: User[];
  searchQuery: string;
  loading: boolean;
  error: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onRefresh: () => void;
  onRetry: () => void;
  onOpenProfile: (user: User) => void;
  onOpenChat: (user: User) => void;
};

export function FriendsPanel({
  friends,
  filteredFriends,
  searchQuery,
  loading,
  error,
  onSearchChange,
  onClearSearch,
  onRefresh,
  onRetry,
  onOpenProfile,
  onOpenChat,
}: FriendsPanelProps) {
  const onlineFriendCount = friends.filter((friend) => friend.online).length;

  return (
    <section className="main-panel people-panel" aria-labelledby="friends-panel-title">
      <div className="main-panel-header">
        <div className="main-panel-heading">
          <span className="panel-heading-icon"><FriendsIcon className="panel-heading-svg" /></span>
          <div>
            <span className="main-panel-eyebrow">Friends</span>
            <h3 id="friends-panel-title">Friend list</h3>
            <p>{friends.length} friends - {onlineFriendCount} online</p>
          </div>
        </div>
        <button type="button" className="panel-icon-action" onClick={onRefresh} aria-label="Refresh friend list" title="Refresh">
          <RefreshIcon className="panel-action-icon" />
        </button>
      </div>

      {friends.length > 0 ? (
        <div className="main-panel-search" role="search">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="main-panel-search-input"
            placeholder="Search friends by name or username"
            aria-label="Search friends by name or username"
            autoComplete="off"
            spellCheck={false}
          />
          {searchQuery ? <button type="button" className="main-panel-search-clear" onClick={onClearSearch} aria-label="Clear friend search">×</button> : null}
        </div>
      ) : null}

      {loading && friends.length === 0 ? <PeoplePanelSkeletons /> : null}
      {!loading && error && friends.length === 0 ? (
        <div className="main-panel-state error-state"><span>{error}</span><button type="button" className="retry-btn" onClick={onRetry}>Retry</button></div>
      ) : null}
      {!loading && !error && friends.length === 0 ? (
        <div className="main-panel-state panel-empty-state"><span className="panel-empty-icon"><FriendsIcon className="panel-heading-svg" /></span><strong>No friends yet</strong><span>Search username in the sidebar to add friends.</span></div>
      ) : null}
      {friends.length > 0 && filteredFriends.length === 0 ? (
        <div className="main-panel-state panel-empty-state"><span className="panel-empty-icon"><FriendsIcon className="panel-heading-svg" /></span><strong>No matching friends</strong><span>Try another name or username.</span></div>
      ) : null}
      {filteredFriends.length > 0 ? (
        <div className="main-list">
          {filteredFriends.map((user) => (
            <div key={user.id} className="main-list-item friend-main-item">
              <button type="button" className="friend-main-profile-trigger" onClick={() => onOpenProfile(user)} aria-label={`View profile of ${getUserDisplayName(user)}`}>
                <div className="main-list-avatar-wrap">
                  {renderUserAvatar(user)}
                  <span className={`main-list-presence-dot ${user.online ? 'online' : 'offline'}`} aria-hidden="true" />
                </div>
                <div className="main-list-copy"><strong>{getUserDisplayName(user)}</strong><span>@{user.username}</span></div>
              </button>
              <button type="button" className="friend-action-btn secondary friend-main-message-btn" onClick={() => onOpenChat(user)}>Message</button>
              <span className={`main-status-pill ${user.online ? 'online' : 'offline'}`}>{user.online ? 'Online' : 'Offline'}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export type FriendRequestsPanelProps = {
  incomingRequests: Friendship[];
  pendingCount: number;
  loading: boolean;
  error: string;
  pendingActionKeys: string[];
  onRefresh: () => void;
  onRetry: () => void;
  onAccept: (requestId: number, actionKey: string) => void;
  onDecline: (requestId: number, actionKey: string) => void;
};

export function FriendRequestsPanel({
  incomingRequests,
  pendingCount,
  loading,
  error,
  pendingActionKeys,
  onRefresh,
  onRetry,
  onAccept,
  onDecline,
}: FriendRequestsPanelProps) {
  return (
    <section className="main-panel people-panel" aria-labelledby="requests-panel-title">
      <div className="main-panel-header">
        <div className="main-panel-heading">
          <span className="panel-heading-icon"><FriendRequestIcon className="panel-heading-svg" /></span>
          <div><span className="main-panel-eyebrow">Requests</span><h3 id="requests-panel-title">Friend requests</h3><p>{pendingCount} pending requests</p></div>
        </div>
        <button type="button" className="panel-icon-action" onClick={onRefresh} aria-label="Refresh friend requests" title="Refresh"><RefreshIcon className="panel-action-icon" /></button>
      </div>

      {loading ? <PeoplePanelSkeletons /> : null}
      {!loading && error ? <div className="main-panel-state error-state"><span>{error}</span><button type="button" className="retry-btn" onClick={onRetry}>Retry</button></div> : null}
      {!loading && !error && incomingRequests.length === 0 ? (
        <div className="main-panel-state panel-empty-state"><span className="panel-empty-icon"><FriendRequestIcon className="panel-heading-svg" /></span><strong>No pending requests</strong><span>New requests will appear here.</span></div>
      ) : null}
      {!loading && !error && incomingRequests.length > 0 ? (
        <div className="main-list">
          {incomingRequests.map((friendship) => {
            const requesterName = getUserDisplayName(friendship.requester);
            return (
              <div key={friendship.id} className="main-list-item request-main-item">
                <div className="main-list-avatar-wrap">{renderUserAvatar(friendship.requester)}</div>
                <div className="main-list-copy">
                  <strong>{requesterName}</strong>
                  {shouldShowUsername(friendship.requester) ? <span>@{friendship.requester.username}</span> : <span>Incoming friend request</span>}
                  <small>Waiting for your response</small>
                </div>
                <div className="request-actions">
                  <button type="button" className="friend-action-btn" disabled={pendingActionKeys.includes(`accept-request-${friendship.id}`)} onClick={() => onAccept(friendship.id, `accept-request-${friendship.id}`)} aria-label={`Accept friend request from ${requesterName}`}>Accept</button>
                  <button type="button" className="friend-action-btn secondary" disabled={pendingActionKeys.includes(`decline-request-${friendship.id}`)} onClick={() => onDecline(friendship.id, `decline-request-${friendship.id}`)} aria-label={`Decline friend request from ${requesterName}`}>Decline</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
