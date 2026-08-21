import type { ChangeEvent, ReactNode, RefObject } from 'react';
import {
  CloseIcon,
  ExpandIcon,
  JumpIcon,
  MicIcon,
  MicOffIcon,
  MinimizeIcon,
  PhoneIcon,
  ScreenShareIcon,
  VideoCallIcon,
  VideoOffIcon,
} from '../../icons/ChatIcons';
import type { ActiveCall, CallConnectionState, CallType, User } from '../../types/chat.types';
import { getUserDisplayName } from '../../utils/userUtils';

export interface ActiveCallOverlayProps {
  activeCall: ActiveCall | null;
  callMinimized: boolean;
  callConnectionState: CallConnectionState;
  callElapsedSeconds: number;
  localCallStream: MediaStream | null;
  remoteCallStream: MediaStream | null;
  remoteAudioRef: RefObject<HTMLAudioElement | null>;
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  isConversationOpen: boolean;
  micMuted: boolean;
  cameraOff: boolean;
  screenSharing: boolean;
  remoteScreenSharing: boolean;
  screenShareError: string;
  callError: string;
  audioInputDevices: MediaDeviceInfo[];
  videoInputDevices: MediaDeviceInfo[];
  selectedAudioInputId: string;
  selectedVideoInputId: string;
  callDevicesLoading: boolean;
  callDeviceError: string;
  formatCallTimer: (seconds: number) => string;
  getMediaDeviceLabel: (device: MediaDeviceInfo, index: number) => string;
  renderUserAvatar: (user: User | null, className?: string) => ReactNode;
  renderCallPermissionStatus: (callType: CallType) => ReactNode;
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
}

export function ActiveCallOverlay({
  activeCall,
  callMinimized,
  callConnectionState,
  callElapsedSeconds,
  localCallStream,
  remoteCallStream,
  remoteAudioRef,
  remoteVideoRef,
  localVideoRef,
  isConversationOpen,
  micMuted,
  cameraOff,
  screenSharing,
  remoteScreenSharing,
  screenShareError,
  callError,
  audioInputDevices,
  videoInputDevices,
  selectedAudioInputId,
  selectedVideoInputId,
  callDevicesLoading,
  callDeviceError,
  formatCallTimer,
  getMediaDeviceLabel,
  renderUserAvatar,
  renderCallPermissionStatus,
  onRestore,
  onMinimize,
  onOpenConversation,
  onToggleMic,
  onToggleCamera,
  onStartScreenShare,
  onStopScreenShare,
  onEnd,
  onAccept,
  onReject,
  onRetry,
  onAudioInputChange,
  onVideoInputChange,
}: ActiveCallOverlayProps) {
  if (!activeCall) {
    return null;
  }

  const peerName = getUserDisplayName(activeCall.peer);
  const isVideo = activeCall.type === 'VIDEO';
  const timerLabel = activeCall.status === 'connected' ? formatCallTimer(callElapsedSeconds) : '';
  const isIncomingRinging = activeCall.direction === 'incoming' && activeCall.status === 'ringing';
  const isOutgoingRinging = activeCall.direction === 'outgoing' && activeCall.status === 'ringing';
  const hasSelectedAudioDevice = audioInputDevices.some((device) => device.deviceId === selectedAudioInputId);
  const hasSelectedVideoDevice = videoInputDevices.some((device) => device.deviceId === selectedVideoInputId);
  const canShowDeviceControls = Boolean(
    localCallStream && activeCall.status !== 'ringing' && activeCall.status !== 'ending',
  );
  const canRetry = Boolean(
    !isIncomingRinging &&
    activeCall.status !== 'ending' &&
    (callConnectionState === 'failed' || callConnectionState === 'closed'),
  );
  const canToggleScreenShare = Boolean(
    isVideo &&
    !isIncomingRinging &&
    activeCall.status !== 'ringing' &&
    activeCall.status !== 'ending' &&
    localCallStream &&
    callConnectionState !== 'failed' &&
    callConnectionState !== 'closed',
  );
  const screenShareLabel = screenSharing
    ? 'You are sharing your screen'
    : remoteScreenSharing
      ? `${peerName} is sharing screen`
      : '';
  const screenShareButtonTitle = screenSharing ? 'Stop sharing screen' : 'Share screen';
  const statusLabel = isIncomingRinging
    ? `Incoming ${isVideo ? 'video' : 'audio'} call`
    : isOutgoingRinging
      ? 'Ringing...'
      : callConnectionState === 'reconnecting'
        ? 'Reconnecting...'
        : callConnectionState === 'failed'
          ? 'Connection failed'
          : activeCall.status === 'connected'
            ? `Connected${timerLabel ? ` · ${timerLabel}` : ''}`
            : activeCall.status === 'ending'
              ? 'Ending call'
              : 'Connecting...';
  const canMinimize = !isIncomingRinging && activeCall.status !== 'ending';
  const className = `call-overlay ${callMinimized ? 'minimized' : ''}`;
  const cameraButtonTitle = screenSharing
    ? 'Stop sharing screen before changing camera'
    : cameraOff
      ? 'Camera on'
      : 'Camera off';

  const handleScreenShare = () => {
    void (screenSharing ? onStopScreenShare() : onStartScreenShare());
  };

  if (callMinimized && canMinimize) {
    return (
      <div className={className}>
        <audio ref={remoteAudioRef} autoPlay playsInline />
        <div
          className={`call-mini ${isVideo ? 'video' : 'audio'} ${activeCall.status} ${callConnectionState}`}
          role="region"
          aria-label="Minimized active call"
        >
          <button
            type="button"
            className="call-mini-main"
            onClick={onRestore}
            aria-label={`Restore call with ${peerName}`}
          >
            {renderUserAvatar(activeCall.peer, 'user-avatar call-mini-avatar')}
            <span className="call-mini-copy">
              <strong>{peerName}</strong>
              <span>
                <span className={`call-status-dot ${callConnectionState}`} aria-hidden="true" />
                {statusLabel}
              </span>
              {screenShareLabel ? (
                <span className="call-mini-sharing">
                  <ScreenShareIcon className="call-mini-share-icon" />
                  {screenShareLabel}
                </span>
              ) : null}
            </span>
          </button>

          <div className="call-mini-actions" aria-label="Minimized call controls">
            {!isConversationOpen ? (
              <button type="button" className="call-mini-btn" onClick={onOpenConversation} aria-label="Open active call chat" title="Open chat">
                <JumpIcon className="call-action-icon" />
              </button>
            ) : null}
            <button
              type="button"
              className={`call-mini-btn ${micMuted ? 'active' : ''}`}
              onClick={onToggleMic}
              disabled={!localCallStream}
              aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
              title={micMuted ? 'Unmute' : 'Mute'}
            >
              {micMuted ? <MicOffIcon className="call-action-icon" /> : <MicIcon className="call-action-icon" />}
            </button>
            {isVideo ? (
              <button
                type="button"
                className={`call-mini-btn sharing ${screenSharing ? 'active' : ''}`}
                onClick={handleScreenShare}
                disabled={!screenSharing && !canToggleScreenShare}
                aria-label={screenShareButtonTitle}
                title={screenShareButtonTitle}
              >
                <ScreenShareIcon className="call-action-icon" />
              </button>
            ) : null}
            {isVideo ? (
              <button
                type="button"
                className={`call-mini-btn ${cameraOff ? 'active' : ''}`}
                onClick={onToggleCamera}
                disabled={!localCallStream || screenSharing}
                aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                title={cameraButtonTitle}
              >
                {cameraOff ? <VideoOffIcon className="call-action-icon" /> : <VideoCallIcon className="call-action-icon" />}
              </button>
            ) : null}
            <button type="button" className="call-mini-btn" onClick={onRestore} aria-label="Expand active call" title="Expand call">
              <ExpandIcon className="call-action-icon" />
            </button>
            <button type="button" className="call-mini-btn end" onClick={onEnd} aria-label="End call" title="End call">
              <PhoneIcon className="call-action-icon" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className} role="dialog" aria-modal="false" aria-label="Active call">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <div className={`call-card ${isVideo ? 'video' : 'audio'} ${activeCall.direction} ${activeCall.status} ${callConnectionState}`}>
        <div className="call-header-row">
          <div className="call-identity">
            {renderUserAvatar(activeCall.peer, 'user-avatar call-avatar')}
            <div>
              <strong>{peerName}</strong>
              <span className="call-status-row">
                <span className={`call-status-dot ${callConnectionState}`} aria-hidden="true" />
                {statusLabel}
              </span>
              <span className="call-type-chip">{isVideo ? 'Video call' : 'Audio call'}</span>
            </div>
          </div>
          <div className="call-header-actions">
            {!isConversationOpen ? <button type="button" className="call-open-chat-btn" onClick={onOpenConversation}>Open chat</button> : null}
            {canMinimize ? (
              <button type="button" className="call-header-icon-btn" onClick={onMinimize} aria-label="Minimize active call" title="Minimize">
                <MinimizeIcon className="call-action-icon" />
              </button>
            ) : null}
          </div>
        </div>

        {isVideo && activeCall.status !== 'ringing' ? (
          <div className="call-video-stage">
            {remoteCallStream ? (
              <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline />
            ) : (
              <div className="call-video-placeholder">
                {renderUserAvatar(activeCall.peer, 'user-avatar call-video-avatar')}
                <span>Waiting for video...</span>
              </div>
            )}
            {localCallStream ? (
              cameraOff && !screenSharing ? (
                <div className="call-local-video-placeholder" title="Camera is off">
                  <VideoOffIcon className="call-action-icon" />
                </div>
              ) : (
                <video ref={localVideoRef} className={`call-local-video ${screenSharing ? 'screen' : ''}`} autoPlay muted playsInline />
              )
            ) : null}
            {screenShareLabel ? (
              <div className="call-share-indicator">
                <ScreenShareIcon className="call-share-indicator-icon" />
                <span>{screenShareLabel}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={`call-audio-stage ${activeCall.status}`}>
            <div className="call-audio-avatar-shell">{renderUserAvatar(activeCall.peer, 'user-avatar call-stage-avatar')}</div>
            {timerLabel ? <span>{timerLabel}</span> : null}
          </div>
        )}

        {callError ? (
          <div className="call-error">
            <span>{callError}</span>
            {canRetry ? <button type="button" onClick={onRetry}>Retry</button> : null}
          </div>
        ) : null}
        {screenShareError ? <div className="call-error call-share-error"><span>{screenShareError}</span></div> : null}

        {canShowDeviceControls ? (
          <div className="call-device-controls" aria-label="Call devices">
            {renderCallPermissionStatus(activeCall.type)}
            <label className="call-device-field">
              <span>Mic</span>
              <select className="call-device-select" value={selectedAudioInputId} onChange={onAudioInputChange} disabled={callDevicesLoading}>
                <option value="">Default microphone</option>
                {selectedAudioInputId && !hasSelectedAudioDevice ? <option value={selectedAudioInputId}>Selected microphone</option> : null}
                {audioInputDevices.map((device, index) => (
                  <option key={device.deviceId || `audio-${index}`} value={device.deviceId}>{getMediaDeviceLabel(device, index)}</option>
                ))}
              </select>
            </label>
            {isVideo ? (
              <label className="call-device-field">
                <span>Camera</span>
                <select className="call-device-select" value={selectedVideoInputId} onChange={onVideoInputChange} disabled={callDevicesLoading || screenSharing}>
                  <option value="">Default camera</option>
                  {selectedVideoInputId && !hasSelectedVideoDevice ? <option value={selectedVideoInputId}>Selected camera</option> : null}
                  {videoInputDevices.map((device, index) => (
                    <option key={device.deviceId || `video-${index}`} value={device.deviceId}>{getMediaDeviceLabel(device, index)}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {callDevicesLoading ? <span className="call-device-helper">Loading devices...</span> : null}
            {callDeviceError ? <span className="call-device-error">{callDeviceError}</span> : null}
          </div>
        ) : null}

        <div className="call-actions">
          {isIncomingRinging ? (
            <>
              <button type="button" className="call-action-btn accept" onClick={onAccept}><PhoneIcon className="call-action-icon" /><span>Accept</span></button>
              <button type="button" className="call-action-btn end" onClick={onReject}><CloseIcon className="call-action-icon" /><span>Decline</span></button>
            </>
          ) : (
            <>
              <button type="button" className={`call-round-btn ${micMuted ? 'active' : ''}`} onClick={onToggleMic} disabled={!localCallStream} aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'} title={micMuted ? 'Unmute' : 'Mute'}>
                {micMuted ? <MicOffIcon className="call-action-icon" /> : <MicIcon className="call-action-icon" />}
              </button>
              {isVideo ? (
                <>
                  <button type="button" className={`call-round-btn sharing ${screenSharing ? 'active' : ''}`} onClick={handleScreenShare} disabled={!screenSharing && !canToggleScreenShare} aria-label={screenShareButtonTitle} title={screenShareButtonTitle}>
                    <ScreenShareIcon className="call-action-icon" />
                  </button>
                  <button type="button" className={`call-round-btn ${cameraOff ? 'active' : ''}`} onClick={onToggleCamera} disabled={!localCallStream || screenSharing} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'} title={cameraButtonTitle}>
                    {cameraOff ? <VideoOffIcon className="call-action-icon" /> : <VideoCallIcon className="call-action-icon" />}
                  </button>
                </>
              ) : null}
              <button type="button" className="call-round-btn end" onClick={onEnd} aria-label="End call" title="End call"><PhoneIcon className="call-action-icon" /></button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ActiveCallOverlay;
