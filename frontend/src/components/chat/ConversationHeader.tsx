import type { CallType, ChatRoom, User } from '../../types';
import {
  ArrowLeftIcon,
  GroupPlusIcon,
  InfoIcon,
  PhoneIcon,
  SearchIcon,
  VideoCallIcon,
} from '../../icons/ChatIcons';
import { getUserDisplayName, getPresenceLabel, getRoomInitial } from '../../utils/userUtils';
import { renderUserAvatar } from '../../utils/renderUtils';

export interface ConversationHeaderProps {
  selectedUser: User | null;
  selectedRoom: ChatRoom | null;
  selectedConversationName: string;
  canStartPrivateCall: boolean;
  canAddMembers: boolean;
  detailsOpen: boolean;
  rightSidebarTab: 'details' | 'search';
  onBackToChatList: () => void;
  onStartCall: (callType: CallType) => void;
  onOpenUserProfile: (user: User) => void;
  onOpenAddMembers: () => void;
  onToggleMessageSearch: () => void;
  onToggleConversationDetails: () => void;
}

export function ConversationHeader({
  selectedUser,
  selectedRoom,
  selectedConversationName,
  canStartPrivateCall,
  canAddMembers,
  detailsOpen,
  rightSidebarTab,
  onBackToChatList,
  onStartCall,
  onOpenUserProfile,
  onOpenAddMembers,
  onToggleMessageSearch,
  onToggleConversationDetails,
}: ConversationHeaderProps) {
  const searchIsOpen = detailsOpen && rightSidebarTab === 'search';
  const detailsAreOpen = detailsOpen && rightSidebarTab === 'details';

  return (
    <div className="chat-area-header">
      <button
        type="button"
        className="mobile-chat-list-btn"
        onClick={onBackToChatList}
        aria-label="Back to chat list"
        title="Back to chats"
      >
        <ArrowLeftIcon className="mobile-chat-list-icon" />
      </button>
      {selectedUser ? (
        <button
          type="button"
          className="selected-user selected-user-profile-btn"
          onClick={() => onOpenUserProfile(selectedUser)}
          aria-label={`View profile of ${getUserDisplayName(selectedUser)}`}
          title="View profile"
        >
          {renderUserAvatar(selectedUser)}
          <div className="selected-user-copy">
            <div className="user-name">{selectedConversationName}</div>
            <div className="user-meta">
              <span className={`user-status ${selectedUser.online ? 'online' : 'offline'}`}>
                {getPresenceLabel(selectedUser)}
              </span>
            </div>
          </div>
        </button>
      ) : (
        <div className="selected-user">
          <div className="user-avatar room-avatar">{selectedRoom ? getRoomInitial(selectedRoom) : '?'}</div>
          <div className="selected-user-copy">
            <div className="user-name">{selectedConversationName}</div>
            <div className="user-meta">
              <span className="user-status">{selectedRoom?.participants.length ?? 0} members</span>
            </div>
          </div>
        </div>
      )}
      <div className="conversation-header-actions">
        {selectedUser ? (
          <>
            <button
              type="button"
              className="conversation-call-btn"
              onClick={() => onStartCall('AUDIO')}
              disabled={!canStartPrivateCall}
              aria-label={`Start audio call with ${getUserDisplayName(selectedUser)}`}
              title="Audio call"
            >
              <PhoneIcon className="conversation-call-icon" />
            </button>
            <button
              type="button"
              className="conversation-call-btn"
              onClick={() => onStartCall('VIDEO')}
              disabled={!canStartPrivateCall}
              aria-label={`Start video call with ${getUserDisplayName(selectedUser)}`}
              title="Video call"
            >
              <VideoCallIcon className="conversation-call-icon" />
            </button>
          </>
        ) : null}
        {selectedRoom && canAddMembers ? (
          <button
            type="button"
            className="conversation-call-btn"
            onClick={onOpenAddMembers}
            aria-label="Add members"
            title="Add members"
          >
            <GroupPlusIcon className="conversation-call-icon" />
          </button>
        ) : null}
        <button
          type="button"
          className={`conversation-search-toggle ${searchIsOpen ? 'active' : ''}`}
          onClick={onToggleMessageSearch}
          aria-label={searchIsOpen ? 'Close message search' : 'Search in conversation'}
          title="Search in conversation"
        >
          <SearchIcon className="conversation-search-icon" />
        </button>
        <button
          type="button"
          className={`conversation-details-toggle ${detailsAreOpen ? 'active' : ''}`}
          onClick={onToggleConversationDetails}
          aria-label={detailsAreOpen ? 'Hide conversation details' : 'Show conversation details'}
          aria-expanded={detailsAreOpen}
          aria-controls="conversation-details"
          title={detailsAreOpen ? 'Hide details' : 'Show details'}
        >
          <InfoIcon className="conversation-details-icon" />
        </button>
      </div>
    </div>
  );
}

export default ConversationHeader;
