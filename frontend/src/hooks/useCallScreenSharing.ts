import { useCallback, useRef } from 'react';
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
  const screenShareOperationRef = useRef(0);
  const screenShareStartingRef = useRef(false);

  const stopScreenShareResources = useCallback(() => {
    screenShareOperationRef.current += 1;
    screenShareStartingRef.current = false;
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

    if (!screenSharingRef.current && !screenShareStreamRef.current) {
      // Also cancels a pending getDisplayMedia prompt when the call is ending.
      screenShareOperationRef.current += 1;
      screenShareStartingRef.current = false;
      return;
    }

    const operationId = ++screenShareOperationRef.current;
    screenShareStartingRef.current = false;
    screenShareStoppingRef.current = true;
    const currentCall = activeCallRef.current;
    const callId = currentCall?.callId;
    const currentStream = localCallStreamRef.current;
    const peerConnection = peerConnectionRef.current;
    const screenShareStream = screenShareStreamRef.current;
    const cameraTrack = screenShareCameraTrackRef.current;
    const isCurrentStop = () => {
      const activeCall = activeCallRef.current;
      return screenShareOperationRef.current === operationId &&
        callId !== undefined &&
        activeCall?.callId === callId &&
        activeCall.status !== 'ending' &&
        localCallStreamRef.current === currentStream &&
        peerConnectionRef.current === peerConnection;
    };

    try {
      if (cameraTrack) {
        cameraTrack.enabled = !cameraOffRef.current;
      }

      const sender = peerConnection
        ?.getSenders()
        .find((candidate) => candidate.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(cameraTrack ?? null);
      }

      if (!isCurrentStop()) return;

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
      if (screenShareStreamRef.current === screenShareStream) {
        screenShareStreamRef.current = null;
      }
      if (screenShareCameraTrackRef.current === cameraTrack) {
        screenShareCameraTrackRef.current = null;
      }
      screenSharingRef.current = false;
      setScreenSharing(false);
      setScreenShareError('');

      if (
        notify &&
        callId !== undefined &&
        currentCall?.callId === callId &&
        canSendWebRtcSignalForCall(currentCall, callId)
      ) {
        sendCallSignal({ eventType: 'SCREEN_SHARE_STOP', callId });
      }
    } catch (error) {
      if (!isCurrentStop()) return;
      console.error('Failed to stop screen sharing:', error);
      setScreenShareError('Unable to stop screen sharing.');
    } finally {
      if (screenShareOperationRef.current === operationId) {
        screenShareStoppingRef.current = false;
      }
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

    if (
      screenSharingRef.current ||
      screenShareStoppingRef.current ||
      screenShareStartingRef.current
    ) return;

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenShareError('Browser does not support screen sharing.');
      return;
    }

    if (!currentStream || !peerConnection) {
      setScreenShareError('Call video is not ready.');
      return;
    }

    setScreenShareError('');
    const callId = currentCall.callId;
    const operationId = ++screenShareOperationRef.current;
    screenShareStartingRef.current = true;
    const isCurrentStart = () => {
      const activeCall = activeCallRef.current;
      return screenShareOperationRef.current === operationId &&
        activeCall?.callId === callId &&
        activeCall.status !== 'ending' &&
        localCallStreamRef.current === currentStream &&
        peerConnectionRef.current === peerConnection;
    };
    let displayStream: MediaStream | null = null;

    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (!isCurrentStart()) {
        displayStream.getTracks().forEach((track) => track.stop());
        return;
      }

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
      await sender.replaceTrack(screenTrack);
      if (!isCurrentStart()) {
        const activeCallAfterReplace = activeCallRef.current;
        if (
          peerConnectionRef.current === peerConnection &&
          activeCallAfterReplace?.callId === callId &&
          activeCallAfterReplace.status !== 'ending'
        ) {
          const activeVideoTrack = localCallStreamRef.current?.getVideoTracks()[0] ?? null;
          if (activeVideoTrack !== screenTrack) {
            try {
              await sender.replaceTrack(activeVideoTrack);
            } catch (error) {
              console.error('Failed to restore video after canceled screen share:', error);
            }
          }
        }
        displayStream.getTracks().forEach((track) => track.stop());
        return;
      }

      screenShareCameraTrackRef.current = cameraTrack ?? null;
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
      screenShareStartingRef.current = false;

      screenTrack.onended = () => {
        if (
          screenShareStreamRef.current === displayStream &&
          screenShareOperationRef.current === operationId &&
          !screenShareStoppingRef.current
        ) {
          void handleStopScreenShare();
        }
      };

      sendCallSignal({ eventType: 'SCREEN_SHARE_START', callId });
    } catch (error) {
      displayStream?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      if (isCurrentStart()) {
        console.error('Failed to start screen sharing:', error);
        screenShareStreamRef.current = null;
        screenShareCameraTrackRef.current = null;
        screenSharingRef.current = false;
        setScreenSharing(false);
        setScreenShareError(getScreenShareErrorMessage(error));
      }
    } finally {
      if (screenShareOperationRef.current === operationId) {
        screenShareStartingRef.current = false;
      }
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
