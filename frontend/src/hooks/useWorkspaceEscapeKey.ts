import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Message, User } from '../types';
import type { ChatMessage, ConversationTarget } from '../types/chat.types';
import type { LightboxMediaItem } from '../components/chat/MediaLightbox';
import type { ReactionDetailGroup } from '../components/chat/ReactionSummaryModal';

interface Options {
  lightboxState: { items: LightboxMediaItem[]; index: number } | null;
  setLightboxState: Dispatch<SetStateAction<{ items: LightboxMediaItem[]; index: number } | null>>;
  conversationDeleteTarget: ConversationTarget | null;
  conversationSettingPendingKey: string | null;
  setConversationDeleteTarget: Dispatch<SetStateAction<ConversationTarget | null>>;
  groupSeenModalMessage: { message: Message; seenUsers: User[] } | null;
  setGroupSeenModalMessage: Dispatch<SetStateAction<{ message: Message; seenUsers: User[] } | null>>;
  reactionModalGroups: ReactionDetailGroup[] | null;
  setReactionModalGroups: Dispatch<SetStateAction<ReactionDetailGroup[] | null>>;
  mediaViewerMessage: ChatMessage | null;
  setMediaViewerMessage: Dispatch<SetStateAction<ChatMessage | null>>;
  forwardingMessage: ChatMessage | null;
  setForwardingMessage: Dispatch<SetStateAction<ChatMessage | null>>;
  addMembersModalOpen: boolean;
  setAddMembersModalOpen: Dispatch<SetStateAction<boolean>>;
  inviteModalOpen: boolean;
  setInviteModalOpen: Dispatch<SetStateAction<boolean>>;
  activeViewedProfileUser: User | null;
  handleCloseUserProfile: () => void;
  detailsOpen: boolean;
  setDetailsOpen: Dispatch<SetStateAction<boolean>>;
  profileMenuOpen: boolean;
  setProfileMenuOpen: Dispatch<SetStateAction<boolean>>;
}

export function useWorkspaceEscapeKey({
  lightboxState,
  setLightboxState,
  conversationDeleteTarget,
  conversationSettingPendingKey,
  setConversationDeleteTarget,
  groupSeenModalMessage,
  setGroupSeenModalMessage,
  reactionModalGroups,
  setReactionModalGroups,
  mediaViewerMessage,
  setMediaViewerMessage,
  forwardingMessage,
  setForwardingMessage,
  addMembersModalOpen,
  setAddMembersModalOpen,
  inviteModalOpen,
  setInviteModalOpen,
  activeViewedProfileUser,
  handleCloseUserProfile,
  detailsOpen,
  setDetailsOpen,
  profileMenuOpen,
  setProfileMenuOpen,
}: Options) {
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }

      if (lightboxState) {
        setLightboxState(null);
      } else if (conversationDeleteTarget && conversationSettingPendingKey === null) {
        setConversationDeleteTarget(null);
      } else if (groupSeenModalMessage) {
        setGroupSeenModalMessage(null);
      } else if (reactionModalGroups) {
        setReactionModalGroups(null);
      } else if (mediaViewerMessage) {
        setMediaViewerMessage(null);
      } else if (forwardingMessage) {
        setForwardingMessage(null);
      } else if (addMembersModalOpen) {
        setAddMembersModalOpen(false);
      } else if (inviteModalOpen) {
        setInviteModalOpen(false);
      } else if (activeViewedProfileUser) {
        handleCloseUserProfile();
      } else if (detailsOpen) {
        setDetailsOpen(false);
      } else if (profileMenuOpen) {
        setProfileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [
    activeViewedProfileUser,
    addMembersModalOpen,
    conversationDeleteTarget,
    conversationSettingPendingKey,
    detailsOpen,
    forwardingMessage,
    groupSeenModalMessage,
    handleCloseUserProfile,
    inviteModalOpen,
    lightboxState,
    mediaViewerMessage,
    profileMenuOpen,
    reactionModalGroups,
    setAddMembersModalOpen,
    setConversationDeleteTarget,
    setDetailsOpen,
    setForwardingMessage,
    setGroupSeenModalMessage,
    setInviteModalOpen,
    setLightboxState,
    setMediaViewerMessage,
    setProfileMenuOpen,
    setReactionModalGroups,
  ]);
}

