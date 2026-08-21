import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ActiveCall } from '../types/chat.types';

type MutableRef<T> = { current: T };

export interface CallSessionLifecycleOptions {
  activeCall: ActiveCall | null;
  setCallMinimized: Dispatch<SetStateAction<boolean>>;
  localCallStream: MediaStream | null;
  remoteCallStream: MediaStream | null;
  preCallPreviewStream: MediaStream | null;
  micMuted: boolean;
  cameraOff: boolean;
  screenSharing: boolean;
  selectedAudioInputId: string;
  selectedVideoInputId: string;
  callStartedAt: number | null;
  setCallElapsedSeconds: Dispatch<SetStateAction<number>>;
  activeCallRef: MutableRef<ActiveCall | null>;
  localCallStreamRef: MutableRef<MediaStream | null>;
  preCallPreviewStreamRef: MutableRef<MediaStream | null>;
  micMutedRef: MutableRef<boolean>;
  cameraOffRef: MutableRef<boolean>;
  screenSharingRef: MutableRef<boolean>;
  selectedAudioInputIdRef: MutableRef<string>;
  selectedVideoInputIdRef: MutableRef<string>;
  remoteAudioRef: MutableRef<HTMLAudioElement | null>;
  remoteVideoRef: MutableRef<HTMLVideoElement | null>;
  localVideoRef: MutableRef<HTMLVideoElement | null>;
  preCallPreviewVideoRef: MutableRef<HTMLVideoElement | null>;
}

export function useCallSession({
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
}: CallSessionLifecycleOptions) {
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall, activeCallRef]);

  useEffect(() => {
    if (!activeCall || (activeCall.direction === 'incoming' && activeCall.status === 'ringing')) {
      setCallMinimized(false);
    }
  }, [activeCall, setCallMinimized]);

  useEffect(() => {
    localCallStreamRef.current = localCallStream;
  }, [localCallStream, localCallStreamRef]);

  useEffect(() => {
    preCallPreviewStreamRef.current = preCallPreviewStream;
  }, [preCallPreviewStream, preCallPreviewStreamRef]);

  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted, micMutedRef]);

  useEffect(() => {
    cameraOffRef.current = cameraOff;
  }, [cameraOff, cameraOffRef]);

  useEffect(() => {
    screenSharingRef.current = screenSharing;
  }, [screenSharing, screenSharingRef]);

  useEffect(() => {
    selectedAudioInputIdRef.current = selectedAudioInputId;
  }, [selectedAudioInputId, selectedAudioInputIdRef]);

  useEffect(() => {
    selectedVideoInputIdRef.current = selectedVideoInputId;
  }, [selectedVideoInputId, selectedVideoInputIdRef]);

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteCallStream;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteCallStream;
    }
  }, [remoteAudioRef, remoteCallStream, remoteVideoRef]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localCallStream;
    }
  }, [cameraOff, localCallStream, localVideoRef]);

  useEffect(() => {
    if (preCallPreviewVideoRef.current) {
      preCallPreviewVideoRef.current.srcObject = preCallPreviewStream;
    }
  }, [cameraOff, preCallPreviewStream, preCallPreviewVideoRef]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'connected' || callStartedAt === null) {
      setCallElapsedSeconds(0);
      return undefined;
    }

    const updateElapsedSeconds = () => {
      setCallElapsedSeconds(Math.floor((Date.now() - callStartedAt) / 1000));
    };

    updateElapsedSeconds();
    const intervalId = window.setInterval(updateElapsedSeconds, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeCall, callStartedAt, setCallElapsedSeconds]);
}
