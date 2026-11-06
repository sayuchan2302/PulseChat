import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { ChatRoom, Message, User } from '../types';
import type { ChatMessage, MainView } from '../types/chat.types';
import { dbService } from '../services/dbService';
import {
  appendOrUpdateRoom,
  applyConversationPreviewToUser,
  applyConversationPreviewToUsers,
  applyRoomPreviewToRoom,
  isRoomParticipant,
  sortRoomsByChatActivity,
} from '../utils/conversationUtils';
import { mergeKnownMessageUpdate, toDeliveredMessage } from '../utils/messageUtils';
import { getChatRoute } from '../utils/routeUtils';

interface Options {
  currentUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  userSearchQueryRef: MutableRefObject<string>;
  roomSeenByLoadedMessageIdsRef: MutableRefObject<Set<number>>;
  navigate: NavigateFunction;
  resetMessagePagination: () => void;
  updateSharedContentFromMessage: (message: Message) => void;
  removeSharedContentMessage: (messageId: number) => void;
  loadUsers: (options?: { search?: string; silent?: boolean }) => Promise<void>;
  loadRooms: (options?: { silent?: boolean }) => Promise<void>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setFriends: Dispatch<SetStateAction<User[]>>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessageInput: Dispatch<SetStateAction<string>>;
  setMainView: Dispatch<SetStateAction<MainView>>;
  setPinnedMessage: Dispatch<SetStateAction<Message | null>>;
  setRoomSeenByByMessageId: Dispatch<SetStateAction<Record<number, User[]>>>;
  setSeenByPopupMessageId: Dispatch<SetStateAction<number | null>>;
  setReplyingToMessage: Dispatch<SetStateAction<ChatMessage | null>>;
  setForwardingMessage: Dispatch<SetStateAction<ChatMessage | null>>;
  setEditingMessage: Dispatch<SetStateAction<ChatMessage | null>>;
  setMessageToDeleteForMe: Dispatch<SetStateAction<ChatMessage | null>>;
}

export function useMessageStateSync({
  currentUserIdRef,
  selectedRoomIdRef,
  userSearchQueryRef,
  roomSeenByLoadedMessageIdsRef,
  navigate,
  resetMessagePagination,
  updateSharedContentFromMessage,
  removeSharedContentMessage,
  loadUsers,
  loadRooms,
  setRooms,
  setSelectedRoom,
  setUsers,
  setFriends,
  setSelectedUser,
  setMessages,
  setMessageInput,
  setMainView,
  setPinnedMessage,
  setRoomSeenByByMessageId,
  setSeenByPopupMessageId,
  setReplyingToMessage,
  setForwardingMessage,
  setEditingMessage,
  setMessageToDeleteForMe,
}: Options) {
  const applyRoomMembershipUpdate = useCallback((room: ChatRoom) => {
    if (!isRoomParticipant(room, currentUserIdRef.current)) {
      setRooms((currentRooms) => currentRooms.filter((currentRoom) => currentRoom.id !== room.id));

      if (selectedRoomIdRef.current === room.id) {
        selectedRoomIdRef.current = null;
        setSelectedRoom(null);
        setMessages([]);
        setMessageInput('');
        setMainView('chat');
        resetMessagePagination();
        navigate(getChatRoute(), { replace: true });
      }

      return;
    }

    setRooms((currentRooms) => appendOrUpdateRoom(currentRooms, room));
    setSelectedRoom((currentSelectedRoom) =>
      currentSelectedRoom?.id === room.id ? room : currentSelectedRoom
    );
  }, [
    currentUserIdRef,
    navigate,
    resetMessagePagination,
    selectedRoomIdRef,
    setMainView,
    setMessageInput,
    setMessages,
    setRooms,
    setSelectedRoom,
  ]);

  const applyMessageUpdate = useCallback((updatedMessage: Message) => {
    setMessages((currentMessages) => mergeKnownMessageUpdate(currentMessages, updatedMessage));
    setPinnedMessage((currentPinnedMessage) =>
      currentPinnedMessage?.id === updatedMessage.id
        ? { ...currentPinnedMessage, ...updatedMessage }
        : currentPinnedMessage
    );
    updateSharedContentFromMessage(updatedMessage);
    if (updatedMessage.recalled && updatedMessage.chatRoomId) {
      roomSeenByLoadedMessageIdsRef.current.delete(updatedMessage.id);
      setRoomSeenByByMessageId((currentSeenBy) => {
        if (!currentSeenBy[updatedMessage.id]) {
          return currentSeenBy;
        }

        const nextSeenBy = { ...currentSeenBy };
        delete nextSeenBy[updatedMessage.id];
        return nextSeenBy;
      });
      setSeenByPopupMessageId((currentMessageId) =>
        currentMessageId === updatedMessage.id ? null : currentMessageId
      );
    }
    setReplyingToMessage((currentReplyingMessage) =>
      currentReplyingMessage?.id === updatedMessage.id
        ? { ...currentReplyingMessage, ...toDeliveredMessage(updatedMessage) }
        : currentReplyingMessage
    );

    if (updatedMessage.chatRoomId) {
      setRooms((currentRooms) => {
        let didUpdate = false;
        const nextRooms = currentRooms.map((room) => {
          const nextRoom = applyRoomPreviewToRoom(room, updatedMessage);
          didUpdate ||= nextRoom !== room;
          return nextRoom;
        });

        return didUpdate ? sortRoomsByChatActivity(nextRooms) : currentRooms;
      });
      setSelectedRoom((currentSelectedRoom) =>
        currentSelectedRoom ? applyRoomPreviewToRoom(currentSelectedRoom, updatedMessage) : null
      );
      return;
    }

    setUsers((currentUsers) =>
      applyConversationPreviewToUsers(
        currentUsers,
        updatedMessage,
        currentUserIdRef.current,
        !userSearchQueryRef.current.trim()
      )
    );
    setFriends((currentFriends) =>
      applyConversationPreviewToUsers(currentFriends, updatedMessage, currentUserIdRef.current, true)
    );
    setSelectedUser((currentSelectedUser) =>
      currentSelectedUser
        ? applyConversationPreviewToUser(currentSelectedUser, updatedMessage, currentUserIdRef.current)
        : null
    );
  }, [
    currentUserIdRef,
    roomSeenByLoadedMessageIdsRef,
    setFriends,
    setMessages,
    setPinnedMessage,
    setReplyingToMessage,
    setRoomSeenByByMessageId,
    setRooms,
    setSeenByPopupMessageId,
    setSelectedRoom,
    setSelectedUser,
    setUsers,
    updateSharedContentFromMessage,
    userSearchQueryRef,
  ]);

  const applyMessageHidden = useCallback((event: { messageId: number }) => {
    const { messageId } = event;
    setMessages((currentMessages) => currentMessages.filter((message) => message.id !== messageId));
    setPinnedMessage((currentMessage) => currentMessage?.id === messageId ? null : currentMessage);
    setReplyingToMessage((currentMessage) => currentMessage?.id === messageId ? null : currentMessage);
    setForwardingMessage((currentMessage) => currentMessage?.id === messageId ? null : currentMessage);
    setEditingMessage((currentMessage) => currentMessage?.id === messageId ? null : currentMessage);
    setMessageToDeleteForMe((currentMessage) => currentMessage?.id === messageId ? null : currentMessage);
    removeSharedContentMessage(messageId);
    const ownerId = currentUserIdRef.current;
    if (ownerId !== null) void dbService.removeMessageFromCaches(ownerId, messageId);
    void Promise.all([loadUsers({ silent: true }), loadRooms({ silent: true })]);
  }, [
    currentUserIdRef,
    loadRooms,
    loadUsers,
    removeSharedContentMessage,
    setEditingMessage,
    setForwardingMessage,
    setMessageToDeleteForMe,
    setMessages,
    setPinnedMessage,
    setReplyingToMessage,
  ]);

  return {
    applyRoomMembershipUpdate,
    applyMessageUpdate,
    applyMessageHidden,
  };
}

