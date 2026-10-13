import { useCallback } from 'react';
import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import type { ActiveCall } from '../types/chat.types';
import { stopMediaStream } from '../utils/callUtils';

type MutableRef<T> = { current: T };

interface Options {
  activeCallRef: MutableRef<ActiveCall | null>;
  peerConnectionRef: MutableRef<RTCPeerConnection | null>;
  localCallStreamRef: MutableRef<MediaStream | null>;
  screenSharingRef: MutableRef<boolean>;
  micMutedRef: MutableRef<boolean>;
  cameraOffRef: MutableRef<boolean>;
  loadCallDevices: () => Promise<void>;
  setCallDeviceError: Dispatch<SetStateAction<string>>;
  setLocalCallStream: Dispatch<SetStateAction<MediaStream | null>>;
  setSelectedAudioInputId: Dispatch<SetStateAction<string>>;
  setSelectedVideoInputId: Dispatch<SetStateAction<string>>;
}

export function useCallDeviceSwitching({
  activeCallRef,
  peerConnectionRef,
  localCallStreamRef,
  screenSharingRef,
  micMutedRef,
  cameraOffRef,
  loadCallDevices,
  setCallDeviceError,
  setLocalCallStream,
  setSelectedAudioInputId,
  setSelectedVideoInputId,
}: Options) {
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

    if (
      !currentCall ||
      currentCall.callId === undefined ||
      currentCall.status === 'ending' ||
      (kind === 'video' && currentCall.type !== 'VIDEO')
    ) {
      return;
    }

    const callId = currentCall.callId;
    const peerConnection = peerConnectionRef.current;
    if (!localCallStreamRef.current || !peerConnection) {
      return;
    }

    const isCurrentCall = () => {
      const activeCall = activeCallRef.current;
      return activeCall?.callId === callId &&
        activeCall.status !== 'ending' &&
        peerConnectionRef.current === peerConnection;
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      setCallDeviceError('Browser does not support media device switching.');
      return;
    }

    setCallDeviceError('');

    let replacementStream: MediaStream | null = null;
    let replacementTrack: MediaStreamTrack | null = null;
    let replacementCommitted = false;

    try {
      const constraints: MediaStreamConstraints =
        kind === 'audio'
          ? { audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false }
          : { audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : true };
      replacementStream = await navigator.mediaDevices.getUserMedia(constraints);
      [replacementTrack] = kind === 'audio'
        ? replacementStream.getAudioTracks()
        : replacementStream.getVideoTracks();

      if (!replacementTrack) {
        throw new Error(`No ${kind} track found for selected device.`);
      }

      if (!isCurrentCall() || (kind === 'video' && screenSharingRef.current)) {
        stopMediaStream(replacementStream);
        return;
      }

      replacementTrack.enabled = kind === 'audio'
        ? !micMutedRef.current
        : !cameraOffRef.current;

      const sender = peerConnection
        .getSenders()
        .find((candidate) => candidate.track?.kind === kind);
      if (!sender) {
        throw new Error(`${kind} sender is not ready.`);
      }

      await sender.replaceTrack(replacementTrack);

      if (!isCurrentCall()) {
        stopMediaStream(replacementStream);
        return;
      }

      if (kind === 'video' && screenSharingRef.current) {
        const activeVideoTrack = localCallStreamRef.current?.getVideoTracks()[0] ?? null;
        if (activeVideoTrack !== replacementTrack) {
          await sender.replaceTrack(activeVideoTrack);
        }
        stopMediaStream(replacementStream);
        return;
      }

      const currentStream = localCallStreamRef.current;
      if (!currentStream) {
        stopMediaStream(replacementStream);
        return;
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
      replacementCommitted = true;

      const nextDeviceId = replacementTrack.getSettings().deviceId || deviceId;
      if (kind === 'audio') {
        setSelectedAudioInputId(nextDeviceId);
      } else {
        setSelectedVideoInputId(nextDeviceId);
      }

      void loadCallDevices();
    } catch (error) {
      if (!replacementCommitted) {
        stopMediaStream(replacementStream);
      }
      if (!isCurrentCall()) {
        return;
      }
      console.error(`Failed to switch ${kind} device:`, error);
      setCallDeviceError(
        kind === 'audio' ? 'Unable to switch microphone.' : 'Unable to switch camera.'
      );
    }
  }, [
    activeCallRef,
    cameraOffRef,
    loadCallDevices,
    localCallStreamRef,
    micMutedRef,
    peerConnectionRef,
    screenSharingRef,
    setCallDeviceError,
    setLocalCallStream,
    setSelectedAudioInputId,
    setSelectedVideoInputId,
  ]);

  const handleAudioInputChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    void replaceLocalCallTrack('audio', event.target.value);
  }, [replaceLocalCallTrack]);

  const handleVideoInputChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    void replaceLocalCallTrack('video', event.target.value);
  }, [replaceLocalCallTrack]);

  return { replaceLocalCallTrack, handleAudioInputChange, handleVideoInputChange };
}

export default useCallDeviceSwitching;
