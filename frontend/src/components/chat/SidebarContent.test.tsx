import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatRoom, User } from '../../types';
import type { SidebarConversationItem } from '../../types/chat.types';
import { SidebarContent, type SidebarContentProps } from './SidebarContent';

function createBaseProps(overrides: Partial<SidebarContentProps> = {}): SidebarContentProps {
  return {
    hasUserSearch: false,
    users: [],
    usersLoading: false,
    usersError: '',
    userSearchQuery: '',
    usersEmptyMessage: 'No users found.',
    rooms: [],
    roomsError: '',
    sidebarBusy: false,
    conversationFilter: 'all',
    conversationItems: [],
    currentUser: {
      id: 1,
      username: 'thinh',
      fullName: 'Ngoc Thinh',
      online: true,
      createdAt: '2026-11-01T00:00:00Z',
    },
    selectedUserId: null,
    selectedRoomId: null,
    friendActionKeys: [],
    blockedUserIds: [],
    openConversationMenuKey: null,
    pendingConversationKey: null,
    conversationDrafts: {},
    onLoadUsers: vi.fn(),
    onLoadRooms: vi.fn(),
    onSelectUser: vi.fn(),
    onSelectRoom: vi.fn(),
    onOpenProfile: vi.fn(),
    onSendFriendRequest: vi.fn(),
    onAcceptFriendRequest: vi.fn(),
    onCancelFriendRequest: vi.fn(),
    onToggleConversationMenu: vi.fn(),
    onUpdateConversationSetting: vi.fn(),
    onRequestDelete: vi.fn(),
    ...overrides,
  };
}

describe('SidebarContent unread badge layout', () => {
  it('renders direct conversation unread badge inside the conversation trigger button', () => {
    const partner: User = {
      id: 2,
      username: 'ngocmai',
      fullName: 'Ngoc Mai',
      online: true,
      friendshipStatus: 'accepted',
      lastMessageContent: 'lalal',
      lastMessageAt: new Date().toISOString(),
      unreadCount: 1,
      createdAt: '2026-11-01T00:00:00Z',
    };
    const items: SidebarConversationItem[] = [
      { type: 'user', user: partner },
    ];

    const { container } = render(
      <SidebarContent {...createBaseProps({ users: [partner], conversationItems: items })} />
    );

    const triggerBtn = container.querySelector('button.user-item.conversation-trigger.unread');
    expect(triggerBtn).not.toBeNull();
    const meta = triggerBtn?.querySelector('.conversation-item-meta');
    expect(meta).not.toBeNull();
    const badge = meta?.querySelector('.unread-badge-wrap > .unread-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('1');
  });

  it('caps unread badge count at 99+ and renders @ mention indicator for rooms', () => {
    const room: ChatRoom = {
      id: 10,
      name: 'Engineering',
      type: 'group',
      participants: [],
      createdAt: new Date().toISOString(),
      lastMessageContent: 'Hey @thinh please review',
      lastMessageAt: new Date().toISOString(),
      unreadCount: 125,
      pinned: true,
    };
    const items: SidebarConversationItem[] = [
      { type: 'room', room },
    ];

    const { container } = render(
      <SidebarContent {...createBaseProps({ rooms: [room], conversationItems: items })} />
    );

    const triggerBtn = container.querySelector('button.room-item.conversation-trigger.unread') as HTMLElement;
    expect(triggerBtn).not.toBeNull();
    expect(within(triggerBtn).getByTitle('You were mentioned')).toHaveTextContent('@');
    expect(triggerBtn.querySelector('.unread-badge')?.textContent).toBe('99+');
    expect(triggerBtn.querySelector('.conversation-status-icons')).not.toBeNull();
  });

  it('omits conversation-item-meta when unreadCount is 0 and no status icons are active', () => {
    const partner: User = {
      id: 3,
      username: 'bob',
      fullName: 'Bob Smith',
      online: false,
      friendshipStatus: 'accepted',
      lastMessageContent: 'See you tomorrow',
      lastMessageAt: new Date().toISOString(),
      unreadCount: 0,
      createdAt: '2026-11-01T00:00:00Z',
    };
    const items: SidebarConversationItem[] = [
      { type: 'user', user: partner },
    ];

    const { container } = render(
      <SidebarContent {...createBaseProps({ users: [partner], conversationItems: items })} />
    );

    expect(container.querySelector('.conversation-item-meta')).toBeNull();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });
});
