import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizePastedFile } from '../../hooks/useMediaPicker';
import MessageInput, { type MessageInputProps } from './MessageInput';

function renderInput(overrides: Partial<MessageInputProps> = {}) {
  const props: MessageInputProps = {
    onSubmit: vi.fn((e) => e.preventDefault()),
    mediaFileInputRef: { current: null },
    docFileInputRef: { current: null },
    mediaAccept: 'image/*',
    onFileChange: vi.fn(),
    replyPreview: null,
    onCancelReply: vi.fn(),
    pendingMedia: null,
    mediaError: '',
    mediaUploading: false,
    canAttachMedia: true,
    blocked: false,
    onClearPendingMedia: vi.fn(),
    onOpenMediaPicker: vi.fn(),
    onOpenDocumentPicker: vi.fn(),
    onVoiceRecorded: vi.fn(),
    emojiButtonRef: { current: null },
    emojiPickerOpen: false,
    onToggleEmojiPicker: vi.fn(),
    messageInputRef: { current: null },
    messageInput: '',
    onMessageInputChange: vi.fn(),
    onMessageInputKeyDown: vi.fn(),
    onUpdateMessageInputSelection: vi.fn(),
    selectedConversationName: 'Ngoc Mai',
    mentionQuery: null,
    mentionCandidates: [],
    mentionActiveIndex: 0,
    onInsertMention: vi.fn(),
    slashCommandQuery: null,
    onInsertSummaryCommand: vi.fn(),
    emojiPickerRef: { current: null },
    onInsertEmoji: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<MessageInput {...props} />) };
}

describe('MessageInput', () => {
  afterEach(cleanup);

  it('renders composer input with placeholder and disabled Send button when empty', () => {
    renderInput();

    const textarea = screen.getByPlaceholderText('Message Ngoc Mai');
    expect(textarea).toBeTruthy();

    const sendBtn = screen.getByRole('button', { name: 'Send' });
    expect(sendBtn).toBeTruthy();
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Send button when text is provided', () => {
    renderInput({ messageInput: 'Hello Ngoc Mai' });

    const sendBtn = screen.getByRole('button', { name: 'Send' });
    expect((sendBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls onMessageInputChange when user types', () => {
    const { props } = renderInput();

    const textarea = screen.getByPlaceholderText('Message Ngoc Mai');
    fireEvent.change(textarea, { target: { value: 'Hi there' } });
    expect(props.onMessageInputChange).toHaveBeenCalledWith('Hi there');
  });

  it('calls onSubmit when form is submitted with text', () => {
    const { props } = renderInput({ messageInput: 'Valid message' });

    const sendBtn = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(sendBtn);
    expect(props.onSubmit).toHaveBeenCalled();
  });

  it('forwards clipboard paste events when media attachments are enabled', () => {
    const onPaste = vi.fn();
    renderInput({ onPaste });

    const textarea = screen.getByPlaceholderText('Message Ngoc Mai');
    fireEvent.paste(textarea);
    expect(onPaste).toHaveBeenCalledTimes(1);
  });

  it('calls onFileDrop when a file is dropped onto the message input form', () => {
    const onFileDrop = vi.fn();
    const { container } = renderInput({ onFileDrop });

    const form = container.querySelector('.message-input-form')!;
    const file = new File(['dummy-image'], 'photo.png', { type: 'image/png' });
    fireEvent.drop(form, {
      dataTransfer: { files: [file] },
    });

    expect(onFileDrop).toHaveBeenCalledWith(file);
  });

  it('normalizes generic clipboard image filenames into timestamped screenshot names', () => {
    const genericFile = new File(['bytes'], 'image.png', { type: 'image/png' });
    const normalized = normalizePastedFile(genericFile);
    expect(normalized.name).toMatch(/^screenshot-\d{8}-\d{6}\.png$/);

    const namedFile = new File(['bytes'], 'architecture-diagram.png', { type: 'image/png' });
    expect(normalizePastedFile(namedFile).name).toBe('architecture-diagram.png');
  });

  it('lazy-loads EmojiPickerPanel and inserts an emoji when emojiPickerOpen is true', async () => {
    const onInsertEmoji = vi.fn();
    renderInput({ emojiPickerOpen: true, onInsertEmoji });

    const dialog = await screen.findByRole('dialog', { name: 'Emoji picker' });
    expect(dialog).toBeTruthy();

    const grinButton = screen.getByRole('button', { name: 'Insert grinning face' });
    fireEvent.click(grinButton);
    expect(onInsertEmoji).toHaveBeenCalledWith('😀');
  });
});

