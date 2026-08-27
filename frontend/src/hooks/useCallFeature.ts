import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { CALL_RINGING_TIMEOUT_MS } from '../config/constants';
import { CALL_RECONNECT_TIMEOUT_MS } from '../constants/chatConstants';
import type { CallSignalPayload, CallType, User } from '../types';
import type {
  ActiveCall,
  CallConnectionState,
  CallPermissionSnapshot,
  ChatBrowserNotification,
  PreCallSetup,
} from '../types/chat.types';
import { wsService } from '../services/websocket';
import {
  buildCallMediaConstraints,
  canSendWebRtcSignalForCall,
  getCallMediaErrorMessage,
  getScreenShareErrorMessage,
  queryCallPermission,
  stopMediaStream,
} from '../utils/callUtils';
import { canChatWithUser } from '../utils/userUtils';
import { useCallLifecycleActions } from './useCallLifecycleActions';
import { useCallMediaControls } from './useCallMediaControls';
import { useCallSession } from './useCallSession';
import { useWebRtcSignalHandlers } from './useWebRtcSignalHandlers';

const CALL_SIGNAL_DESTINATION = '/app/calls.signal';

const UNKNOWN_CALL_PERMISSIONS: CallPermissionSnapshot = {
  microphone: 'unknown',
  camera: 'unknown',
};

type MutableRef<T> = { current: T };

type UseCallFeatureOptions = {
  currentUserRef: MutableRef<User | null>;
  currentUserIdRef: MutableRef<number | null>;
  selectedUser: User | null;
  notifyWithBrowserNotification: (notification: ChatBrowserNotification) => void;
  startIncomingCallRingtone: () => void;
  stopIncomingCallRingtone: () => void;
};

export function useCallFeature({
  currentUserRef,
  currentUserIdRef,
  selectedUser,
  notifyWithBrowserNotification,
  startIncomingCallRingtone,
  stopIncomingCallRingtone,
}: UseCallFeatureOptions) {
  const [activeCall, setActiveCallState] = useState<ActiveCall | null>(null);
  const [callMinimized, setCallMinimized] = useState(false);
  const [callError, setCallError] = useState('');
  const [localCallStream, setLocalCallStream] = useState<MediaStream | null>(null);
  const [remoteCallStream, setRemoteCallStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);
  const [screenShareError, setScreenShareError] = useState('');
  const [callConnectionState, setCallConnectionState] = useState<CallConnectionState>('idle');
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callElapsedSeconds, setCallElapsedSeconds] = useState(0);
  const [callDevices, setCallDevices] = useState<MediaDeviceInfo[]>([]);
  const [callDevicesLoading, setCallDevicesLoading] = useState(false);
  const [callDeviceError, setCallDeviceError] = useState('');
  const [callPermissions, setCallPermissions] = useState<CallPermissionSnapshot>(
    UNKNOWN_CALL_PERMISSIONS,
  );
  const [selectedAudioInputId, setSelectedAudioInputId] = useState('');
  const [selectedVideoInputId, setSelectedVideoInputId] = useState('');
  const [preCallSetup, setPreCallSetup] = useState<PreCallSetup>(null);
  const [preCallPreviewStream, setPreCallPreviewStream] = useState<MediaStream | null>(null);
  const [preCallPreviewLoading, setPreCallPreviewLoading] = useState(false);
  const [preCallError, setPreCallError] = useState('');
  const [preCallSubmitting, setPreCallSubmitting] = useState(false);

  const activeCallRef = useRef<ActiveCall | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localCallStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const preCallPreviewStreamRef = useRef<MediaStream | null>(null);
  const preCallPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const micMutedRef = useRef(false);
  const cameraOffRef = useRef(false);
  const screenSharingRef = useRef(false);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const screenShareCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenShareStoppingRef = useRef(false);
  const selectedAudioInputIdRef = useRef('');
  const selectedVideoInputIdRef = useRef('');

  useCallSession({
    activeCall,
    setCallMinimized,
    localCallStream,
    remoteCallStream,
    preCallPreviewStream,
    micMuted,
    cameraOff,
    screenSharing,
    selectedAudioInputId,
    selectedVideoInputId,
    callStartedAt,
    setCallElapsedSeconds,
    activeCallRef,
    localCallStreamRef,
    preCallPreviewStreamRef,
    micMutedRef,
    cameraOffRef,
    screenSharingRef,
    selectedAudioInputIdRef,
    selectedVideoInputIdRef,
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
    preCallPreviewVideoRef,
  });

  const sendCallSignal = useCallback((payload: CallSignalPayload) => {
    const sent = wsService.sendMessage(CALL_SIGNAL_DESTINATION, payload);
    if (!sent) {
      setCallError('Call connection is not ready.');
    }

    return sent;
  }, []);

  const loadCallDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    setCallDevicesLoading(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCallDevices(devices.filter((device) =>
        device.kind === 'audioinput' || device.kind === 'videoinput'
      ));
      setCallDeviceError('');
    } catch (error) {
      console.error('Failed to load call devices:', error);
      setCallDeviceError('Unable to load microphone or camera list.');
    } finally {
      setCallDevicesLoading(false);
    }
  }, []);

  const refreshCallPermissions = useCallback(async (callType: CallType) => {
    const [microphone, camera] = await Promise.all([
      queryCallPermission('microphone'),
      callType === 'VIDEO' ? queryCallPermission('camera') : Promise.resolve('unsupported' as const),
    ]);

    setCallPermissions({ microphone, camera });
  }, []);

  const applySelectedDeviceIdsFromStream = useCallback((stream: MediaStream) => {
    const audioDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId;
    const videoDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;

    if (audioDeviceId) {
      setSelectedAudioInputId(audioDeviceId);
    }

    if (videoDeviceId) {
      setSelectedVideoInputId(videoDeviceId);
    }
  }, []);

  const stopPreCallPreview = useCallback(() => {
    stopMediaStream(preCallPreviewStreamRef.current);
    preCallPreviewStreamRef.current = null;
    setPreCallPreviewStream(null);
  }, []);

  const startPreCallPreview = useCallback(async (
    callType: CallType,
    audioInputId = selectedAudioInputId,
    videoInputId = selectedVideoInputId
  ) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPreCallError('Browser does not support media calls.');
      return null;
    }

    setPreCallPreviewLoading(true);
    setPreCallError('');
    stopMediaStream(preCallPreviewStreamRef.current);
    preCallPreviewStreamRef.current = null;
    setPreCallPreviewStream(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        buildCallMediaConstraints(callType, audioInputId, videoInputId)
      );
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !micMutedRef.current;
      });
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !cameraOffRef.current;
      });

      preCallPreviewStreamRef.current = stream;
      setPreCallPreviewStream(stream);
      applySelectedDeviceIdsFromStream(stream);
      void loadCallDevices();
      void refreshCallPermissions(callType);
      return stream;
    } catch (error) {
      console.error('Failed to start pre-call preview:', error);
      setPreCallError(getCallMediaErrorMessage(error, callType));
      void refreshCallPermissions(callType);
      return null;
    } finally {
      setPreCallPreviewLoading(false);
    }
  }, [
    applySelectedDeviceIdsFromStream,
    loadCallDevices,
    refreshCallPermissions,
    selectedAudioInputId,
    selectedVideoInputId,
  ]);

  const getLocalCallMedia = useCallback((call: ActiveCall) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Browser does not support media calls.');
    }

    return navigator.mediaDevices.getUserMedia(
      buildCallMediaConstraints(
        call.type,
        selectedAudioInputIdRef.current,
        selectedVideoInputIdRef.current,
      )
    );
  }, []);

  const stopScreenShareResources = useCallback(() => {
    screenShareStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    screenShareStreamRef.current = null;

    const cameraTrack = screenShareCameraTrackRef.current;
    if (cameraTrack && !localCallStreamRef.current?.getTracks().includes(cameraTrack)) {
      cameraTrack.stop();
    }
    screenShareCameraTrackRef.current = null;
    screenSharingRef.current = false;
    screenShareStoppingRef.current = false;
    setScreenSharing(false);
    setRemoteScreenSharing(false);
    setScreenShareError('');
  }, []);

  const stopCallMedia = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.close();
    }
    peerConnectionRef.current = null;
    pendingIceCandidatesRef.current = [];

    stopScreenShareResources();
    localCallStreamRef.current?.getTracks().forEach((track) => track.stop());
    localCallStreamRef.current = null;
    setLocalCallStream(null);
    setRemoteCallStream(null);
    setMicMuted(false);
    setCameraOff(false);
    setCallConnectionState('idle');
    setCallStartedAt(null);
    setCallElapsedSeconds(0);
    setCallDeviceError('');
    stopIncomingCallRingtone();
  }, [stopIncomingCallRingtone, stopScreenShareResources]);

  const finishCall = useCallback((message = '') => {
    setCallMinimized(false);
    stopCallMedia();
    setActiveCallState((currentCall) =>
      currentCall ? { ...currentCall, status: 'ending' } : currentCall
    );
    if (message) {
      setCallError(message);
    }

    window.setTimeout(() => {
      setActiveCallState(null);
      setCallError('');
    }, 1500);
  }, [stopCallMedia]);

  useEffect(() => {
    if (activeCall?.direction === 'incoming' && activeCall.status === 'ringing') {
      startIncomingCallRingtone();
      return stopIncomingCallRingtone;
    }

    stopIncomingCallRingtone();
    return undefined;
  }, [activeCall, startIncomingCallRingtone, stopIncomingCallRingtone]);

  useEffect(() => {
    if (activeCall) {
      void loadCallDevices();
    }
  }, [activeCall, loadCallDevices]);

  useEffect(() => {
    const callType = preCallSetup?.type ?? activeCall?.type;
    if (!callType) {
      setCallPermissions(UNKNOWN_CALL_PERMISSIONS);
      return;
    }

    void refreshCallPermissions(callType);
  }, [activeCall?.type, preCallSetup?.type, refreshCallPermissions]);

  useEffect(() => {
    if (
      !activeCall ||
      !['reconnecting', 'failed'].includes(callConnectionState) ||
      activeCall.status === 'ending'
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.status === 'ending') {
        return;
      }

      if (peerConnectionRef.current?.connectionState === 'connected') {
        setCallConnectionState('connected');
        setCallError('');
        return;
      }

      if (currentCall.callId) {
        sendCallSignal({ eventType: 'CALL_END', callId: currentCall.callId });
      }

      finishCall('Call connection lost.');
    }, CALL_RECONNECT_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeCall, callConnectionState, finishCall, sendCallSignal]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'ringing') {
      return undefined;
    }

    const callId = activeCall.callId;
    const timeoutId = window.setTimeout(() => {
      const currentCall = activeCallRef.current;
      if (
        currentCall?.status !== 'ringing' ||
        (callId !== undefined && currentCall.callId !== callId)
      ) {
        return;
      }

      finishCall(currentCall.direction === 'incoming' ? 'Missed call.' : 'No answer.');
    }, CALL_RINGING_TIMEOUT_MS + 12_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeCall, finishCall]);

  const handleCallSignal = useWebRtcSignalHandlers({
    activeCallRef,
    currentUserRef,
    currentUserIdRef,
    peerConnectionRef,
    localCallStreamRef,
    pendingIceCandidatesRef,
    micMutedRef,
    cameraOffRef,
    getLocalCallMedia,
    applySelectedDeviceIdsFromStream,
    loadCallDevices,
    refreshCallPermissions,
    sendCallSignal,
    finishCall,
    stopPreCallPreview,
    setPreCallSetup,
    setActiveCallState,
    setLocalCallStream,
    setRemoteCallStream,
    setCallConnectionState,
    setCallStartedAt,
    setCallError,
    setRemoteScreenSharing,
    setScreenShareError,
    notifyWithBrowserNotification,
  });

  const sendActiveCallCloseSignal = useCallback(() => {
    const currentCall = activeCallRef.current;
    if (!currentCall?.callId) {
      return;
    }

    if (currentCall.status === 'ringing' && currentCall.direction !== 'outgoing') {
      return;
    }

    const eventType =
      currentCall.status === 'ringing' && currentCall.direction === 'outgoing'
        ? 'CALL_CANCEL'
        : 'CALL_END';

    wsService.sendMessage(CALL_SIGNAL_DESTINATION, { eventType, callId: currentCall.callId });
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      sendActiveCallCloseSignal();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sendActiveCallCloseSignal]);

  const sendOutgoingCallInvite = useCallback((callType: CallType, targetUser: User) => {
    if (activeCallRef.current || !canChatWithUser(targetUser)) {
      return false;
    }

    const optimisticCall: ActiveCall = {
      type: callType,
      status: 'ringing',
      direction: 'outgoing',
      peer: targetUser,
    };

    void loadCallDevices();
    setCallConnectionState('idle');
    setCallStartedAt(null);
    setCallElapsedSeconds(0);
    setCallDeviceError('');
    setScreenSharing(false);
    setRemoteScreenSharing(false);
    setScreenShareError('');
    screenSharingRef.current = false;

    if (sendCallSignal({ eventType: 'CALL_INVITE', receiverId: targetUser.id, callType })) {
      setActiveCallState(optimisticCall);
      setCallError('');
      return true;
    }

    return false;
  }, [loadCallDevices, sendCallSignal]);

  const openPreCallSetupForUser = useCallback((targetUser: User, callType: CallType) => {
    if (!canChatWithUser(targetUser) || activeCallRef.current) {
      return;
    }

    micMutedRef.current = false;
    cameraOffRef.current = false;
    setMicMuted(false);
    setCameraOff(false);
    setPreCallSetup({ type: callType, target: targetUser });
    setPreCallError('');
    setPreCallSubmitting(false);
    setCallDeviceError('');
    setCallError('');
    setScreenShareError('');
    setRemoteScreenSharing(false);
    void loadCallDevices();
    void startPreCallPreview(callType);
  }, [loadCallDevices, startPreCallPreview]);

  const handleStartCall = useCallback((callType: CallType) => {
    if (selectedUser) {
      openPreCallSetupForUser(selectedUser, callType);
    }
  }, [openPreCallSetupForUser, selectedUser]);

  const handleClosePreCallSetup = useCallback(() => {
    if (preCallSubmitting) {
      return;
    }

    stopPreCallPreview();
    setPreCallSetup(null);
    setPreCallError('');
    setPreCallSubmitting(false);
  }, [preCallSubmitting, stopPreCallPreview]);

  const handlePreCallRetryPreview = useCallback(() => {
    if (preCallSetup) {
      void startPreCallPreview(preCallSetup.type);
    }
  }, [preCallSetup, startPreCallPreview]);

  const handleConfirmStartCall = useCallback(async () => {
    if (!preCallSetup || preCallPreviewLoading || preCallSubmitting) {
      return;
    }

    setPreCallSubmitting(true);
    const stream = preCallPreviewStreamRef.current ??
      (await startPreCallPreview(preCallSetup.type));
    if (!stream) {
      setPreCallSubmitting(false);
      return;
    }

    stopPreCallPreview();
    const sent = sendOutgoingCallInvite(preCallSetup.type, preCallSetup.target);
    if (sent) {
      setPreCallSetup(null);
      setPreCallError('');
      setPreCallSubmitting(false);
      return;
    }

    setPreCallError('Call connection is not ready.');
    setPreCallSubmitting(false);
  }, [
    preCallPreviewLoading,
    preCallSetup,
    preCallSubmitting,
    sendOutgoingCallInvite,
    startPreCallPreview,
    stopPreCallPreview,
  ]);

  const {
    handlePreCallAudioInputChange,
    handlePreCallVideoInputChange,
    handlePreCallToggleMic,
    handlePreCallToggleCamera,
    handleToggleMic,
    handleToggleCamera,
  } = useCallMediaControls({
    preCallSetup,
    selectedAudioInputId,
    selectedVideoInputId,
    micMuted,
    cameraOff,
    screenSharingRef,
    micMutedRef,
    cameraOffRef,
    preCallPreviewStreamRef,
    localCallStreamRef,
    startPreCallPreview,
    setSelectedAudioInputId,
    setSelectedVideoInputId,
    setMicMuted,
    setCameraOff,
  });

  const handleRetryActiveCall = useCallback(() => {
    const currentCall = activeCallRef.current;
    if (!currentCall) {
      return;
    }

    if (currentCall.callId) {
      sendCallSignal({ eventType: 'CALL_END', callId: currentCall.callId });
    }

    stopCallMedia();
    setActiveCallState(null);
    setCallError('');
    micMutedRef.current = false;
    cameraOffRef.current = false;
    setMicMuted(false);
    setCameraOff(false);
    setPreCallSetup({ type: currentCall.type, target: currentCall.peer });
    setPreCallError('');
    setPreCallSubmitting(false);
    setScreenSharing(false);
    setRemoteScreenSharing(false);
    setScreenShareError('');
    screenSharingRef.current = false;
    void loadCallDevices();
    void startPreCallPreview(currentCall.type);
  }, [loadCallDevices, sendCallSignal, startPreCallPreview, stopCallMedia]);

  const { handleAcceptCall, handleRejectCall, handleEndCall } = useCallLifecycleActions({
    activeCallRef,
    sendCallSignal,
    finishCall,
    stopIncomingCallRingtone,
    loadCallDevices,
    setActiveCall: setActiveCallState,
    setCallError,
  });

  const replaceLocalCallTrack = useCallback(async (kind: 'audio' | 'video', deviceId: string) => {
    if (kind === 'audio') {
      setSelectedAudioInputId(deviceId);
    } else {
      setSelectedVideoInputId(deviceId);
    }

    const currentCall = activeCallRef.current;
    if (kind === 'video' && screenSharingRef.current) {
      return;
    }

    if (!currentCall || (kind === 'video' && currentCall.type !== 'VIDEO')) {
      return;
    }

    const currentStream = localCallStreamRef.current;
    if (!currentStream) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCallDeviceError('Browser does not support media device switching.');
      return;
    }

    setCallDeviceError('');

    try {
      const constraints: MediaStreamConstraints =
        kind === 'audio'
          ? { audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false }
          : { audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : true };
      const replacementStream = await navigator.mediaDevices.getUserMedia(constraints);
      const [replacementTrack] = kind === 'audio'
        ? replacementStream.getAudioTracks()
        : replacementStream.getVideoTracks();

      if (!replacementTrack) {
        throw new Error(`No ${kind} track found for selected device.`);
      }

      replacementTrack.enabled = kind === 'audio' ? !micMuted : !cameraOff;

      const sender = peerConnectionRef.current
        ?.getSenders()
        .find((candidate) => candidate.track?.kind === kind);
      if (sender) {
        await sender.replaceTrack(replacementTrack);
      }

      const oldTracks = kind === 'audio'
        ? currentStream.getAudioTracks()
        : currentStream.getVideoTracks();
      oldTracks.forEach((track) => {
        currentStream.removeTrack(track);
        track.stop();
      });
      currentStream.addTrack(replacementTrack);
      replacementStream
        .getTracks()
        .filter((track) => track !== replacementTrack)
        .forEach((track) => track.stop());

      const nextStream = new MediaStream(currentStream.getTracks());
      localCallStreamRef.current = nextStream;
      setLocalCallStream(nextStream);

      const nextDeviceId = replacementTrack.getSettings().deviceId || deviceId;
      if (kind === 'audio') {
        setSelectedAudioInputId(nextDeviceId);
      } else {
        setSelectedVideoInputId(nextDeviceId);
      }

      void loadCallDevices();
    } catch (error) {
      console.error(`Failed to switch ${kind} device:`, error);
      setCallDeviceError(
        kind === 'audio' ? 'Unable to switch microphone.' : 'Unable to switch camera.'
      );
    }
  }, [cameraOff, loadCallDevices, micMuted]);

  const handleStopScreenShare = useCallback(async (notify = true) => {
    if (screenShareStoppingRef.current) {
      return;
    }

    screenShareStoppingRef.current = true;
    const currentCall = activeCallRef.current;
    const currentStream = localCallStreamRef.current;
    const screenShareStream = screenShareStreamRef.current;
    const cameraTrack = screenShareCameraTrackRef.current;

    try {
      if (cameraTrack) {
        cameraTrack.enabled = !cameraOffRef.current;
      }

      const sender = peerConnectionRef.current
        ?.getSenders()
        .find((candidate) => candidate.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(cameraTrack ?? null);
      }

      if (currentStream) {
        currentStream.getVideoTracks().forEach((track) => {
          currentStream.removeTrack(track);
        });

        if (cameraTrack) {
          currentStream.addTrack(cameraTrack);
        }

        const nextStream = new MediaStream(currentStream.getTracks());
        localCallStreamRef.current = nextStream;
        setLocalCallStream(nextStream);

        if (cameraTrack) {
          applySelectedDeviceIdsFromStream(nextStream);
        }
      }

      screenShareStream?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      screenShareStreamRef.current = null;
      screenShareCameraTrackRef.current = null;
      screenSharingRef.current = false;
      setScreenSharing(false);
      setScreenShareError('');

      if (
        notify &&
        currentCall?.callId &&
        canSendWebRtcSignalForCall(currentCall, currentCall.callId)
      ) {
        sendCallSignal({ eventType: 'SCREEN_SHARE_STOP', callId: currentCall.callId });
      }
    } catch (error) {
      console.error('Failed to stop screen sharing:', error);
      setScreenShareError('Unable to stop screen sharing.');
    } finally {
      screenShareStoppingRef.current = false;
    }
  }, [applySelectedDeviceIdsFromStream, sendCallSignal]);

  const handleStartScreenShare = useCallback(async () => {
    const currentCall = activeCallRef.current;
    const currentStream = localCallStreamRef.current;
    const peerConnection = peerConnectionRef.current;

    if (
      !currentCall?.callId ||
      currentCall.type !== 'VIDEO' ||
      !canSendWebRtcSignalForCall(currentCall, currentCall.callId)
    ) {
      return;
    }

    if (screenSharingRef.current || screenShareStoppingRef.current) {
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenShareError('Browser does not support screen sharing.');
      return;
    }

    if (!currentStream || !peerConnection) {
      setScreenShareError('Call video is not ready.');
      return;
    }

    setScreenShareError('');
    let displayStream: MediaStream | null = null;

    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const [screenTrack] = displayStream.getVideoTracks();
      if (!screenTrack) {
        throw new Error('No screen track selected.');
      }

      const sender = peerConnection
        .getSenders()
        .find((candidate) => candidate.track?.kind === 'video');
      if (!sender) {
        throw new Error('Video sender is not ready.');
      }

      const [cameraTrack] = currentStream.getVideoTracks();
      screenShareCameraTrackRef.current = cameraTrack ?? null;

      await sender.replaceTrack(screenTrack);

      currentStream.getVideoTracks().forEach((track) => {
        currentStream.removeTrack(track);
      });
      currentStream.addTrack(screenTrack);

      const nextStream = new MediaStream(currentStream.getTracks());
      localCallStreamRef.current = nextStream;
      screenShareStreamRef.current = displayStream;
      screenSharingRef.current = true;
      setLocalCallStream(nextStream);
      setScreenSharing(true);
      setScreenShareError('');

      screenTrack.onended = () => {
        if (!screenShareStoppingRef.current) {
          void handleStopScreenShare();
        }
      };

      sendCallSignal({ eventType: 'SCREEN_SHARE_START', callId: currentCall.callId });
    } catch (error) {
      console.error('Failed to start screen sharing:', error);
      displayStream?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      screenShareStreamRef.current = null;
      screenShareCameraTrackRef.current = null;
      screenSharingRef.current = false;
      setScreenSharing(false);
      setScreenShareError(getScreenShareErrorMessage(error));
    }
  }, [handleStopScreenShare, sendCallSignal]);

  const handleAudioInputChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    void replaceLocalCallTrack('audio', event.target.value);
  }, [replaceLocalCallTrack]);

  const handleVideoInputChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    void replaceLocalCallTrack('video', event.target.value);
  }, [replaceLocalCallTrack]);

  const handleMinimizeActiveCall = useCallback(() => {
    const currentCall = activeCallRef.current;
    if (
      !currentCall ||
      currentCall.status === 'ending' ||
      (currentCall.direction === 'incoming' && currentCall.status === 'ringing')
    ) {
      return;
    }

    setCallMinimized(true);
  }, []);

  const handleRestoreActiveCall = useCallback(() => {
    setCallMinimized(false);
  }, []);

  const audioInputDevices = callDevices.filter((device) => device.kind === 'audioinput');
  const videoInputDevices = callDevices.filter((device) => device.kind === 'videoinput');
  const preCallCanStart = Boolean(
    preCallSetup &&
    preCallPreviewStream &&
    !preCallPreviewLoading &&
    !preCallSubmitting
  );

  useEffect(() => () => {
    stopPreCallPreview();
  }, [stopPreCallPreview]);

  return {
    activeCall,
    activeCallRef,
    callMinimized,
    callError,
    localCallStream,
    remoteCallStream,
    micMuted,
    cameraOff,
    screenSharing,
    remoteScreenSharing,
    screenShareError,
    callConnectionState,
    callElapsedSeconds,
    callDevicesLoading,
    callDeviceError,
    callPermissions,
    selectedAudioInputId,
    selectedVideoInputId,
    preCallSetup,
    preCallPreviewStream,
    preCallPreviewLoading,
    preCallError,
    preCallSubmitting,
    preCallPreviewVideoRef,
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
    audioInputDevices,
    videoInputDevices,
    preCallCanStart,
    refreshCallPermissions,
    stopPreCallPreview,
    stopCallMedia,
    sendActiveCallCloseSignal,
    handleCallSignal,
    openPreCallSetupForUser,
    handleStartCall,
    handleClosePreCallSetup,
    handlePreCallRetryPreview,
    handleConfirmStartCall,
    handlePreCallAudioInputChange,
    handlePreCallVideoInputChange,
    handlePreCallToggleMic,
    handlePreCallToggleCamera,
    handleToggleMic,
    handleToggleCamera,
    handleRetryActiveCall,
    handleAcceptCall,
    handleRejectCall,
    handleEndCall,
    handleStartScreenShare,
    handleStopScreenShare,
    handleAudioInputChange,
    handleVideoInputChange,
    handleMinimizeActiveCall,
    handleRestoreActiveCall,
  };
}

export default useCallFeature;
