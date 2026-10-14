import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import type { GlobalMessageSearchItem } from '../../types';
import GlobalMessageSearchModal from './GlobalMessageSearchModal';

vi.mock('../../services/api', () => ({ apiClient: { get: vi.fn() } }));

const result: GlobalMessageSearchItem = {
  conversationName: 'Avery Jones',
  otherUserId: 7,
  otherUsername: 'avery',
  message: {
    id: 42,
    content: 'The project launch is tomorrow',
    senderId: 7,
    senderUsername: 'avery',
    senderFullName: 'Avery Jones',
    timestamp: '2026-10-14T10:00:00',
    read: true,
  },
};

describe('GlobalMessageSearchModal', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('searches across conversations and opens the selected message result', async () => {
    vi.useFakeTimers();
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { items: [result], hasMore: false, nextBefore: null },
    } as never);
    const onOpenResult = vi.fn().mockResolvedValue(undefined);
    render(<GlobalMessageSearchModal onClose={vi.fn()} onOpenResult={onOpenResult} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'launch' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });

    expect(apiClient.get).toHaveBeenCalledWith('/messages/search', {
      params: { query: 'launch', size: 30 },
    });
    expect(screen.getAllByText('Avery Jones')).toHaveLength(2);
    expect(screen.getByText('The project launch is tomorrow')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Avery Jones/ }));
    });
    expect(onOpenResult).toHaveBeenCalledWith(result);
  });
});
