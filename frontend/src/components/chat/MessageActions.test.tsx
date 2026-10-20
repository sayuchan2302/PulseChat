import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../types/chat.types';
import MessageActions, { type MessageActionsProps } from './MessageActions';

const message: ChatMessage = {
  id: 11,
  content: 'Hello there',
  type: 'TEXT',
  senderId: 1,
  timestamp: '2026-10-20T10:00:00',
  read: true,
  deliveryStatus: 'sent',
};

function renderActions(overrides: Partial<MessageActionsProps> = {}) {
  const props: MessageActionsProps = {
    message,
    isSentByCurrentUser: true,
    currentUserId: 1,
    pinnedMessage: null,
    onReact: vi.fn(),
    onReply: vi.fn(),
    onCopy: vi.fn(),
    onEdit: vi.fn(),
    onDeleteForMe: vi.fn(),
    onRecall: vi.fn(),
    onPin: vi.fn(),
    onForward: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<MessageActions {...props} />) };
}

describe('MessageActions', () => {
  afterEach(cleanup);

  it('opens the options menu with the available actions', () => {
    renderActions();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Reply' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Delete for me' })).toBeTruthy();
  });

  it('closes the options menu with Escape and restores focus to the trigger', () => {
    renderActions();
    const trigger = screen.getByRole('button', { name: 'More options' });

    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();

    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('runs the selected action and closes the menu', () => {
    const { props } = renderActions();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reply' }));

    expect(props.onReply).toHaveBeenCalledWith(message);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
