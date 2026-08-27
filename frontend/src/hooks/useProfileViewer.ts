import { useCallback, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ChatRoom, User } from '../types';
import { apiClient } from '../services/api';
import { mergeViewedProfileUser } from '../utils/userUtils';

interface UseProfileViewerOptions {
  users: User[];
  friends: User[];
  selectedUser: User | null;
  selectedRoom: ChatRoom | null;
  setProfileMenuOpen: Dispatch<SetStateAction<boolean>>;
}

export function useProfileViewer({
  users,
  friends,
  selectedUser,
  selectedRoom,
  setProfileMenuOpen,
}: UseProfileViewerOptions) {
  const [viewedProfileUser, setViewedProfileUser] = useState<User | null>(null);
  const [viewedProfileLoading, setViewedProfileLoading] = useState(false);
  const [viewedProfileError, setViewedProfileError] = useState('');
  const [profileActionError, setProfileActionError] = useState('');
  const viewedProfileUsernameRef = useRef('');

  const activeViewedProfileUser = useMemo(() => {
    if (!viewedProfileUser) {
      return null;
    }

    const refreshedUser =
      users.find((user) => user.id === viewedProfileUser.id) ??
      friends.find((friend) => friend.id === viewedProfileUser.id) ??
      (selectedUser?.id === viewedProfileUser.id ? selectedUser : undefined) ??
      selectedRoom?.participants.find((participant) => participant.id === viewedProfileUser.id);

    return mergeViewedProfileUser(viewedProfileUser, refreshedUser);
  }, [friends, selectedRoom, selectedUser, users, viewedProfileUser]);

  const clearViewedProfile = useCallback(() => {
    viewedProfileUsernameRef.current = '';
    setViewedProfileUser(null);
  }, []);

  const handleOpenUserProfile = useCallback(async (user: User) => {
    const requestedUsername = user.username;
    viewedProfileUsernameRef.current = requestedUsername;
    setViewedProfileUser(user);
    setProfileActionError('');
    setViewedProfileError('');
    setViewedProfileLoading(true);
    setProfileMenuOpen(false);

    try {
      const response = await apiClient.get<User>(`/users/${encodeURIComponent(requestedUsername)}`);
      setViewedProfileUser((currentProfileUser) =>
        currentProfileUser?.username === requestedUsername
          ? { ...currentProfileUser, ...response.data }
          : currentProfileUser
      );
    } catch (error) {
      console.error('Failed to load user profile:', error);
      if (viewedProfileUsernameRef.current === requestedUsername) {
        setViewedProfileError('Unable to refresh profile.');
      }
    } finally {
      if (viewedProfileUsernameRef.current === requestedUsername) {
        setViewedProfileLoading(false);
      }
    }
  }, [setProfileMenuOpen]);

  const handleCloseUserProfile = useCallback(() => {
    clearViewedProfile();
    setViewedProfileLoading(false);
    setViewedProfileError('');
    setProfileActionError('');
  }, [clearViewedProfile]);

  return {
    viewedProfileUser,
    setViewedProfileUser,
    viewedProfileLoading,
    viewedProfileError,
    profileActionError,
    setProfileActionError,
    activeViewedProfileUser,
    clearViewedProfile,
    handleOpenUserProfile,
    handleCloseUserProfile,
  };
}

export default useProfileViewer;
