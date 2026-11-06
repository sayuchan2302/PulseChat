import { useCallback, useEffect, useState } from 'react';
import type { User } from '../types';
import { soundService } from '../services/soundService';
import {
  getPushSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '../services/pushService';

export function useHeaderPreferences(currentUser: User | null) {
  const [soundMuted, setSoundMuted] = useState(() => soundService.isMuted());
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    return soundService.onMuteChange((muted) => setSoundMuted(muted));
  }, []);

  useEffect(() => {
    if (currentUser && isPushSupported()) {
      void getPushSubscription().then((sub) => setPushSubscribed(Boolean(sub)));
    }
  }, [currentUser]);

  const handleTogglePush = useCallback(async () => {
    if (pushSubscribed) {
      const ok = await unsubscribeFromPush();
      if (ok) setPushSubscribed(false);
    } else {
      const ok = await subscribeToPush();
      if (ok) setPushSubscribed(true);
    }
  }, [pushSubscribed]);

  const handleToggleSound = useCallback(() => {
    soundService.toggleMuted();
  }, []);

  const handleToggleProfileMenu = useCallback(() => {
    setProfileMenuOpen((currentOpen) => !currentOpen);
  }, []);

  return {
    soundMuted,
    pushSubscribed,
    profileMenuOpen,
    setProfileMenuOpen,
    handleTogglePush,
    handleToggleSound,
    handleToggleProfileMenu,
  };
}

