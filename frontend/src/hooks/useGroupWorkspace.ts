import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatRoom, GroupMemberRole, MediaAttachment, User } from '../types';
import type { ChatMessage, MainView, PendingMedia } from '../types/chat.types';
import {
  ACCEPTED_AVATAR_TYPES,
  MAX_AVATAR_SIZE_BYTES,
  MAX_AVATAR_SIZE_MB,
  MIN_GROUP_INVITED_MEMBERS,
  MIN_GROUP_MEMBERS,
} from '../constants/chatConstants';
import { getUserDisplayName, shouldOpenConversationDetailsByDefault } from '../utils/userUtils';
import { getChatRoute, getRoomChatRoute } from '../utils/routeUtils';
import { useGroupAvatar } from './useGroupAvatar';
import { useGroupCreation } from './useGroupCreation';
import { useGroupInvite } from './useGroupInvite';
import { useGroupMemberActions } from './useGroupMemberActions';
import { useGroupSettingsActions } from './useGroupSettingsActions';

interface Options {
  currentUser: User | null;
  selectedRoom: ChatRoom | null;
  friends: User[];
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  stopTyping: (userId: number) => void;
  stopRoomTyping: (roomId: number) => void;
  navigateIfNeeded: (route: string) => void;
  resetMessagePagination: () => void;
  uploadPendingMedia: (media: PendingMedia) => Promise<MediaAttachment>;
  applyRoomMembershipUpdate: (room: ChatRoom) => void;
  setMainView: Dispatch<SetStateAction<MainView>>;
  setProfileMenuOpen: Dispatch<SetStateAction<boolean>>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  setDetailsOpen: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessageInput: Dispatch<SetStateAction<string>>;
}

export function useGroupWorkspace({
  currentUser,
  selectedRoom,
  friends,
  selectedUserIdRef,
  selectedRoomIdRef,
  stopTyping,
  stopRoomTyping,
  navigateIfNeeded,
  resetMessagePagination,
  uploadPendingMedia,
  applyRoomMembershipUpdate,
  setMainView,
  setProfileMenuOpen,
  setRooms,
  setSelectedUser,
  setSelectedRoom,
  setDetailsOpen,
  setMessages,
  setMessageInput,
}: Options) {
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<number[]>([]);
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [groupSettingsName, setGroupSettingsName] = useState('');
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState<number[]>([]);
  const [addMembersModalOpen, setAddMembersModalOpen] = useState(false);
  const [groupMemberNicknames, setGroupMemberNicknames] = useState<Record<number, string>>({});
  const [openGroupMemberMenuId, setOpenGroupMemberMenuId] = useState<number | null>(null);
  const [editingGroupMemberNicknameId, setEditingGroupMemberNicknameId] = useState<number | null>(null);
  const [groupSettingsPendingAction, setGroupSettingsPendingAction] = useState<string | null>(null);
  const [groupSettingsError, setGroupSettingsError] = useState('');
  const [groupAvatarUploading, setGroupAvatarUploading] = useState(false);
  const [groupMembersExpanded, setGroupMembersExpanded] = useState(false);

  useEffect(() => {
    setGroupSettingsName(selectedRoom?.name ?? '');
    setIsEditingGroupName(false);
    setSelectedAddMemberIds([]);
    setGroupMemberNicknames(
      Object.fromEntries(
        selectedRoom?.participants.map((participant) => [
          participant.id,
          participant.nickname ?? '',
        ]) ?? []
      )
    );
    setOpenGroupMemberMenuId(null);
    setEditingGroupMemberNicknameId(null);
    setGroupSettingsError('');
  }, [selectedRoom?.id, selectedRoom?.name, selectedRoom?.participants]);

  const {
    inviteModalOpen,
    setInviteModalOpen,
    inviteLoading,
    inviteRevoking,
    inviteCopied,
    inviteError,
    handleOpenInviteModal,
    handleRevokeInviteLink,
    getGroupInviteUrl,
    handleCopyInviteLink,
  } = useGroupInvite({ selectedRoom });

  const handleOpenCreateGroup = useCallback(() => {
    navigateIfNeeded(getChatRoute());
    setMainView('chat');
    setProfileMenuOpen(false);
    setCreateGroupOpen(true);
    setGroupError('');
  }, [navigateIfNeeded, setMainView, setProfileMenuOpen]);

  const handleCloseCreateGroup = useCallback(() => {
    if (groupCreating) {
      return;
    }

    setCreateGroupOpen(false);
    setGroupName('');
    setSelectedGroupMemberIds([]);
    setGroupError('');
  }, [groupCreating]);

  const handleToggleGroupMember = useCallback((userId: number) => {
    setGroupError('');
    setSelectedGroupMemberIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((currentId) => currentId !== userId)
        : [...currentIds, userId]
    );
  }, []);

  const handleCreateGroup = useGroupCreation({
    name: groupName,
    memberIds: selectedGroupMemberIds,
    minimumInvitedMembers: MIN_GROUP_INVITED_MEMBERS,
    selectedUserIdRef,
    selectedRoomIdRef,
    stopTyping,
    stopRoomTyping,
    navigateToRoom: (roomId) => navigateIfNeeded(getRoomChatRoute(roomId)),
    shouldOpenDetails: shouldOpenConversationDetailsByDefault,
    resetMessagePagination,
    setRooms,
    setSelectedUser,
    setSelectedRoom,
    setDetailsOpen,
    setMessages,
    setMessageInput,
    setOpen: setCreateGroupOpen,
    setName: setGroupName,
    setMemberIds: setSelectedGroupMemberIds,
    setCreating: setGroupCreating,
    setError: setGroupError,
  });

  const handleToggleAddRoomMember = useCallback((userId: number) => {
    setGroupSettingsError('');
    setSelectedAddMemberIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((currentId) => currentId !== userId)
        : [...currentIds, userId]
    );
  }, []);

  const { handleUpdateGroupSettingsName, handleAddRoomMembers } = useGroupSettingsActions({
    selectedRoom,
    pendingAction: groupSettingsPendingAction,
    groupName: groupSettingsName,
    selectedAddMemberIds,
    applyRoomMembershipUpdate,
    setPendingAction: setGroupSettingsPendingAction,
    setError: setGroupSettingsError,
    setEditingName: setIsEditingGroupName,
    setSelectedAddMemberIds,
    setAddMembersModalOpen,
  });

  const {
    handleGroupMemberNicknameChange,
    handleToggleGroupMemberMenu,
    handleStartEditGroupMemberNickname,
    handleCancelEditGroupMemberNickname,
    handleUpdateRoomMemberNickname,
    handleKickRoomMember,
    handleTransferRoomOwner,
    handleLeaveSelectedGroup,
    handleUpdateMemberRole,
    handleDeleteSelectedGroup,
  } = useGroupMemberActions({
    selectedRoom,
    groupSettingsPendingAction,
    groupMemberNicknames,
    selectedRoomIdRef,
    setGroupSettingsError,
    setGroupSettingsPendingAction,
    setOpenGroupMemberMenuId,
    setEditingGroupMemberNicknameId,
    setGroupMemberNicknames,
    setRooms,
    setSelectedRoom,
    setMessages,
    applyRoomMembershipUpdate,
    navigateToChat: () => navigateIfNeeded(getChatRoute()),
  });

  const handleGroupAvatarChange = useGroupAvatar({
    selectedRoom,
    groupSettingsPendingAction,
    acceptedTypes: ACCEPTED_AVATAR_TYPES,
    maxBytes: MAX_AVATAR_SIZE_BYTES,
    maxSizeMb: MAX_AVATAR_SIZE_MB,
    uploadPendingMedia,
    applyRoomMembershipUpdate,
    setUploading: setGroupAvatarUploading,
    setError: setGroupSettingsError,
  });

  const selectedInvitedMemberCount = selectedGroupMemberIds.length;
  const hasMinimumInvitedMembers = selectedInvitedMemberCount >= MIN_GROUP_INVITED_MEMBERS;
  const groupMemberRequirementText = hasMinimumInvitedMembers
    ? `${selectedInvitedMemberCount + 1} members total`
    : `${selectedInvitedMemberCount} of ${MIN_GROUP_INVITED_MEMBERS} friends selected`;
  const canCreateGroup = Boolean(groupName.trim()) && hasMinimumInvitedMembers && !groupCreating;
  const selectedRoomOwnerId = selectedRoom?.ownerId ?? null;
  const selectedRoomOwner = selectedRoom?.participants.find(
    (participant) => participant.id === selectedRoomOwnerId
  );
  const selectedRoomOwnerName =
    getUserDisplayName(selectedRoomOwner ?? null) ||
    selectedRoom?.ownerFullName?.trim() ||
    selectedRoom?.ownerUsername ||
    '';

  const currentUserMemberRole = useMemo<GroupMemberRole | null>(() => {
    if (!selectedRoom || !currentUser) return null;
    if (selectedRoom.ownerId === currentUser.id) return 'OWNER';
    const member = selectedRoom.participants.find((participant) => participant.id === currentUser.id);
    return member?.role ?? 'MEMBER';
  }, [selectedRoom, currentUser]);

  const isCurrentUserOwner = currentUserMemberRole === 'OWNER';
  const isCurrentUserModerator = currentUserMemberRole === 'MODERATOR';
  const currentUserCanManageSelectedRoom = isCurrentUserOwner || isCurrentUserModerator;
  const canManagePinnedMessages = !selectedRoom || currentUserCanManageSelectedRoom;
  const groupSettingsSaving = groupSettingsPendingAction !== null;
  const selectedRoomParticipantIds = new Set(
    selectedRoom?.participants.map((participant) => participant.id) ?? []
  );
  const addMemberCandidates = friends.filter(
    (friend) => !selectedRoomParticipantIds.has(friend.id)
  );
  const canSaveGroupSettingsName = Boolean(
    currentUserCanManageSelectedRoom &&
    groupSettingsName.trim() &&
    selectedRoom &&
    groupSettingsName.trim() !== selectedRoom.name.trim() &&
    !groupSettingsSaving
  );

  const canKickMember = useCallback(
    (user: User) => {
      if (!selectedRoom || !currentUser || groupSettingsSaving) return false;
      if (user.id === currentUser.id) return false;
      if (selectedRoom.participants.length <= MIN_GROUP_MEMBERS) return false;
      if (isCurrentUserOwner) return true;
      if (isCurrentUserModerator) {
        return user.role !== 'OWNER' && user.role !== 'MODERATOR' && user.id !== selectedRoom.ownerId;
      }
      return false;
    },
    [selectedRoom, currentUser, groupSettingsSaving, isCurrentUserOwner, isCurrentUserModerator]
  );

  return {
    createGroupOpen,
    groupName,
    setGroupName,
    selectedGroupMemberIds,
    groupCreating,
    groupError,
    setGroupError,
    groupSettingsName,
    setGroupSettingsName,
    isEditingGroupName,
    setIsEditingGroupName,
    selectedAddMemberIds,
    setSelectedAddMemberIds,
    addMembersModalOpen,
    setAddMembersModalOpen,
    groupMemberNicknames,
    openGroupMemberMenuId,
    setOpenGroupMemberMenuId,
    editingGroupMemberNicknameId,
    groupSettingsPendingAction,
    groupSettingsError,
    setGroupSettingsError,
    groupAvatarUploading,
    groupMembersExpanded,
    setGroupMembersExpanded,
    inviteModalOpen,
    setInviteModalOpen,
    inviteLoading,
    inviteRevoking,
    inviteCopied,
    inviteError,
    handleOpenInviteModal,
    handleRevokeInviteLink,
    getGroupInviteUrl,
    handleCopyInviteLink,
    handleOpenCreateGroup,
    handleCloseCreateGroup,
    handleToggleGroupMember,
    handleCreateGroup,
    handleToggleAddRoomMember,
    handleUpdateGroupSettingsName,
    handleAddRoomMembers,
    handleGroupMemberNicknameChange,
    handleToggleGroupMemberMenu,
    handleStartEditGroupMemberNickname,
    handleCancelEditGroupMemberNickname,
    handleUpdateRoomMemberNickname,
    handleKickRoomMember,
    handleTransferRoomOwner,
    handleLeaveSelectedGroup,
    handleUpdateMemberRole,
    handleDeleteSelectedGroup,
    handleGroupAvatarChange,
    groupMemberRequirementText,
    canCreateGroup,
    selectedRoomOwnerId,
    selectedRoomOwnerName,
    currentUserMemberRole,
    isCurrentUserOwner,
    isCurrentUserModerator,
    currentUserCanManageSelectedRoom,
    canManagePinnedMessages,
    groupSettingsSaving,
    addMemberCandidates,
    canSaveGroupSettingsName,
    canKickMember,
  };
}

