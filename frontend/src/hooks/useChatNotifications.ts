import { useCallback, useEffect, useRef } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { Friendship, Message, User, ChatRoom } from '../types';
import type { ChatBrowserNotification } from '../types/chat.types';
import { soundService } from '../services/soundService';
import { BROWSER_NOTIFICATION_CLOSE_MS } from '../constants/chatConstants';
import {
  getBrowserNotificationPermission,
  isBrowserNotificationSupported,
  shouldShowBrowserNotification,
} from '../utils/callUtils';
import { getAvatarUrl, getUserDisplayName } from '../utils/userUtils';
import { getMessagePreviewContent } from '../utils/messageUtils';
import { getRequestsRoute, getRoomChatRoute, getUserChatRoute } from '../utils/routeUtils';

type MutableRef<T> = { current: T };

export interface UseChatNotificationsOptions {
  currentUser: User | null;
  currentUserRef: MutableRef<User | null>;
  currentUserIdRef: MutableRef<number | null>;
  usersRef: MutableRef<User[]>;
  friendsRef: MutableRef<User[]>;
  roomsRef: MutableRef<ChatRoom[]>;
  navigate: NavigateFunction;
}

export function useChatNotifications({
  currentUser,
  currentUserRef,
  currentUserIdRef,
  usersRef,
  friendsRef,
  roomsRef,
  navigate,
}: UseChatNotificationsOptions) {
  const permissionRef = useRef<NotificationPermission>(getBrowserNotificationPermission());
  const permissionRequestRef = useRef<Promise<NotificationPermission> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const findKnownUserById = useCallback((userId: number) => {
    const currentKnownUser = currentUserRef.current;
    const knownUsers = [
      currentKnownUser?.id === userId ? currentKnownUser : null,
      ...friendsRef.current,
      ...usersRef.current,
      ...roomsRef.current.flatMap((room) => room.participants),
    ].filter(Boolean) as User[];
    return knownUsers.find((user) => user.id === userId) ?? null;
  }, [currentUserRef, friendsRef, roomsRef, usersRef]);

  const findKnownRoomById = useCallback((roomId: number) => (
    roomsRef.current.find((room) => room.id === roomId) ?? null
  ), [roomsRef]);

  const resumeNotificationAudio = useCallback(async () => {
    if (typeof window === 'undefined') return null;
    const AudioContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextConstructor();
    const audioContext = audioContextRef.current;
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (error) {
        console.warn('Unable to unlock notification sound:', error);
        return null;
      }
    }
    return audioContext;
  }, []);

  const startIncomingCallRingtone = useCallback(() => soundService.startIncomingCallRingtone(), []);
  const stopIncomingCallRingtone = useCallback(() => soundService.stopIncomingCallRingtone(), []);

  const requestBrowserNotificationPermission = useCallback(async () => {
    if (!isBrowserNotificationSupported()) {
      permissionRef.current = 'denied';
      return 'denied' as NotificationPermission;
    }
    const currentPermission = getBrowserNotificationPermission();
    permissionRef.current = currentPermission;
    if (currentPermission !== 'default') return currentPermission;
    if (!permissionRequestRef.current) {
      permissionRequestRef.current = Notification.requestPermission()
        .then((permission) => { permissionRef.current = permission; return permission; })
        .catch((error) => {
          console.error('Failed to request browser notification permission:', error);
          const permission = getBrowserNotificationPermission();
          permissionRef.current = permission;
          return permission;
        })
        .finally(() => { permissionRequestRef.current = null; });
    }
    return permissionRequestRef.current;
  }, []);

  const showBrowserNotification = useCallback((notification: ChatBrowserNotification) => {
    if (!isBrowserNotificationSupported() || permissionRef.current !== 'granted' || !shouldShowBrowserNotification()) return false;
    try {
      const browserNotification = new Notification(notification.title, {
        body: notification.body,
        icon: getAvatarUrl(notification.user?.avatar),
        tag: notification.browserTag,
      });
      browserNotification.onclick = () => {
        window.focus();
        if (notification.path) navigate(notification.path);
        browserNotification.close();
      };
      window.setTimeout(() => browserNotification.close(), BROWSER_NOTIFICATION_CLOSE_MS);
      return true;
    } catch (error) {
      console.error('Failed to show browser notification:', error);
      return false;
    }
  }, [navigate]);

  const notifyWithBrowserNotification = useCallback((notification: ChatBrowserNotification, isMention = false) => {
    if (isMention) soundService.playMentionSound(); else soundService.playNotificationSound();
    if (permissionRef.current === 'default') void requestBrowserNotificationPermission();
    void showBrowserNotification(notification);
  }, [requestBrowserNotificationPermission, showBrowserNotification]);

  const buildMessageNotification = useCallback((message: Message) => {
    const preview = getMessagePreviewContent(message) || 'New message';
    const currentUser = currentUserRef.current;
    const isMention = Boolean(message.chatRoomId && (
      (currentUser && message.mentionedUserIds?.includes(currentUser.id)) ||
      (currentUser && message.mentionedUsernames?.includes(currentUser.username)) ||
      (message.content && /@all\b/i.test(message.content))
    ));
    if (message.chatRoomId) {
      const room = findKnownRoomById(message.chatRoomId);
      const sender = findKnownUserById(message.senderId);
      const senderName = getUserDisplayName(sender) || message.senderFullName?.trim() || message.senderUsername || 'Someone';
      return {
        title: isMention ? `🔔 ${senderName} mentioned you in ${room?.name ?? 'Group'}` : (room?.name ?? 'Group message'),
        body: isMention ? preview : `${senderName}: ${preview}`,
        path: getRoomChatRoute(message.chatRoomId),
        user: sender,
        browserTag: `room-message-${message.chatRoomId}`,
        isMention,
      };
    }
    const sender = findKnownUserById(message.senderId);
    const senderUsername = sender?.username || message.senderUsername;
    return {
      title: getUserDisplayName(sender) || message.senderFullName?.trim() || senderUsername || 'New message',
      body: preview,
      path: senderUsername ? getUserChatRoute(senderUsername) : undefined,
      user: sender,
      browserTag: `private-message-${message.senderId}`,
      isMention: false,
    };
  }, [currentUserRef, findKnownRoomById, findKnownUserById]);

  const buildFriendshipNotification = useCallback((friendship: Friendship) => {
    const currentUserId = currentUserIdRef.current;
    if (friendship.status === 'pending' && friendship.receiver.id === currentUserId) {
      const requesterName = getUserDisplayName(friendship.requester);
      return { title: 'New friend request', body: `${requesterName} sent you a friend request.`, path: getRequestsRoute(), user: friendship.requester, browserTag: `friend-request-${friendship.id}` };
    }
    if (friendship.status === 'accepted' && friendship.requester.id === currentUserId) {
      const receiverName = getUserDisplayName(friendship.receiver);
      return { title: 'Friend request accepted', body: `${receiverName} accepted your friend request.`, path: getUserChatRoute(friendship.receiver.username), user: friendship.receiver, browserTag: `friend-accepted-${friendship.id}` };
    }
    return null;
  }, [currentUserIdRef]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const unlockAudio = () => { void resumeNotificationAudio(); };
    window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => { window.removeEventListener('pointerdown', unlockAudio); window.removeEventListener('keydown', unlockAudio); };
  }, [resumeNotificationAudio]);

  useEffect(() => {
    if (!currentUser?.id || !isBrowserNotificationSupported()) return undefined;
    const requestPermission = () => { if (getBrowserNotificationPermission() === 'default') void requestBrowserNotificationPermission(); };
    requestPermission();
    window.addEventListener('pointerdown', requestPermission, { once: true, passive: true });
    window.addEventListener('keydown', requestPermission, { once: true });
    return () => { window.removeEventListener('pointerdown', requestPermission); window.removeEventListener('keydown', requestPermission); };
  }, [currentUser?.id, requestBrowserNotificationPermission]);

  useEffect(() => () => {
    stopIncomingCallRingtone();
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, [stopIncomingCallRingtone]);

  return {
    findKnownUserById,
    findKnownRoomById,
    startIncomingCallRingtone,
    stopIncomingCallRingtone,
    notifyWithBrowserNotification,
    buildMessageNotification,
    buildFriendshipNotification,
  };
}

export default useChatNotifications;
