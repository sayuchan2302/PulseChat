import { useCallback, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatRoom, User } from '../types';
import type { LoadOptions } from '../types/chat.types';
import {
  applyProfileToRoom,
  applyProfileToUser,
  getAvatarUrl,
} from '../utils/userUtils';
import { useBlockedUsers } from './useBlockedUsers';
import { useProfileEditor } from './useProfileEditor';
import { useProfileViewer } from './useProfileViewer';

type SilentLoader = (options?: LoadOptions) => Promise<unknown>;

interface UseUserProfileWorkspaceOptions {
  currentUser: User | null;
  currentUserIdRef: MutableRefObject<number | null>;
  users: User[];
  friends: User[];
  selectedUser: User | null;
  selectedRoom: ChatRoom | null;
  updateCurrentUser: (user: User) => void;
  setCurrentUser: Dispatch<SetStateAction<User | null>>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setFriends: Dispatch<SetStateAction<User[]>>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  setProfileMenuOpen: Dispatch<SetStateAction<boolean>>;
  loadUsers: SilentLoader;
  loadIncomingFriendRequests: SilentLoader;
  loadFriendSummary: SilentLoader;
}

export function useUserProfileWorkspace({
  currentUser,
  currentUserIdRef,
  users,
  friends,
  selectedUser,
  selectedRoom,
  updateCurrentUser,
  setCurrentUser,
  setUsers,
  setFriends,
  setSelectedUser,
  setRooms,
  setSelectedRoom,
  setProfileMenuOpen,
  loadUsers,
  loadIncomingFriendRequests,
  loadFriendSummary,
}: UseUserProfileWorkspaceOptions) {
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);

  const {
    setViewedProfileUser,
    viewedProfileLoading,
    viewedProfileError,
    profileActionError,
    setProfileActionError,
    activeViewedProfileUser,
    clearViewedProfile,
    handleOpenUserProfile,
    handleCloseUserProfile,
  } = useProfileViewer({
    users,
    friends,
    selectedUser,
    selectedRoom,
    setProfileMenuOpen,
  });

  const handleUserBlocked = useCallback(async (blockedUser: User) => {
    setFriends((current) => current.filter((friend) => friend.id !== blockedUser.id));
    setUsers((current) => current.map((listedUser) => listedUser.id === blockedUser.id
      ? { ...listedUser, friendshipStatus: 'none', friendshipId: undefined }
      : listedUser));
    setSelectedUser((current) => current?.id === blockedUser.id
      ? { ...current, friendshipStatus: 'none', friendshipId: undefined }
      : current);
    setViewedProfileUser((current) => current?.id === blockedUser.id
      ? { ...current, friendshipStatus: 'none', friendshipId: undefined }
      : current);
    await Promise.all([
      loadUsers({ search: '', silent: true }),
      loadIncomingFriendRequests({ silent: true }),
      loadFriendSummary({ silent: true }),
    ]);
  }, [
    loadFriendSummary,
    loadIncomingFriendRequests,
    loadUsers,
    setFriends,
    setSelectedUser,
    setUsers,
    setViewedProfileUser,
  ]);

  const {
    blockedUsers,
    blockedUserIds,
    blockedUsersOpen,
    openBlockedUsers,
    closeBlockedUsers,
    blockedUsersLoading,
    blockedUsersError,
    blockActionPendingUserId,
    toggleUserBlock,
  } = useBlockedUsers({
    currentUserId: currentUser?.id ?? null,
    onUserBlocked: handleUserBlocked,
    onActionError: setProfileActionError,
  });

  const handleOpenBlockedUsers = useCallback(() => {
    setProfileMenuOpen(false);
    openBlockedUsers();
  }, [openBlockedUsers, setProfileMenuOpen]);

  const applyUpdatedCurrentUserProfile = useCallback((updatedUser: User) => {
    const nextCurrentUser = currentUser
      ? { ...applyProfileToUser(currentUser, updatedUser), online: currentUser.online }
      : updatedUser;

    setCurrentUser(nextCurrentUser);
    currentUserIdRef.current = nextCurrentUser.id;
    updateCurrentUser(nextCurrentUser);
    setUsers((currentUsers) =>
      currentUsers.map((user) => applyProfileToUser(user, nextCurrentUser))
    );
    setFriends((currentFriends) =>
      currentFriends.map((friend) => applyProfileToUser(friend, nextCurrentUser))
    );
    setSelectedUser((currentSelectedUser) =>
      currentSelectedUser ? applyProfileToUser(currentSelectedUser, nextCurrentUser) : null
    );
    setRooms((currentRooms) =>
      currentRooms.map((room) => applyProfileToRoom(room, nextCurrentUser))
    );
    setSelectedRoom((currentSelectedRoom) =>
      currentSelectedRoom ? applyProfileToRoom(currentSelectedRoom, nextCurrentUser) : null
    );
  }, [
    currentUser,
    currentUserIdRef,
    setCurrentUser,
    setFriends,
    setRooms,
    setSelectedRoom,
    setSelectedUser,
    setUsers,
    updateCurrentUser,
  ]);

  const {
    profileFullName,
    setProfileFullName,
    profileBio,
    setProfileBio,
    profileAvatarPreview,
    profileSaving,
    profileError,
    setProfileError,
    handleOpenProfileEditor,
    handleCloseProfileEditor,
    handleProfileAvatarChange,
    handleUpdateProfile,
  } = useProfileEditor({
    currentUser,
    getAvatarUrl,
    applyUpdatedCurrentUserProfile,
    setProfileMenuOpen,
    setProfileEditorOpen,
  });

  const activeProfileUserIsBlocked = Boolean(
    activeViewedProfileUser &&
    blockedUsers.some((blockedUser) => blockedUser.id === activeViewedProfileUser.id)
  );
  const selectedUserIsBlocked = Boolean(
    selectedUser &&
    blockedUsers.some((blockedUser) => blockedUser.id === selectedUser.id)
  );

  return {
    profileEditorOpen,
    setViewedProfileUser,
    viewedProfileLoading,
    viewedProfileError,
    profileActionError,
    setProfileActionError,
    activeViewedProfileUser,
    clearViewedProfile,
    handleOpenUserProfile,
    handleCloseUserProfile,
    blockedUsers,
    blockedUserIds,
    blockedUsersOpen,
    closeBlockedUsers,
    blockedUsersLoading,
    blockedUsersError,
    blockActionPendingUserId,
    toggleUserBlock,
    handleOpenBlockedUsers,
    profileFullName,
    setProfileFullName,
    profileBio,
    setProfileBio,
    profileAvatarPreview,
    profileSaving,
    profileError,
    setProfileError,
    handleOpenProfileEditor,
    handleCloseProfileEditor,
    handleProfileAvatarChange,
    handleUpdateProfile,
    activeProfileUserIsBlocked,
    selectedUserIsBlocked,
  };
}

