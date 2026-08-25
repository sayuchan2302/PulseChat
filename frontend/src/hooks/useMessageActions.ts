import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatRoom, Message, User } from '../types';
import type { ChatMessage } from '../types/chat.types';
import { apiClient } from '../services/api';
import { canUseMessageActions, hasCurrentUserReaction } from '../utils/messageUtils';

interface Options {
  currentUser: User | null;
  selectedUser: User | null;
  selectedRoom: ChatRoom | null;
  replyingToMessage: ChatMessage | null;
  forwardingMessage: ChatMessage | null;
  messageInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  setReplyingToMessage: Dispatch<SetStateAction<ChatMessage | null>>;
  setForwardingMessage: Dispatch<SetStateAction<ChatMessage | null>>;
  setPinnedMessage: Dispatch<SetStateAction<Message | null>>;
  setEmojiPickerOpen: Dispatch<SetStateAction<boolean>>;
  setMessagesError: Dispatch<SetStateAction<string>>;
  applyMessageUpdate: (message: Message) => void;
}

export function useMessageActions(options: Options) {
  const { currentUser, selectedUser, selectedRoom, replyingToMessage, forwardingMessage, messageInputRef, setReplyingToMessage, setForwardingMessage, setPinnedMessage, setEmojiPickerOpen, setMessagesError, applyMessageUpdate } = options;
  const handleReplyToMessage = useCallback((message: ChatMessage) => { if (!canUseMessageActions(message)) return; setReplyingToMessage(message); setEmojiPickerOpen(false); window.requestAnimationFrame(() => messageInputRef.current?.focus()); }, [messageInputRef, setEmojiPickerOpen, setReplyingToMessage]);
  const handleCancelReply = useCallback(() => setReplyingToMessage(null), [setReplyingToMessage]);
  const handleCopyMessage = useCallback(async (message: ChatMessage) => { if (!message.content?.trim() || message.recalled) return; try { await navigator.clipboard.writeText(message.content); } catch (error) { console.error('Failed to copy message:', error); setMessagesError('Unable to copy message.'); } }, [setMessagesError]);
  const handleReactToMessage = useCallback(async (message: ChatMessage, emoji: string) => { if (!canUseMessageActions(message) || !currentUser) return; try { const response = hasCurrentUserReaction(message, currentUser.id, emoji) ? await apiClient.delete<Message>(`/messages/${message.id}/reactions`) : await apiClient.post<Message>(`/messages/${message.id}/reactions`, { emoji }); applyMessageUpdate(response.data); } catch (error) { console.error('Failed to update message reaction:', error); setMessagesError('Unable to update reaction.'); } }, [applyMessageUpdate, currentUser, setMessagesError]);
  const handleRecallMessage = useCallback(async (message: ChatMessage) => { if (!canUseMessageActions(message) || message.senderId !== currentUser?.id) return; try { const response = await apiClient.patch<Message>(`/messages/${message.id}/recall`); applyMessageUpdate(response.data); if (replyingToMessage?.id === message.id) setReplyingToMessage(null); } catch (error) { console.error('Failed to recall message:', error); setMessagesError('Unable to recall message.'); } }, [applyMessageUpdate, currentUser?.id, replyingToMessage?.id, setMessagesError, setReplyingToMessage]);
  const handlePinMessage = useCallback(async (message: ChatMessage) => { try { if (selectedRoom) { await apiClient.patch(`/rooms/${selectedRoom.id}/pin-message`, null, { params: { messageId: message.id } }); setPinnedMessage(message); } else if (selectedUser) { await apiClient.patch(`/messages/dm/${selectedUser.id}/pin-message`, null, { params: { messageId: message.id } }); setPinnedMessage(message); } } catch (error) { console.error('Failed to pin message:', error); } }, [selectedRoom, selectedUser, setPinnedMessage]);
  const handleUnpinMessage = useCallback(async () => { try { if (selectedRoom) await apiClient.delete(`/rooms/${selectedRoom.id}/pin-message`); else if (selectedUser) await apiClient.delete(`/messages/dm/${selectedUser.id}/pin-message`); else return; setPinnedMessage(null); } catch (error) { console.error('Failed to unpin message:', error); } }, [selectedRoom, selectedUser, setPinnedMessage]);
  const handleForwardMessage = useCallback((message: ChatMessage) => { if (!message.recalled && message.type !== 'CALL') setForwardingMessage(message); }, [setForwardingMessage]);
  const sendForwardMessage = useCallback(async (targetUserId: number | null, targetRoomId: number | null) => { if (!forwardingMessage) return; try { const response = await apiClient.post<Message>('/messages/forward', { messageId: forwardingMessage.id, targetUserId, targetRoomId }); if ((targetUserId && selectedUser?.id === targetUserId) || (targetRoomId && selectedRoom?.id === targetRoomId)) applyMessageUpdate(response.data); setForwardingMessage(null); } catch (error) { console.error('Failed to forward message:', error); } }, [applyMessageUpdate, forwardingMessage, selectedRoom?.id, selectedUser?.id, setForwardingMessage]);
  return { handleReplyToMessage, handleCancelReply, handleCopyMessage, handleReactToMessage, handleRecallMessage, handlePinMessage, handleUnpinMessage, handleForwardMessage, sendForwardMessage };
}
