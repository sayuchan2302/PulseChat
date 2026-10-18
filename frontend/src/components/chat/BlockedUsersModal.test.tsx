import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../types';
import { BlockedUsersModal } from './BlockedUsersModal';

const blockedUser: User = {
  id: 7,
  username: 'thinh',
  fullName: 'Thinh Nguyen',
  online: false,
  createdAt: '2026-10-13T00:00:00',
};

describe('BlockedUsersModal', () => {
  afterEach(cleanup);

  it('lists blocked users and requests unblocking the selected account', () => {
    const onUnblock = vi.fn();
    render(
      <BlockedUsersModal
        open
        users={[blockedUser]}
        loading={false}
        error=""
        pendingUserId={null}
        onClose={vi.fn()}
        onUnblock={onUnblock}
      />,
    );

    expect(screen.getByText('Blocked users')).toBeTruthy();
    expect(screen.getByText('Thinh Nguyen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }));

    expect(onUnblock).toHaveBeenCalledWith(blockedUser);
  });
});
