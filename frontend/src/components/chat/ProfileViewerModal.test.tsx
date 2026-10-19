import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../types';
import { ProfileViewerModal, type ProfileViewerModalProps } from './ProfileViewerModal';

const friend: User = {
  id: 42,
  username: 'minh',
  fullName: 'Minh Tran',
  online: true,
  createdAt: '2026-10-13T00:00:00',
  friendshipStatus: 'accepted',
};

function renderProfileModal(overrides: Partial<ProfileViewerModalProps> = {}) {
  const props: ProfileViewerModalProps = {
    user: friend,
    loading: false,
    error: '',
    actionError: '',
    pendingActionKeys: [],
    callActive: false,
    blockedByCurrentUser: false,
    blockActionPending: false,
    onClose: vi.fn(),
    onOpenChat: vi.fn(),
    onStartCall: vi.fn(),
    onSendFriendRequest: vi.fn(),
    onAcceptFriendRequest: vi.fn(),
    onDeclineFriendRequest: vi.fn(),
    onCancelFriendRequest: vi.fn(),
    onToggleBlock: vi.fn(),
    ...overrides,
  };
  const view = render(<ProfileViewerModal {...props} />);
  return { props, ...view };
}

describe('ProfileViewerModal', () => {
  afterEach(cleanup);

  it('renders profile details with the primary friend actions', () => {
    renderProfileModal();

    expect(screen.getByText('Minh Tran')).toBeTruthy();
    expect(screen.getByText('@minh')).toBeTruthy();
    expect(screen.getByText('Online')).toBeTruthy();
    expect(screen.getByText('Friend')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Message' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start audio call with Minh Tran' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start video call with Minh Tran' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Block user' })).toBeTruthy();
  });

  it('closes from the close button and the backdrop, but not from panel clicks', () => {
    const { props, container } = renderProfileModal();

    fireEvent.click(screen.getByRole('button', { name: 'Close user profile' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    const backdrop = container.querySelector<HTMLElement>('.modal-backdrop');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(props.onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('dialog'));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('requests blocking from the separated danger zone', () => {
    const { props } = renderProfileModal();

    fireEvent.click(screen.getByRole('button', { name: 'Block user' }));
    expect(props.onToggleBlock).toHaveBeenCalledWith(friend);
  });

  it('shows the blocked notice and an unblock action for blocked users', () => {
    const { props } = renderProfileModal({ blockedByCurrentUser: true });

    expect(screen.getByText('You blocked this user.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Unblock user' }));
    expect(props.onToggleBlock).toHaveBeenCalledWith(friend);
  });

  it('accepts incoming friend requests with the friendship id', () => {
    const requester: User = {
      ...friend,
      id: 43,
      username: 'lan',
      fullName: 'Lan Le',
      friendshipStatus: 'pending_incoming',
      friendshipId: 9,
    };
    const { props } = renderProfileModal({ user: requester });

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(props.onAcceptFriendRequest).toHaveBeenCalledWith(9, 'accept-profile-43');
  });
});
