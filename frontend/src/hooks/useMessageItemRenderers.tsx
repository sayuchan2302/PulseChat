import { useCallback, useMemo } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { CallType, ChatRoom, Message, User } from '../types';
import type { ChatMessage, MessageListItem } from '../types/chat.types';
import { canChatWithUser } from '../utils/userUtils';
import CallMessageBody from '../components/chat/CallMessageBody';
import GroupSeenBy from '../components/chat/GroupSeenBy';
import MessageActions from '../components/chat/MessageActions';
import MessageContent from '../components/chat/MessageContent';
import MessageReactions from '../components/chat/MessageReactions';
import type { ReactionDetailGroup } from '../components/chat/ReactionSummaryModal';

interface Options {
  currentUser: User | null;
  selectedUser: User | null;
  selectedRoom: ChatRoom | null;
  hasActiveCall: boolean;
  pinnedMessage: Message | null;
  canManagePinnedMessages: boolean;
  seenByPopupMessageId: number | null;
  messageListItems: MessageListItem[];
  unreadDividerRef: RefObject<HTMLDivElement | null>;
  latestSeenOutgoingMessageId: number | null;
  latestOutgoingMessageId: string | number | null;
  latestRoomSeenByByMessageId: Record<number, User[]>;
  seenByLoadingMessageIds: number[];
  detailsOpen: boolean;
  rightSidebarTab: 'details' | 'search';
  messageSearchQuery: string;
  messageSearchResultIds: Set<number>;
  highlightedMessageId: number | null;
  findKnownUserById: (userId: number) => User | null;
  openPreCallSetupForUser: (user: User, callType: CallType) => void;
  handleOpenUserProfile: (user: User) => void | Promise<void>;
  handleOpenLightbox: (url: string, type: 'IMAGE' | 'VIDEO', fileName?: string) => void;
  handleMessageAssetLoaded: () => void;
  handleJumpToMessage: (messageId: number) => Promise<boolean>;
  handleReactToMessage: (message: ChatMessage, emoji: string) => Promise<void>;
  handleReplyToMessage: (message: ChatMessage) => void;
  handleCopyMessage: (message: ChatMessage) => Promise<void>;
  handleEditMessage: (message: ChatMessage) => void;
  handleRequestDeleteMessageForMe: (message: ChatMessage) => void;
  handleRecallMessage: (message: ChatMessage) => Promise<void>;
  handlePinMessage: (message: ChatMessage) => Promise<void>;
  handleForwardMessage: (message: ChatMessage) => void;
  handleRetryMessage: (message: ChatMessage) => void;
  setReactionModalGroups: Dispatch<SetStateAction<ReactionDetailGroup[] | null>>;
  setGroupSeenModalMessage: Dispatch<SetStateAction<{ message: Message; seenUsers: User[] } | null>>;
}

export function useMessageItemRenderers({
  currentUser,
  selectedUser,
  selectedRoom,
  hasActiveCall,
  pinnedMessage,
  canManagePinnedMessages,
  seenByPopupMessageId,
  messageListItems,
  unreadDividerRef,
  latestSeenOutgoingMessageId,
  latestOutgoingMessageId,
  latestRoomSeenByByMessageId,
  seenByLoadingMessageIds,
  detailsOpen,
  rightSidebarTab,
  messageSearchQuery,
  messageSearchResultIds,
  highlightedMessageId,
  findKnownUserById,
  openPreCallSetupForUser,
  handleOpenUserProfile,
  handleOpenLightbox,
  handleMessageAssetLoaded,
  handleJumpToMessage,
  handleReactToMessage,
  handleReplyToMessage,
  handleCopyMessage,
  handleEditMessage,
  handleRequestDeleteMessageForMe,
  handleRecallMessage,
  handlePinMessage,
  handleForwardMessage,
  handleRetryMessage,
  setReactionModalGroups,
  setGroupSeenModalMessage,
}: Options) {
  const getCallMessagePeer = useCallback((message: ChatMessage) => {
    if (message.chatRoomId) {
      return null;
    }

    if (
      selectedUser &&
      (message.senderId === selectedUser.id || message.receiverId === selectedUser.id)
    ) {
      return selectedUser;
    }

    const currentAccountId = currentUser?.id ?? null;
    const peerId =
      currentAccountId !== null && message.senderId === currentAccountId
        ? message.receiverId
        : message.senderId;

    return peerId ? findKnownUserById(peerId) : null;
  }, [currentUser?.id, findKnownUserById, selectedUser]);

  const handleCallBackFromMessage = useCallback((message: ChatMessage) => {
    const peer = getCallMessagePeer(message);
    if (!peer) {
      return;
    }

    openPreCallSetupForUser(peer, message.callType ?? 'AUDIO');
  }, [getCallMessagePeer, openPreCallSetupForUser]);

  const handleOpenReactionSummary = useCallback((message: ChatMessage) => {
    if (!message.reactions || message.reactions.length === 0) return;
    const map = new Map<string, User[]>();
    for (const r of message.reactions) {
      const userObj: User = {
        id: r.userId,
        username: r.username,
        fullName: r.fullName,
        online: false,
        createdAt: r.createdAt,
      };
      const list = map.get(r.emoji) || [];
      list.push(userObj);
      map.set(r.emoji, list);
    }
    const groups: ReactionDetailGroup[] = Array.from(map.entries()).map(([emoji, users]) => ({
      emoji,
      users,
    }));
    setReactionModalGroups(groups);
  }, [setReactionModalGroups]);

  const renderMessageReactions = useCallback((message: ChatMessage) => (
    <MessageReactions
      message={message}
      currentUserId={currentUser?.id ?? null}
      onReact={(target, emoji) => void handleReactToMessage(target, emoji)}
      onOpenSummary={handleOpenReactionSummary}
    />
  ), [currentUser?.id, handleOpenReactionSummary, handleReactToMessage]);

  const renderMessageActions = useCallback((message: ChatMessage, isSentByCurrentUser: boolean) => (
    <MessageActions
      message={message}
      isSentByCurrentUser={isSentByCurrentUser}
      currentUserId={currentUser?.id ?? null}
      pinnedMessage={pinnedMessage}
      canPin={canManagePinnedMessages}
      onReact={(target, emoji) => void handleReactToMessage(target, emoji)}
      onReply={handleReplyToMessage}
      onCopy={(target) => void handleCopyMessage(target)}
      onEdit={handleEditMessage}
      onDeleteForMe={handleRequestDeleteMessageForMe}
      onRecall={(target) => void handleRecallMessage(target)}
      onPin={(target) => void handlePinMessage(target)}
      onForward={handleForwardMessage}
    />
  ), [
    canManagePinnedMessages,
    currentUser?.id,
    handleCopyMessage,
    handleEditMessage,
    handleForwardMessage,
    handlePinMessage,
    handleReactToMessage,
    handleRecallMessage,
    handleReplyToMessage,
    handleRequestDeleteMessageForMe,
    pinnedMessage,
  ]);

  const renderCallMessageBody = useCallback((message: ChatMessage) => {
    const peer = getCallMessagePeer(message);
    return (
      <CallMessageBody
        message={message}
        peer={peer}
        isSentByCurrentUser={Boolean(currentUser?.id && (message.callerId ?? message.senderId) === currentUser.id)}
        canCallBack={Boolean(peer && canChatWithUser(peer) && !hasActiveCall)}
        onCallBack={handleCallBackFromMessage}
        onDeleteForMe={handleRequestDeleteMessageForMe}
      />
    );
  }, [
    currentUser?.id,
    getCallMessagePeer,
    handleCallBackFromMessage,
    handleRequestDeleteMessageForMe,
    hasActiveCall,
  ]);

  const renderMessageBody = useCallback((message: ChatMessage) => (
    <MessageContent
      message={message}
      onOpenLightbox={handleOpenLightbox}
      onAssetLoaded={handleMessageAssetLoaded}
      onJumpToMessage={(messageId) => void handleJumpToMessage(messageId)}
    />
  ), [handleJumpToMessage, handleMessageAssetLoaded, handleOpenLightbox]);

  const renderGroupSeenBy = useCallback((message: ChatMessage, users: User[]) => (
    <GroupSeenBy
      message={message}
      users={users}
      open={seenByPopupMessageId === message.id}
      onOpenModal={(target, seenUsers) => setGroupSeenModalMessage({ message: target, seenUsers })}
    />
  ), [seenByPopupMessageId, setGroupSeenModalMessage]);

  const handleQuickReact = useCallback((message: ChatMessage, emoji: string) => {
    void handleReactToMessage(message, emoji);
  }, [handleReactToMessage]);

  const messageListProps = useMemo(() => ({
    items: messageListItems,
    currentUser,
    selectedUser,
    selectedRoom,
    unreadDividerRef,
    latestSeenOutgoingMessageId,
    latestOutgoingMessageId,
    latestRoomSeenByByMessageId,
    seenByLoadingMessageIds,
    detailsOpen,
    rightSidebarTab,
    messageSearchQuery,
    messageSearchResultIds,
    highlightedMessageId,
    onQuickReact: handleQuickReact,
    renderCallMessageBody,
    findKnownUserById,
    handleOpenUserProfile,
    renderMessageActions,
    renderMessageBody,
    renderMessageReactions,
    handleRetryMessage,
    renderGroupSeenBy,
  }), [
    currentUser,
    detailsOpen,
    findKnownUserById,
    handleOpenUserProfile,
    handleQuickReact,
    handleRetryMessage,
    highlightedMessageId,
    latestOutgoingMessageId,
    latestRoomSeenByByMessageId,
    latestSeenOutgoingMessageId,
    messageListItems,
    messageSearchQuery,
    messageSearchResultIds,
    renderCallMessageBody,
    renderGroupSeenBy,
    renderMessageActions,
    renderMessageBody,
    renderMessageReactions,
    rightSidebarTab,
    seenByLoadingMessageIds,
    selectedRoom,
    selectedUser,
    unreadDividerRef,
  ]);

  return {
    messageListProps,
  };
}
