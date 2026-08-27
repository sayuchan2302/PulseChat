import { lazy, Suspense, type ChangeEvent, type RefObject } from 'react';
import type {
  ActiveCall,
  CallConnectionState,
  CallPermissionSnapshot,
  CallType,
  PreCallSetup,
} from '../../types/chat.types';
import { formatCallTimer, getMediaDeviceLabel } from '../../utils/formatUtils';
import { getCallPermissionLabel } from '../../utils/callUtils';
import { renderUserAvatar } from '../../utils/renderUtils';

const ActiveCallOverlay = lazy(() => import('./ActiveCallOverlay'));
const PreCallSetupModal = lazy(() => import('./PreCallSetupModal'));

interface CallModalLayerProps {
  callPermissions: CallPermissionSnapshot;
  onRefreshCallPermissions: (callType: CallType) => Promise<void>;
  preCall: {
    setup: PreCallSetup;
    previewStream: MediaStream | null;
    previewVideoRef: RefObject<HTMLVideoElement | null>;
    previewLoading: boolean;
    submitting: boolean;
    canStart: boolean;
    error: string;
    micMuted: boolean;
    cameraOff: boolean;
    audioInputDevices: MediaDeviceInfo[];
    videoInputDevices: MediaDeviceInfo[];
    selectedAudioInputId: string;
    selectedVideoInputId: string;
    devicesLoading: boolean;
    deviceError: string;
    onClose: () => void;
    onToggleMic: () => void;
    onToggleCamera: () => void;
    onAudioInputChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    onVideoInputChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    onRetryPreview: () => void;
    onStart: () => Promise<void>;
  };
  active: {
    call: ActiveCall | null;
    minimized: boolean;
    connectionState: CallConnectionState;
    elapsedSeconds: number;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    remoteAudioRef: RefObject<HTMLAudioElement | null>;
    remoteVideoRef: RefObject<HTMLVideoElement | null>;
    localVideoRef: RefObject<HTMLVideoElement | null>;
    isConversationOpen: boolean;
    micMuted: boolean;
    cameraOff: boolean;
    screenSharing: boolean;
    remoteScreenSharing: boolean;
    screenShareError: string;
    error: string;
    audioInputDevices: MediaDeviceInfo[];
    videoInputDevices: MediaDeviceInfo[];
    selectedAudioInputId: string;
    selectedVideoInputId: string;
    devicesLoading: boolean;
    deviceError: string;
    onRestore: () => void;
    onMinimize: () => void;
    onOpenConversation: () => void;
    onToggleMic: () => void;
    onToggleCamera: () => void;
    onStartScreenShare: () => Promise<void>;
    onStopScreenShare: () => Promise<void>;
    onEnd: () => void;
    onAccept: () => void;
    onReject: () => void;
    onRetry: () => void;
    onAudioInputChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    onVideoInputChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  };
}

export default function CallModalLayer({
  callPermissions,
  onRefreshCallPermissions,
  preCall,
  active,
}: CallModalLayerProps) {
  const renderCallPermissionStatus = (callType: CallType) => {
    const permissionItems = [
      { key: 'microphone', label: 'Mic', status: callPermissions.microphone },
      ...(callType === 'VIDEO'
        ? [{ key: 'camera', label: 'Camera', status: callPermissions.camera }]
        : []),
    ];

    return (
      <div className="call-permission-row" aria-label="Call permissions">
        {permissionItems.map((item) => (
          <span
            key={item.key}
            className={`call-permission-pill ${item.status}`}
            title={`${item.label}: ${getCallPermissionLabel(item.status)}`}
          >
            <span>{item.label}</span>
            <strong>{getCallPermissionLabel(item.status)}</strong>
          </span>
        ))}
        <button
          type="button"
          className="call-permission-refresh"
          onClick={() => void onRefreshCallPermissions(callType)}
        >
          Refresh
        </button>
      </div>
    );
  };

  return (
    <>
      <Suspense fallback={null}>
        <PreCallSetupModal
          preCallSetup={preCall.setup}
          previewStream={preCall.previewStream}
          previewVideoRef={preCall.previewVideoRef}
          previewLoading={preCall.previewLoading}
          submitting={preCall.submitting}
          canStart={preCall.canStart}
          error={preCall.error}
          micMuted={preCall.micMuted}
          cameraOff={preCall.cameraOff}
          audioInputDevices={preCall.audioInputDevices}
          videoInputDevices={preCall.videoInputDevices}
          selectedAudioInputId={preCall.selectedAudioInputId}
          selectedVideoInputId={preCall.selectedVideoInputId}
          callDevicesLoading={preCall.devicesLoading}
          callDeviceError={preCall.deviceError}
          getMediaDeviceLabel={getMediaDeviceLabel}
          renderUserAvatar={renderUserAvatar}
          renderCallPermissionStatus={renderCallPermissionStatus}
          onClose={preCall.onClose}
          onToggleMic={preCall.onToggleMic}
          onToggleCamera={preCall.onToggleCamera}
          onAudioInputChange={preCall.onAudioInputChange}
          onVideoInputChange={preCall.onVideoInputChange}
          onRetryPreview={preCall.onRetryPreview}
          onStart={preCall.onStart}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ActiveCallOverlay
          activeCall={active.call}
          callMinimized={active.minimized}
          callConnectionState={active.connectionState}
          callElapsedSeconds={active.elapsedSeconds}
          localCallStream={active.localStream}
          remoteCallStream={active.remoteStream}
          remoteAudioRef={active.remoteAudioRef}
          remoteVideoRef={active.remoteVideoRef}
          localVideoRef={active.localVideoRef}
          isConversationOpen={active.isConversationOpen}
          micMuted={active.micMuted}
          cameraOff={active.cameraOff}
          screenSharing={active.screenSharing}
          remoteScreenSharing={active.remoteScreenSharing}
          screenShareError={active.screenShareError}
          callError={active.error}
          audioInputDevices={active.audioInputDevices}
          videoInputDevices={active.videoInputDevices}
          selectedAudioInputId={active.selectedAudioInputId}
          selectedVideoInputId={active.selectedVideoInputId}
          callDevicesLoading={active.devicesLoading}
          callDeviceError={active.deviceError}
          formatCallTimer={formatCallTimer}
          getMediaDeviceLabel={getMediaDeviceLabel}
          renderUserAvatar={renderUserAvatar}
          renderCallPermissionStatus={renderCallPermissionStatus}
          onRestore={active.onRestore}
          onMinimize={active.onMinimize}
          onOpenConversation={active.onOpenConversation}
          onToggleMic={active.onToggleMic}
          onToggleCamera={active.onToggleCamera}
          onStartScreenShare={active.onStartScreenShare}
          onStopScreenShare={active.onStopScreenShare}
          onEnd={active.onEnd}
          onAccept={active.onAccept}
          onReject={active.onReject}
          onRetry={active.onRetry}
          onAudioInputChange={active.onAudioInputChange}
          onVideoInputChange={active.onVideoInputChange}
        />
      </Suspense>
    </>
  );
}
