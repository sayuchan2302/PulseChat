import { useCallback, useMemo } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatRoom, User } from '../types';
import type { MentionCandidate } from '../types/chat.types';
import { STOP_TYPING_DELAY_MS } from '../constants/chatConstants';

interface Options {
  selectedUser: User | null;
  selectedRoom: ChatRoom | null;
  currentUser: User | null;
  messageInput: string;
  mentionQuery: string | null;
  mentionStartIndex: number;
  mentionActiveIndex: number;
  messageInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  messageInputSelectionRef: MutableRefObject<{ start: number; end: number }>;
  typingTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setMessageInput: Dispatch<SetStateAction<string>>;
  setMentionQuery: Dispatch<SetStateAction<string | null>>;
  setMentionStartIndex: Dispatch<SetStateAction<number>>;
  setMentionActiveIndex: Dispatch<SetStateAction<number>>;
  setSlashCommandQuery: Dispatch<SetStateAction<string | null>>;
  setEmojiPickerOpen: Dispatch<SetStateAction<boolean>>;
  canChatWithUser: (user: User) => boolean;
  publishTyping: (userId: number, typing: boolean) => void;
  publishRoomTyping: (roomId: number, typing: boolean) => void;
  stopTyping: (userId: number) => void;
  stopRoomTyping: (roomId: number) => void;
}

export function useMessageComposer(options: Options) {
  const { selectedUser, selectedRoom, currentUser, messageInput, mentionQuery, mentionStartIndex, mentionActiveIndex, messageInputRef, messageInputSelectionRef, typingTimeoutRef, setMessageInput, setMentionQuery, setMentionStartIndex, setMentionActiveIndex, setSlashCommandQuery, setEmojiPickerOpen, canChatWithUser, publishTyping, publishRoomTyping, stopTyping, stopRoomTyping } = options;
  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    if (!selectedRoom || mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    const candidates: MentionCandidate[] = ('all'.startsWith(query) || query === '') ? [{ id: 'all', username: 'all', fullName: 'All Members', isAll: true }] : [];
    selectedRoom.participants.filter((member) => member.id !== currentUser?.id).filter((member) => member.username.toLowerCase().startsWith(query) || member.fullName?.toLowerCase().includes(query)).forEach((member) => candidates.push({ id: member.id, username: member.username, fullName: member.fullName || member.username }));
    return candidates;
  }, [currentUser?.id, mentionQuery, selectedRoom]);
  const checkMentionTrigger = useCallback((text: string, cursor: number) => { if (!selectedRoom) { setMentionQuery(null); setMentionStartIndex(-1); return; } const before = text.slice(0, cursor); const match = before.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/); if (!match) { setMentionQuery(null); setMentionStartIndex(-1); return; } setMentionQuery(match[1]); setMentionStartIndex(before.length - match[0].length + (match[0].startsWith(' ') ? 1 : 0)); setMentionActiveIndex(0); }, [selectedRoom, setMentionActiveIndex, setMentionQuery, setMentionStartIndex]);
  const checkSlashCommandTrigger = useCallback((text: string, cursor: number) => { const match = selectedRoom ? text.slice(0, cursor).match(/^\/([a-z]*)$/i) : null; setSlashCommandQuery(match && 'summary'.startsWith(match[1].toLowerCase()) ? match[1] : null); }, [selectedRoom, setSlashCommandQuery]);
  const handleMessageInputChange = useCallback((value: string) => { setMessageInput(value); const cursor = messageInputRef.current?.selectionStart ?? value.length; checkMentionTrigger(value, cursor); checkSlashCommandTrigger(value, cursor); if (!selectedUser && !selectedRoom) return; if (!value.trim()) { if (selectedUser) stopTyping(selectedUser.id); else if (selectedRoom) stopRoomTyping(selectedRoom.id); return; } if (selectedUser && canChatWithUser(selectedUser)) publishTyping(selectedUser.id, true); else if (selectedRoom) publishRoomTyping(selectedRoom.id, true); if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = setTimeout(() => { if (selectedUser && canChatWithUser(selectedUser)) publishTyping(selectedUser.id, false); else if (selectedRoom) publishRoomTyping(selectedRoom.id, false); typingTimeoutRef.current = null; }, STOP_TYPING_DELAY_MS); }, [canChatWithUser, checkMentionTrigger, checkSlashCommandTrigger, messageInputRef, publishRoomTyping, publishTyping, selectedRoom, selectedUser, setMessageInput, stopRoomTyping, stopTyping, typingTimeoutRef]);
  const insertMention = useCallback((candidate: { username: string }) => { if (mentionStartIndex < 0) return; const cursor = messageInputRef.current?.selectionStart ?? messageInput.length; const next = `${messageInput.slice(0, mentionStartIndex)}@${candidate.username} ${messageInput.slice(cursor)}`; const nextCursor = mentionStartIndex + candidate.username.length + 2; setMessageInput(next); setMentionQuery(null); setMentionStartIndex(-1); window.requestAnimationFrame(() => { messageInputRef.current?.focus(); messageInputRef.current?.setSelectionRange(nextCursor, nextCursor); }); }, [mentionStartIndex, messageInput, messageInputRef, setMentionQuery, setMentionStartIndex, setMessageInput]);
  const insertSummaryCommand = useCallback(() => { setMessageInput('/summary'); setSlashCommandQuery(null); window.requestAnimationFrame(() => { messageInputRef.current?.focus(); messageInputRef.current?.setSelectionRange(8, 8); }); }, [messageInputRef, setMessageInput, setSlashCommandQuery]);
  const handleToggleEmojiPicker = useCallback(() => { const input = messageInputRef.current; if (input) messageInputSelectionRef.current = { start: input.selectionStart, end: input.selectionEnd }; setEmojiPickerOpen((open) => !open); }, [messageInputRef, messageInputSelectionRef, setEmojiPickerOpen]);
  const handleInsertEmoji = useCallback((emoji: string) => { const start = Math.min(messageInputSelectionRef.current.start, messageInput.length); const end = Math.min(Math.max(messageInputSelectionRef.current.end, start), messageInput.length); const next = messageInput.slice(0, start) + emoji + messageInput.slice(end); const cursor = start + emoji.length; messageInputSelectionRef.current = { start: cursor, end: cursor }; handleMessageInputChange(next); window.requestAnimationFrame(() => { messageInputRef.current?.focus(); messageInputRef.current?.setSelectionRange(cursor, cursor); }); }, [handleMessageInputChange, messageInput, messageInputRef, messageInputSelectionRef]);
  const handleMessageInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>, slashCommandQuery: string | null) => { if (mentionQuery !== null && mentionCandidates.length > 0) { if (event.key === 'ArrowDown') { event.preventDefault(); setMentionActiveIndex((index) => (index + 1) % mentionCandidates.length); return; } if (event.key === 'ArrowUp') { event.preventDefault(); setMentionActiveIndex((index) => (index - 1 + mentionCandidates.length) % mentionCandidates.length); return; } if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); const candidate = mentionCandidates[mentionActiveIndex] || mentionCandidates[0]; if (candidate) insertMention(candidate); return; } if (event.key === 'Escape') { event.preventDefault(); setMentionQuery(null); setMentionStartIndex(-1); return; } } if (slashCommandQuery !== null) { if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); insertSummaryCommand(); return; } if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); return; } if (event.key === 'Escape') { event.preventDefault(); setSlashCommandQuery(null); return; } } if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }, [insertMention, insertSummaryCommand, mentionActiveIndex, mentionCandidates, mentionQuery, setMentionActiveIndex, setMentionQuery, setMentionStartIndex, setSlashCommandQuery]);
  return { mentionCandidates, checkMentionTrigger, checkSlashCommandTrigger, handleMessageInputChange, insertMention, insertSummaryCommand, handleToggleEmojiPicker, handleInsertEmoji, handleMessageInputKeyDown };
}
