import { useCallback, useEffect, useState } from 'react';
import type React from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatRoom, ConversationSetting, User } from '../types';
import type { ConversationFilter, ConversationTarget } from '../types/chat.types';
import { apiClient } from '../services/api';
import {
  applyConversationSettingToRoom,
  applyConversationSettingToUser,
} from '../utils/userUtils';
import {
  compareUsersByChatActivity,
  sortRoomsByChatActivity,
} from '../utils/conversationUtils';

interface Options {
  conversationFilter: ConversationFilter;
  selectedRoomId: number | null;
  selectedUserId: number | null;
  userSearchQuery: string;
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setFriends: Dispatch<SetStateAction<User[]>>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  clearSelectedConversation: () => void;
  navigateToChatRoot: () => void;
}

export function useConversationSettings({
  conversationFilter,
  selectedRoomId,
  selectedUserId,
  userSearchQuery,
  selectedUserIdRef,
  selectedRoomIdRef,
  setUsers,
  setFriends,
  setSelectedUser,
  setRooms,
  setSelectedRoom,
  clearSelectedConversation,
  navigateToChatRoot,
}: Options) {
  const [openConversationMenuKey, setOpenConversationMenuKey] = useState<string | null>(null);
  const [conversationSettingPendingKey, setConversationSettingPendingKey] = useState<string | null>(null);
  const [conversationSettingsError, setConversationSettingsError] = useState('');
  const [conversationDeleteTarget, setConversationDeleteTarget] = useState<ConversationTarget | null>(null);

  useEffect(() => {
    if (!openConversationMenuKey) {
      return undefined;
    }

    const closeConversationMenu = () => setOpenConversationMenuKey(null);
    const handleConversationMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenConversationMenuKey(null);
      }
    };

    document.addEventListener('click', closeConversationMenu);
    document.addEventListener('keydown', handleConversationMenuKeyDown);

    return () => {
      document.removeEventListener('click', closeConversationMenu);
      document.removeEventListener('keydown', handleConversationMenuKeyDown);
    };
  }, [openConversationMenuKey]);

  useEffect(() => {
    setOpenConversationMenuKey(null);
  }, [conversationFilter, selectedRoomId, selectedUserId, userSearchQuery]);

  const applyConversationSetting = useCallback((setting: ConversationSetting) => {
    if (setting.targetUserId) {
      setUsers((currentUsers) =>
        [...currentUsers.map((user) => applyConversationSettingToUser(user, setting))]
          .sort(compareUsersByChatActivity)
      );
      setFriends((currentFriends) =>
        [...currentFriends.map((friend) => applyConversationSettingToUser(friend, setting))]
          .sort(compareUsersByChatActivity)
      );
      setSelectedUser((currentSelectedUser) =>
        currentSelectedUser
          ? applyConversationSettingToUser(currentSelectedUser, setting)
          : currentSelectedUser
      );
      return;
    }

    if (setting.chatRoomId) {
      setRooms((currentRooms) =>
        sortRoomsByChatActivity(
          currentRooms.map((room) => applyConversationSettingToRoom(room, setting))
        )
      );
      setSelectedRoom((currentSelectedRoom) =>
        currentSelectedRoom
          ? applyConversationSettingToRoom(currentSelectedRoom, setting)
          : currentSelectedRoom
      );
    }
  }, [setFriends, setRooms, setSelectedRoom, setSelectedUser, setUsers]);

  const handleToggleConversationMenu = useCallback((
    targetKey: string,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    setConversationSettingsError('');
    setOpenConversationMenuKey((currentKey) => (currentKey === targetKey ? null : targetKey));
  }, []);

  const handleUpdateConversationSetting = useCallback(async (
    target: ConversationTarget,
    patch: Partial<Pick<ConversationSetting, 'pinned' | 'muted' | 'archived'>>
  ) => {
    const targetKey =
      target.type === 'user'
        ? `user-${target.user.id}`
        : `room-${target.room.id}`;
    const endpoint =
      target.type === 'user'
        ? `/conversation-settings/private/${target.user.id}`
        : `/conversation-settings/rooms/${target.room.id}`;

    setConversationSettingPendingKey(targetKey);
    setConversationSettingsError('');

    try {
      const response = await apiClient.patch<ConversationSetting>(endpoint, patch);
      applyConversationSetting(response.data);
      setOpenConversationMenuKey(null);
    } catch (error) {
      console.error('Failed to update conversation setting:', error);
      setConversationSettingsError('Unable to update conversation settings.');
    } finally {
      setConversationSettingPendingKey(null);
    }
  }, [applyConversationSetting]);

  const handleDeleteConversation = useCallback(async () => {
    if (!conversationDeleteTarget) {
      return;
    }

    const target = conversationDeleteTarget;
    const targetKey = target.type === 'user' ? `user-${target.user.id}` : `room-${target.room.id}`;
    const endpoint = target.type === 'user'
      ? `/conversation-settings/private/${target.user.id}`
      : `/conversation-settings/rooms/${target.room.id}`;

    setConversationSettingPendingKey(targetKey);
    setConversationSettingsError('');

    try {
      await apiClient.delete(endpoint);
      setOpenConversationMenuKey(null);
      setConversationDeleteTarget(null);

      if (target.type === 'user') {
        setUsers((currentUsers) => currentUsers.filter((user) => user.id !== target.user.id));
        if (selectedUserIdRef.current === target.user.id) {
          clearSelectedConversation();
          navigateToChatRoot();
        }
      } else {
        setRooms((currentRooms) => currentRooms.filter((room) => room.id !== target.room.id));
        if (selectedRoomIdRef.current === target.room.id) {
          clearSelectedConversation();
          navigateToChatRoot();
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      setConversationSettingsError('Unable to delete this conversation.');
    } finally {
      setConversationSettingPendingKey(null);
    }
  }, [
    clearSelectedConversation,
    conversationDeleteTarget,
    navigateToChatRoot,
    selectedRoomIdRef,
    selectedUserIdRef,
    setRooms,
    setUsers,
  ]);

  return {
    openConversationMenuKey,
    setOpenConversationMenuKey,
    conversationSettingPendingKey,
    conversationSettingsError,
    setConversationSettingsError,
    conversationDeleteTarget,
    setConversationDeleteTarget,
    applyConversationSetting,
    handleToggleConversationMenu,
    handleUpdateConversationSetting,
    handleDeleteConversation,
  };
}

