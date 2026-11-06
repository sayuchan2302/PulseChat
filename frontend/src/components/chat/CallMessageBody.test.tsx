import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../types';
import type { ChatMessage } from '../../types/chat.types';
import CallMessageBody, { type CallMessageBodyProps } from './CallMessageBody';

const mockPeer: User = {
  id: 2,
  username: 'bob',
  fullName: 'Bob Smith',
  online: true,
  createdAt: '2026-01-01T00:00:00',
};

const baseCallMessage: ChatMessage = {
  id: 101,
  content: '',
  type: 'CALL',
  senderId: 1,
  receiverId: 2,
  callerId: 1,
  callId: 50,
  callType: 'AUDIO',
  callStatus: 'ENDED',
  callDurationSeconds: 12,
  timestamp: '2026-10-20T14:30:00',
  read: true,
};

function renderCallCard(overrides: Partial<CallMessageBodyProps> = {}) {
  const props: CallMessageBodyProps = {
    message: baseCallMessage,
    peer: mockPeer,
    isSentByCurrentUser: true,
    canCallBack: true,
    onCallBack: vi.fn(),
    onDeleteForMe: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<CallMessageBody {...props} />) };
}

describe('CallMessageBody', () => {
  afterEach(cleanup);

  it('renders caller outgoing completed call with duration and Call again button', () => {
    const { props } = renderCallCard({
      isSentByCurrentUser: true,
      message: { ...baseCallMessage, callStatus: 'ENDED', callDurationSeconds: 75 },
    });

    expect(screen.getByText('Outgoing audio call')).toBeTruthy();
    expect(screen.getByText(/1m 15s/)).toBeTruthy();

    const callAgainBtn = screen.getByRole('button', { name: /Call again/i });
    expect(callAgainBtn).toBeTruthy();
    fireEvent.click(callAgainBtn);
    expect(props.onCallBack).toHaveBeenCalledWith(expect.objectContaining({ id: 101 }));
  });

  it('renders receiver incoming completed call with duration and Call back button', () => {
    renderCallCard({
      isSentByCurrentUser: false,
      message: { ...baseCallMessage, callStatus: 'ENDED', callDurationSeconds: 12 },
    });

    expect(screen.getByText('Incoming audio call')).toBeTruthy();
    expect(screen.getByText(/12s/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Call back/i })).toBeTruthy();
  });

  it('renders receiver missed call with is-missed styling and Call back button', () => {
    const { container, props } = renderCallCard({
      isSentByCurrentUser: false,
      message: { ...baseCallMessage, callStatus: 'MISSED', callDurationSeconds: null },
    });

    expect(screen.getByText('Missed audio call')).toBeTruthy();
    expect(screen.getByText(/Tap to call back/i)).toBeTruthy();

    const card = container.querySelector('.call-message-card');
    expect(card?.classList.contains('is-missed')).toBe(true);

    const callBackBtn = screen.getByRole('button', { name: /Call back/i });
    fireEvent.click(callBackBtn);
    expect(props.onCallBack).toHaveBeenCalled();
  });

  it('renders caller side canceled call with Canceled subtitle', () => {
    const { container } = renderCallCard({
      isSentByCurrentUser: true,
      message: { ...baseCallMessage, callStatus: 'CANCELED', callDurationSeconds: null },
    });

    expect(screen.getByText('Outgoing audio call')).toBeTruthy();
    expect(screen.getByText(/Canceled/i)).toBeTruthy();

    const card = container.querySelector('.call-message-card');
    expect(card?.classList.contains('is-outgoing')).toBe(true);
    expect(card?.classList.contains('is-canceled')).toBe(true);
  });

  it('renders video call title and icon appropriately', () => {
    renderCallCard({
      isSentByCurrentUser: true,
      message: { ...baseCallMessage, callType: 'VIDEO', callStatus: 'ENDED', callDurationSeconds: 20 },
    });

    expect(screen.getByText('Outgoing video call')).toBeTruthy();
    expect(screen.getByText(/20s/)).toBeTruthy();
  });

  it('triggers delete action when clicking delete button', () => {
    const { props } = renderCallCard();

    const deleteBtn = screen.getByRole('button', { name: 'Delete call for me' });
    fireEvent.click(deleteBtn);
    expect(props.onDeleteForMe).toHaveBeenCalledWith(expect.objectContaining({ id: 101 }));
  });
});
