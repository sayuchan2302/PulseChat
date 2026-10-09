import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CallSignalPayload } from '../types';
import type { ActiveCall } from '../types/chat.types';
import {
  canSendWebRtcSignalForCall,
  getScreenShareErrorMessage,
} from '../utils/callUtils';

type MutableRef<T> = { current: T };

interface Options {
  activeCallRef: MutableRef<ActiveCall | null>;
  localCallStreamRef: MutableRef<MediaStream | null>;
  peerConnectionRef: MutableRef<RTCPeerConnection | null>;
  screenSharingRef: MutableRef<boolean>;
  screenShareStreamRef: MutableRef<MediaStream | null>;
  screenShareCameraTrackRef: MutableRef<MediaStreamTrack | null>;
  screenShareStoppingRef: MutableRef<boolean>;
  cameraOffRef: MutableRef<boolean>;
  applySelectedDeviceIdsFromStream: (stream: MediaStream) => void;
  sendCallSignal: (payload: CallSignalPayload) => boolean;
  setLocalCallStream: Dispatch<SetStateAction<MediaStream | null>>;
  setScreenSharing: Dispatch<SetStateAction<boolean>>;
  setRemoteScreenSharing: Dispatch<SetStateAction<boolean>>;
  setScreenShareError: Dispatch<SetStateAction<string>>;
}

export function useCallScreenSharing({
  activeCallRef,
  localCallStreamRef,
  peerConnectionRef,
  screenSharingRef,
  screenShareStreamRef,
  screenShareCameraTrackRef,
  screenShareStoppingRef,
  cameraOffRef,
  applySelectedDeviceIdsFromStream,
  sendCallSignal,
  setLocalCallStream,
  setScreenSharing,
  setRemoteScreenSharing,
  setScreenShareError,
}: Options) {
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
  }, [
    localCallStreamRef,
    screenShareCameraTrackRef,
    screenShareStoppingRef,
    screenShareStreamRef,
    screenSharingRef,
    setRemoteScreenSharing,
    setScreenShareError,
    setScreenSharing,
  ]);

  const handleStopScreenShare = useCallback(async (notify = true) => {
    if (screenShareStoppingRef.current) return;

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
  }, [
    activeCallRef,
    applySelectedDeviceIdsFromStream,
    cameraOffRef,
    localCallStreamRef,
    peerConnectionRef,
    screenShareCameraTrackRef,
    screenShareStoppingRef,
    screenShareStreamRef,
    screenSharingRef,
    sendCallSignal,
    setLocalCallStream,
    setScreenShareError,
    setScreenSharing,
  ]);

  const handleStartScreenShare = useCallback(async () => {
    const currentCall = activeCallRef.current;
    const currentStream = localCallStreamRef.current;
    const peerConnection = peerConnectionRef.current;

    if (
      !currentCall?.callId ||
      currentCall.type !== 'VIDEO' ||
      !canSendWebRtcSignalForCall(currentCall, currentCall.callId)
    ) return;

    if (screenSharingRef.current || screenShareStoppingRef.current) return;

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
  }, [
    activeCallRef,
    handleStopScreenShare,
    localCallStreamRef,
    peerConnectionRef,
    screenShareCameraTrackRef,
    screenShareStoppingRef,
    screenShareStreamRef,
    screenSharingRef,
    sendCallSignal,
    setLocalCallStream,
    setScreenShareError,
    setScreenSharing,
  ]);

  return {
    stopScreenShareResources,
    handleStartScreenShare,
    handleStopScreenShare,
  };
}

export default useCallScreenSharing;
