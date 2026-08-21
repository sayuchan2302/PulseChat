import type { ReactNode } from 'react';
import type { ConversationFilter } from '../../types/chat.types';
import { GroupPlusIcon } from '../../icons/ChatIcons';

export interface ConversationSidebarProps {
  userSearchQuery: string;
  onUserSearchChange: (value: string) => void;
  onClearUserSearch: () => void;
  hasUserSearch: boolean;
  conversationFilters: readonly { value: ConversationFilter; label: string }[];
  conversationFilter: ConversationFilter;
  onConversationFilterChange: (filter: ConversationFilter) => void;
  conversationSettingsError: string;
  sidebarBusy: boolean;
  onOpenCreateGroup: () => void;
  children: ReactNode;
}

export function ConversationSidebar({
  userSearchQuery,
  onUserSearchChange,
  onClearUserSearch,
  hasUserSearch,
  conversationFilters,
  conversationFilter,
  onConversationFilterChange,
  conversationSettingsError,
  sidebarBusy,
  onOpenCreateGroup,
  children,
}: ConversationSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <h3>Chats</h3>
          <button
            type="button"
            className="new-group-btn"
            onClick={onOpenCreateGroup}
            aria-label="Create group"
            title="Create group"
          >
            <GroupPlusIcon className="new-group-icon" />
          </button>
        </div>
        <div className="user-search" role="search">
          <input
            type="search"
            value={userSearchQuery}
            onChange={(event) => onUserSearchChange(event.target.value)}
            className="user-search-input"
            placeholder="Search username to add"
            aria-label="Search users by username"
            autoComplete="off"
            spellCheck={false}
          />
          {userSearchQuery ? (
            <button type="button" className="user-search-clear" onClick={onClearUserSearch} aria-label="Clear user search">
              ×
            </button>
          ) : null}
        </div>
        {!hasUserSearch ? (
          <div className="conversation-filter" role="tablist" aria-label="Conversation filter">
            {conversationFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                role="tab"
                className={`conversation-filter-btn ${conversationFilter === filter.value ? 'active' : ''}`}
                aria-selected={conversationFilter === filter.value}
                onClick={() => onConversationFilterChange(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        ) : null}
        {conversationSettingsError ? <div className="conversation-settings-error">{conversationSettingsError}</div> : null}
      </div>
      <div className="user-list" aria-busy={sidebarBusy} aria-label="Chat list">{children}</div>
    </aside>
  );
}

export default ConversationSidebar;
