import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, Dispatch, FormEvent, SetStateAction } from 'react';
import { apiClient } from '../services/api';
import {
  ACCEPTED_AVATAR_TYPES,
  BIO_MAX_LENGTH,
  MAX_AVATAR_SIZE_BYTES,
  MAX_AVATAR_SIZE_MB,
} from '../constants/chatConstants';
import type { User } from '../types';

interface Options {
  currentUser: User | null;
  getAvatarUrl: (avatar?: string | null) => string;
  applyUpdatedCurrentUserProfile: (user: User) => void;
  setProfileMenuOpen: Dispatch<SetStateAction<boolean>>;
  setProfileEditorOpen: Dispatch<SetStateAction<boolean>>;
}

/** Owns the edit-profile form state (fields, avatar preview, save status) and the revoke of blob previews. */
export function useProfileEditor(options: Options) {
  const {
    currentUser, getAvatarUrl, applyUpdatedCurrentUserProfile, setProfileMenuOpen,
    setProfileEditorOpen,
  } = options;

  const [profileFullName, setProfileFullName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [profileAvatarPreview, setProfileAvatarPreview] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => () => {
    if (profileAvatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(profileAvatarPreview);
    }
  }, [profileAvatarPreview]);

  const handleOpenProfileEditor = useCallback(() => {
    setProfileFullName(currentUser?.fullName ?? '');
    setProfileBio(currentUser?.bio ?? '');
    setProfileAvatarFile(null);
    setProfileAvatarPreview(getAvatarUrl(currentUser?.avatar));
    setProfileError('');
    setProfileMenuOpen(false);
    setProfileEditorOpen(true);
  }, [currentUser, getAvatarUrl, setProfileEditorOpen, setProfileMenuOpen]);

  const handleCloseProfileEditor = useCallback(() => {
    if (profileSaving) return;
    setProfileEditorOpen(false);
    setProfileAvatarFile(null);
    setProfileAvatarPreview('');
    setProfileBio('');
    setProfileError('');
  }, [profileSaving, setProfileEditorOpen]);

  const handleProfileAvatarChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setProfileAvatarFile(null);
      setProfileError('Choose a JPG, PNG, GIF, or WebP image.');
      event.currentTarget.value = '';
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setProfileAvatarFile(null);
      setProfileError(`Avatar must be ${MAX_AVATAR_SIZE_MB}MB or smaller.`);
      event.currentTarget.value = '';
      return;
    }
    setProfileAvatarFile(file);
    setProfileAvatarPreview(URL.createObjectURL(file));
    setProfileError('');
  }, []);

  const handleUpdateProfile = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const fullName = profileFullName.trim();
    if (!fullName) {
      setProfileError('Full name is required.');
      return;
    }
    if (profileBio.trim().length > BIO_MAX_LENGTH) {
      setProfileError(`Bio must be ${BIO_MAX_LENGTH} characters or fewer.`);
      return;
    }

    const formData = new FormData();
    formData.append('fullName', fullName);
    formData.append('bio', profileBio.trim());
    if (profileAvatarFile) formData.append('avatar', profileAvatarFile);
    setProfileSaving(true);
    setProfileError('');
    try {
      const response = await apiClient.patch<User>('/users/me', formData);
      applyUpdatedCurrentUserProfile(response.data);
      setProfileEditorOpen(false);
      setProfileAvatarFile(null);
      setProfileAvatarPreview('');
      setProfileBio('');
    } catch (error) {
      console.error('Failed to update profile:', error);
      setProfileError('Unable to update profile.');
    } finally {
      setProfileSaving(false);
    }
  }, [applyUpdatedCurrentUserProfile, profileAvatarFile, profileBio, profileFullName, setProfileEditorOpen]);

  return {
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
  };
}
