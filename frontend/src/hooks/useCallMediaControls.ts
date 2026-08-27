import { useCallback } from 'react';
import type { ChangeEvent, Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { PreCallSetup } from '../types/chat.types';

interface Options {
  preCallSetup: PreCallSetup;
  selectedAudioInputId: string;
  selectedVideoInputId: string;
  micMuted: boolean;
  cameraOff: boolean;
  screenSharingRef: MutableRefObject<boolean>;
  micMutedRef: MutableRefObject<boolean>;
  cameraOffRef: MutableRefObject<boolean>;
  preCallPreviewStreamRef: MutableRefObject<MediaStream | null>;
  localCallStreamRef: MutableRefObject<MediaStream | null>;
  startPreCallPreview: (type: NonNullable<PreCallSetup>['type'], audioId?: string, videoId?: string) => Promise<MediaStream | null>;
  setSelectedAudioInputId: Dispatch<SetStateAction<string>>;
  setSelectedVideoInputId: Dispatch<SetStateAction<string>>;
  setMicMuted: Dispatch<SetStateAction<boolean>>;
  setCameraOff: Dispatch<SetStateAction<boolean>>;
}

export function useCallMediaControls(options: Options) {
  const { preCallSetup, selectedAudioInputId, selectedVideoInputId, micMuted, cameraOff, screenSharingRef, micMutedRef, cameraOffRef, preCallPreviewStreamRef, localCallStreamRef, startPreCallPreview, setSelectedAudioInputId, setSelectedVideoInputId, setMicMuted, setCameraOff } = options;
  const handlePreCallAudioInputChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => { const id = event.target.value; setSelectedAudioInputId(id); if (preCallSetup) void startPreCallPreview(preCallSetup.type, id, selectedVideoInputId); }, [preCallSetup, selectedVideoInputId, setSelectedAudioInputId, startPreCallPreview]);
  const handlePreCallVideoInputChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => { const id = event.target.value; setSelectedVideoInputId(id); if (preCallSetup) void startPreCallPreview(preCallSetup.type, selectedAudioInputId, id); }, [preCallSetup, selectedAudioInputId, setSelectedVideoInputId, startPreCallPreview]);
  const handlePreCallToggleMic = useCallback(() => { const muted = !micMutedRef.current; micMutedRef.current = muted; preCallPreviewStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; }); setMicMuted(muted); }, [micMutedRef, preCallPreviewStreamRef, setMicMuted]);
  const handlePreCallToggleCamera = useCallback(() => { const off = !cameraOffRef.current; cameraOffRef.current = off; preCallPreviewStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !off; }); setCameraOff(off); }, [cameraOffRef, preCallPreviewStreamRef, setCameraOff]);
  const handleToggleMic = useCallback(() => { const muted = !micMuted; localCallStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; }); setMicMuted(muted); }, [localCallStreamRef, micMuted, setMicMuted]);
  const handleToggleCamera = useCallback(() => { if (screenSharingRef.current) return; const off = !cameraOff; localCallStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !off; }); setCameraOff(off); }, [cameraOff, localCallStreamRef, screenSharingRef, setCameraOff]);
  return { handlePreCallAudioInputChange, handlePreCallVideoInputChange, handlePreCallToggleMic, handlePreCallToggleCamera, handleToggleMic, handleToggleCamera };
}

export default useCallMediaControls;
