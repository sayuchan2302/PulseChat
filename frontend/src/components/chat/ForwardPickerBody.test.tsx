import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatRoom, User } from '../../types';
import { ForwardPickerBody } from './ForwardPickerBody';

const mockFriends: User[] = [
  { id: 2, username: 'alice', fullName: 'Alice Nguyen', online: true, createdAt: '2026-01-01' },
  { id: 3, username: 'bob', fullName: 'Bob Tran', online: false, createdAt: '2026-01-01' },
];

const mockRooms: ChatRoom[] = [
  { id: 10, name: 'Engineering Team', type: 'group', participants: mockFriends, createdAt: '2026-01-01' },
];

describe('ForwardPickerBody', () => {
  it('forwards to multiple recipients sequentially and marks each as Sent', async () => {
    const onSelect = vi.fn().mockResolvedValue(true);

    render(
      <ForwardPickerBody
        friends={mockFriends}
        rooms={mockRooms}
        onSelect={onSelect}
      />,
    );

    const aliceButton = screen.getByRole('button', { name: /alice nguyen/i });
    const roomButton = screen.getByRole('button', { name: /engineering team/i });

    fireEvent.click(aliceButton);
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(2, null);
      expect(aliceButton).toBeDisabled();
      expect(aliceButton).toHaveTextContent('Sent ✓');
    });

    fireEvent.click(roomButton);
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(null, 10);
      expect(roomButton).toBeDisabled();
      expect(roomButton).toHaveTextContent('Sent ✓');
    });
  });
});
