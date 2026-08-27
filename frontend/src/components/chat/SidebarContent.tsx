import type { MouseEvent } from 'react';
import type { ChatRoom, ConversationSetting, User } from '../../types';
import type { ConversationFilter, ConversationTarget, SidebarConversationItem } from '../../types/chat.types';
import { USER_SKELETON_KEYS } from '../../constants/chatConstants';
import { ArchiveIcon, MoreIcon, MutedIcon, PinIcon, ProfileIcon, TrashIcon } from '../../icons/ChatIcons';
import { formatSidebarTime } from '../../utils/formatUtils';
import { getConversationPreviewText, getRoomPreviewText, hasPrivateConversation } from '../../utils/conversationUtils';
import { getFriendshipStatusLabel, getRoomInitial, getUserDisplayName, getUserStatusClass, shouldShowUsername } from '../../utils/userUtils';
import { renderUserAvatar } from '../../utils/renderUtils';

type ConversationSettingsPatch = Partial<Pick<ConversationSetting, 'pinned' | 'muted' | 'archived'>>;

export interface SidebarContentProps {
  hasUserSearch: boolean;
  users: User[];
  usersLoading: boolean;
  usersError: string;
  userSearchQuery: string;
  usersEmptyMessage: string;
  rooms: ChatRoom[];
  roomsError: string;
  sidebarBusy: boolean;
  conversationFilter: ConversationFilter;
  conversationItems: SidebarConversationItem[];
  currentUser: User | null;
  selectedUserId: number | null;
  selectedRoomId: number | null;
  friendActionKeys: string[];
  openConversationMenuKey: string | null;
  pendingConversationKey: string | null;
  onLoadUsers: (options?: { search?: string; silent?: boolean }) => void;
  onLoadRooms: () => void;
  onSelectUser: (user: User) => void;
  onSelectRoom: (room: ChatRoom) => void;
  onOpenProfile: (user: User) => void;
  onSendFriendRequest: (user: User) => void;
  onAcceptFriendRequest: (requestId: number, actionKey: string) => void;
  onCancelFriendRequest: (user: User) => void;
  onToggleConversationMenu: (targetKey: string, event: MouseEvent<HTMLButtonElement>) => void;
  onUpdateConversationSetting: (target: ConversationTarget, patch: ConversationSettingsPatch) => void;
  onRequestDelete: (target: ConversationTarget) => void;
}

function ConversationStatusIcons({ target }: { target: ConversationTarget }) {
  const item = target.type === 'user' ? target.user : target.room;
  if (!item.pinned && !item.muted && !item.archived) return null;
  return <div className="conversation-status-icons" aria-label="Conversation settings">
    {item.pinned ? <PinIcon className="conversation-status-icon" /> : null}
    {item.muted ? <MutedIcon className="conversation-status-icon" /> : null}
    {item.archived ? <ArchiveIcon className="conversation-status-icon" /> : null}
  </div>;
}

function FriendshipAction({
  user,
  pendingKeys,
  onSend,
  onAccept,
  onCancel,
}: {
  user: User;
  pendingKeys: string[];
  onSend: (user: User) => void;
  onAccept: (requestId: number, actionKey: string) => void;
  onCancel: (user: User) => void;
}) {
  if (user.friendshipStatus === 'pending_incoming') {
    return user.friendshipId ? <button type="button" className="friend-action-btn" disabled={pendingKeys.includes(`accept-user-${user.id}`)} onClick={(event) => { event.stopPropagation(); onAccept(user.friendshipId!, `accept-user-${user.id}`); }}>Accept</button> : null;
  }
  if (user.friendshipStatus === 'pending_outgoing') {
    return <div className="friend-actions"><span className="friend-status-pill">Pending</span><button type="button" className="friend-action-btn secondary" disabled={!user.friendshipId || pendingKeys.includes(`cancel-${user.id}`)} onClick={(event) => { event.stopPropagation(); onCancel(user); }}>Cancel</button></div>;
  }
  if (user.friendshipStatus === 'accepted') return <span className="friend-status-pill accepted">Friend</span>;
  return <button type="button" className="friend-action-btn" disabled={pendingKeys.includes(`send-${user.id}`)} onClick={(event) => { event.stopPropagation(); onSend(user); }}>Add</button>;
}

function ConversationMenu({
  target,
  openKey,
  pendingKey,
  onToggle,
  onUpdate,
  onOpenProfile,
  onRequestDelete,
}: {
  target: ConversationTarget;
  openKey: string | null;
  pendingKey: string | null;
  onToggle: (key: string, event: MouseEvent<HTMLButtonElement>) => void;
  onUpdate: (target: ConversationTarget, patch: ConversationSettingsPatch) => void;
  onOpenProfile: (user: User) => void;
  onRequestDelete: (target: ConversationTarget) => void;
}) {
  const item = target.type === 'user' ? target.user : target.room;
  const key = `${target.type}-${item.id}`;
  const pending = pendingKey === key;
  return <div className="conversation-menu-wrap" onClick={(event) => event.stopPropagation()}>
    <button type="button" className="conversation-menu-btn" disabled={pending} onClick={(event) => onToggle(key, event)} aria-haspopup="menu" aria-expanded={openKey === key} aria-label="Conversation actions" title="Conversation actions"><MoreIcon className="conversation-menu-icon" /></button>
    {openKey === key ? <div className="conversation-menu" role="menu">
      {target.type === 'user' ? <button type="button" role="menuitem" onClick={() => onOpenProfile(target.user)}><ProfileIcon className="conversation-menu-item-icon" />View profile</button> : null}
      <button type="button" role="menuitem" disabled={pending} onClick={() => onUpdate(target, { pinned: !item.pinned })}><PinIcon className="conversation-menu-item-icon" />{item.pinned ? 'Unpin' : 'Pin'}</button>
      <button type="button" role="menuitem" disabled={pending} onClick={() => onUpdate(target, { muted: !item.muted })}><MutedIcon className="conversation-menu-item-icon" />{item.muted ? 'Unmute' : 'Mute'}</button>
      <button type="button" role="menuitem" disabled={pending} onClick={() => onUpdate(target, { archived: !item.archived })}><ArchiveIcon className="conversation-menu-item-icon" />{item.archived ? 'Unarchive' : 'Archive'}</button>
      <button type="button" role="menuitem" className="danger" disabled={pending} onClick={() => onRequestDelete(target)}><TrashIcon className="conversation-menu-item-icon" />Delete</button>
    </div> : null}
  </div>;
}

function SidebarSkeletons() {
  return <>{USER_SKELETON_KEYS.map((key) => <div key={key} className="user-item user-item-skeleton" aria-hidden="true"><div className="skeleton-avatar" /><div className="skeleton-user-info"><div className="skeleton-line name" /><div className="skeleton-line status" /></div></div>)}</>;
}

export function SidebarContent(props: SidebarContentProps) {
  const {
    hasUserSearch, users, usersLoading, usersError, userSearchQuery, usersEmptyMessage, rooms, roomsError,
    sidebarBusy, conversationFilter, conversationItems, currentUser, selectedUserId, selectedRoomId,
    friendActionKeys, openConversationMenuKey, pendingConversationKey, onLoadUsers, onLoadRooms,
    onSelectUser, onSelectRoom, onOpenProfile, onSendFriendRequest, onAcceptFriendRequest,
    onCancelFriendRequest, onToggleConversationMenu, onUpdateConversationSetting, onRequestDelete,
  } = props;

  const renderUserIdentity = (user: User, preview = false) => <>
    {preview ? <span className="conversation-avatar-presence">{renderUserAvatar(user)}<span className={`conversation-presence-dot ${user.online ? 'online' : 'offline'}`} role="img" aria-label={user.online ? 'Online' : 'Offline'} /></span> : renderUserAvatar(user)}
    <div className="user-info"><div className="user-title-row"><div className="user-name">{getUserDisplayName(user)}</div></div>
      {preview ? <div className="user-preview-row"><span className="user-preview">{getConversationPreviewText(user, currentUser?.id ?? null)}{formatSidebarTime(user.lastMessageAt) ? ` · ${formatSidebarTime(user.lastMessageAt)}` : ''}</span></div> : <div className="user-meta"><span className={`user-status ${getUserStatusClass(user)}`}>{getFriendshipStatusLabel(user)}</span>{shouldShowUsername(user) ? <span className="user-username">@{user.username}</span> : null}</div>}
    </div>
  </>;

  const renderUser = (user: User) => {
    const preview = !hasUserSearch && hasPrivateConversation(user);
    const unreadCount = user.unreadCount ?? 0;
    if (preview) {
      const target: ConversationTarget = { type: 'user', user };
      return <div key={user.id} className={`conversation-list-row ${selectedUserId === user.id ? 'active' : ''}`}>
        <button type="button" className={`user-item conversation-trigger ${selectedUserId === user.id ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}`} onClick={() => onSelectUser(user)}>{renderUserIdentity(user, true)}<ConversationStatusIcons target={target} /></button>
        {unreadCount > 0 ? <div className="unread-badge">{unreadCount}</div> : null}
        <ConversationMenu target={target} openKey={openConversationMenuKey} pendingKey={pendingConversationKey} onToggle={onToggleConversationMenu} onUpdate={onUpdateConversationSetting} onOpenProfile={onOpenProfile} onRequestDelete={onRequestDelete} />
      </div>;
    }
    const isFriend = user.friendshipStatus === 'accepted';
    return <div key={user.id} className="user-item relationship-item profile-result-item">
      <button type="button" className="profile-result-trigger" onClick={() => isFriend ? onSelectUser(user) : onOpenProfile(user)} aria-label={isFriend ? `Open chat with ${getUserDisplayName(user)}` : `View profile for ${getUserDisplayName(user)}`}>{renderUserIdentity(user)}</button>
      {!isFriend ? <div className="friend-actions"><FriendshipAction user={user} pendingKeys={friendActionKeys} onSend={onSendFriendRequest} onAccept={onAcceptFriendRequest} onCancel={onCancelFriendRequest} /></div> : null}
    </div>;
  };

  const renderRoom = (room: ChatRoom) => {
    const unreadCount = room.unreadCount ?? 0;
    const target: ConversationTarget = { type: 'room', room };
    const sidebarTime = formatSidebarTime(room.lastMessageAt);
    const mentioned = Boolean(room.lastMessageContent && (/@all\b/i.test(room.lastMessageContent) || (currentUser && room.lastMessageContent.toLowerCase().includes(`@${currentUser.username.toLowerCase()}`))));
    return <div key={`room-${room.id}`} className={`conversation-list-row ${selectedRoomId === room.id ? 'active' : ''}`}>
      <button type="button" className={`user-item room-item conversation-trigger ${selectedRoomId === room.id ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}`} onClick={() => onSelectRoom(room)}>
        <div className="user-avatar room-avatar">{getRoomInitial(room)}</div><div className="user-info"><div className="user-title-row"><div className="user-name">{room.name}</div></div><div className="user-preview-row"><span className="user-preview">{getRoomPreviewText(room, currentUser?.id ?? null)}{sidebarTime ? ` · ${sidebarTime}` : ''}</span></div></div><ConversationStatusIcons target={target} />
      </button>
      {unreadCount > 0 ? <div className="unread-badge-wrap">{mentioned ? <span className="mention-unread-indicator" title="You were mentioned">@</span> : null}<div className="unread-badge">{unreadCount}</div></div> : null}
      <ConversationMenu target={target} openKey={openConversationMenuKey} pendingKey={pendingConversationKey} onToggle={onToggleConversationMenu} onUpdate={onUpdateConversationSetting} onOpenProfile={onOpenProfile} onRequestDelete={onRequestDelete} />
    </div>;
  };

  if (hasUserSearch) {
    if (usersLoading) return <SidebarSkeletons />;
    if (usersError) return <div className="list-state error-state"><span>{usersError}</span><button type="button" className="retry-btn" onClick={() => onLoadUsers({ search: userSearchQuery })}>Retry</button></div>;
    if (users.length === 0) return <div className="list-state">{usersEmptyMessage}</div>;
    return <>{users.map(renderUser)}</>;
  }

  const hasAnyConversation = conversationItems.length > 0;
  const emptyMessage = conversationFilter === 'archived' ? 'No archived conversations.' : conversationFilter === 'unread' ? 'No unread conversations.' : 'No conversations yet. Search a username to start a chat.';
  if (sidebarBusy && !hasAnyConversation) return <SidebarSkeletons />;
  if (!sidebarBusy && !usersError && !roomsError && !hasAnyConversation) return <div className="list-state empty-groups-state"><span>{emptyMessage}</span></div>;
  return <>
    {usersError && users.filter(hasPrivateConversation).length === 0 ? <div className="list-state error-state"><span>{usersError}</span><button type="button" className="retry-btn" onClick={() => onLoadUsers({ search: '' })}>Retry</button></div> : null}
    {roomsError && rooms.length === 0 ? <div className="list-state error-state"><span>{roomsError}</span><button type="button" className="retry-btn" onClick={onLoadRooms}>Retry</button></div> : null}
    {conversationItems.map((item) => item.type === 'user' ? renderUser(item.user) : renderRoom(item.room))}
  </>;
}

export default SidebarContent;
