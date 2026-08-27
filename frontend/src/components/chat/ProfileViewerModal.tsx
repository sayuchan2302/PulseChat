import type { CallType, User } from '../../types';
import { PhoneIcon, VideoCallIcon } from '../../icons/ChatIcons';
import { renderUserAvatar } from '../../utils/renderUtils';
import { getPresenceLabel, getRelationshipLabel, getUserDisplayName } from '../../utils/userUtils';

export interface ProfileViewerModalProps {
  user: User | null;
  loading: boolean;
  error: string;
  actionError: string;
  pendingActionKeys: string[];
  callActive: boolean;
  onClose: () => void;
  onOpenChat: (user: User) => void;
  onStartCall: (user: User, callType: CallType) => void;
  onSendFriendRequest: (user: User) => void;
  onAcceptFriendRequest: (requestId: number, actionKey: string) => void;
  onDeclineFriendRequest: (requestId: number, actionKey: string) => void;
  onCancelFriendRequest: (user: User) => void;
}

type ProfileActionsProps = Pick<
  ProfileViewerModalProps,
  | 'pendingActionKeys'
  | 'callActive'
  | 'onOpenChat'
  | 'onStartCall'
  | 'onSendFriendRequest'
  | 'onAcceptFriendRequest'
  | 'onDeclineFriendRequest'
  | 'onCancelFriendRequest'
> & { user: User };

function ProfileActions({
  user,
  pendingActionKeys,
  callActive,
  onOpenChat,
  onStartCall,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onDeclineFriendRequest,
  onCancelFriendRequest,
}: ProfileActionsProps) {
  const messageButton = <button type="button" className="send-btn profile-message-btn" onClick={() => onOpenChat(user)}>Message</button>;
  const callButton = (callType: CallType) => (
    <button
      type="button"
      className="profile-call-btn"
      onClick={() => onStartCall(user, callType)}
      disabled={callActive}
      aria-label={`Start ${callType.toLowerCase()} call with ${getUserDisplayName(user)}`}
      title={`${callType === 'VIDEO' ? 'Video' : 'Audio'} call`}
    >
      {callType === 'VIDEO' ? <VideoCallIcon className="profile-call-icon" /> : <PhoneIcon className="profile-call-icon" />}
    </button>
  );

  if (user.friendshipStatus === 'accepted') {
    return <>{messageButton}{callButton('AUDIO')}{callButton('VIDEO')}</>;
  }
  if (user.friendshipStatus === 'pending_incoming') {
    return user.friendshipId ? <>
      {messageButton}
      <button type="button" className="friend-action-btn" disabled={pendingActionKeys.includes(`accept-profile-${user.id}`)} onClick={() => onAcceptFriendRequest(user.friendshipId!, `accept-profile-${user.id}`)}>Accept</button>
      <button type="button" className="friend-action-btn secondary" disabled={pendingActionKeys.includes(`decline-profile-${user.id}`)} onClick={() => onDeclineFriendRequest(user.friendshipId!, `decline-profile-${user.id}`)}>Decline</button>
    </> : null;
  }
  if (user.friendshipStatus === 'pending_outgoing') {
    return <>
      {messageButton}<span className="friend-status-pill">Pending</span>
      <button type="button" className="friend-action-btn secondary" disabled={!user.friendshipId || pendingActionKeys.includes(`cancel-${user.id}`)} onClick={() => onCancelFriendRequest(user)}>Cancel</button>
    </>;
  }
  return <>
    {messageButton}
    <button type="button" className="friend-action-btn" disabled={pendingActionKeys.includes(`send-${user.id}`)} onClick={() => onSendFriendRequest(user)}>Add friend</button>
  </>;
}

export function ProfileViewerModal({
  user,
  loading,
  error,
  actionError,
  pendingActionKeys,
  callActive,
  onClose,
  onOpenChat,
  onStartCall,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onDeclineFriendRequest,
  onCancelFriendRequest,
}: ProfileViewerModalProps) {
  if (!user) return null;

  return (
    <div className="modal-backdrop">
      <div className="user-profile-modal" role="dialog" aria-modal="true" aria-labelledby="view-profile-title">
        <div className="user-profile-header">
          <span>Profile</span>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close user profile">×</button>
        </div>
        <div className="user-profile-body">
          {renderUserAvatar(user, 'user-avatar profile-view-avatar')}
          <div className="user-profile-copy"><h3 id="view-profile-title">{getUserDisplayName(user)}</h3><span>@{user.username}</span></div>
          {user.bio?.trim() ? <p className="profile-bio">{user.bio}</p> : null}
          {loading ? <div className="profile-loading">Refreshing profile...</div> : null}
          {error ? <div className="profile-action-error">{error}</div> : null}
          <div className="profile-info-grid">
            <div className="profile-info-item"><span>Status</span><strong className={user.online ? 'online' : 'offline'}>{getPresenceLabel(user)}</strong></div>
            <div className="profile-info-item"><span>Relationship</span><strong>{getRelationshipLabel(user)}</strong></div>
          </div>
          <div className="profile-action-row">
            <ProfileActions
              user={user}
              pendingActionKeys={pendingActionKeys}
              callActive={callActive}
              onOpenChat={onOpenChat}
              onStartCall={onStartCall}
              onSendFriendRequest={onSendFriendRequest}
              onAcceptFriendRequest={onAcceptFriendRequest}
              onDeclineFriendRequest={onDeclineFriendRequest}
              onCancelFriendRequest={onCancelFriendRequest}
            />
          </div>
          {actionError ? <div className="profile-action-error">{actionError}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default ProfileViewerModal;
