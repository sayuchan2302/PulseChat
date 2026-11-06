import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MessageReplyQuote from './MessageReplyQuote';

describe('MessageReplyQuote', () => {
  it('renders replied sender and content and triggers onJumpToMessage when clicked', () => {
    const onJumpToMessage = vi.fn();
    render(
      <MessageReplyQuote
        reply={{
          id: 42,
          senderId: 2,
          senderName: 'Ngoc Mai',
          content: 'See you at 8 PM',
        }}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    const button = screen.getByRole('button', { name: /jump to replied message from ngoc mai/i });
    expect(screen.getByText('Ngoc Mai')).toBeInTheDocument();
    expect(screen.getByText('See you at 8 PM')).toBeInTheDocument();

    fireEvent.click(button);
    expect(onJumpToMessage).toHaveBeenCalledWith(42);
  });
});

