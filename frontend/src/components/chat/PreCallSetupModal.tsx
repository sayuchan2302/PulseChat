import type { ChangeEvent, ReactNode, RefObject } from 'react';
import { MicIcon, MicOffIcon, VideoCallIcon, VideoOffIcon } from '../../icons/ChatIcons';
import type { CallType, PreCallSetup, User } from '../../types/chat.types';
import { getUserDisplayName } from '../../utils/userUtils';

export interface PreCallSetupModalProps {
  preCallSetup: PreCallSetup;
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
  callDevicesLoading: boolean;
  callDeviceError: string;
  getMediaDeviceLabel: (device: MediaDeviceInfo, index: number) => string;
  renderUserAvatar: (user: User | null, className?: string) => ReactNode;
  renderCallPermissionStatus: (callType: CallType) => ReactNode;
  onClose: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onAudioInputChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onVideoInputChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onRetryPreview: () => void;
  onStart: () => Promise<void>;
}

export function PreCallSetupModal({
  preCallSetup,
  previewStream,
  previewVideoRef,
  previewLoading,
  submitting,
  canStart,
  error,
  micMuted,
  cameraOff,
  audioInputDevices,
  videoInputDevices,
  selectedAudioInputId,
  selectedVideoInputId,
  callDevicesLoading,
  callDeviceError,
  getMediaDeviceLabel,
  renderUserAvatar,
  renderCallPermissionStatus,
  onClose,
  onToggleMic,
  onToggleCamera,
  onAudioInputChange,
  onVideoInputChange,
  onRetryPreview,
  onStart,
}: PreCallSetupModalProps) {
  if (!preCallSetup) {
    return null;
  }

  const isVideo = preCallSetup.type === 'VIDEO';
  const peerName = getUserDisplayName(preCallSetup.target);
  const hasSelectedAudioDevice = audioInputDevices.some((device) => device.deviceId === selectedAudioInputId);
  const hasSelectedVideoDevice = videoInputDevices.some((device) => device.deviceId === selectedVideoInputId);

  return (
    <div className="modal-backdrop pre-call-backdrop" onClick={onClose}>
      <div
        className="pre-call-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pre-call-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pre-call-header">
          <div>
            <h3 id="pre-call-title">{isVideo ? 'Video' : 'Audio'} call</h3>
            <p>{peerName}</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close call setup" disabled={submitting}>
            ×
          </button>
        </div>

        <div className="pre-call-preview">
          {previewLoading ? (
            <div className="pre-call-preview-placeholder">
              {renderUserAvatar(preCallSetup.target, 'user-avatar pre-call-avatar')}
              <span>Checking devices...</span>
            </div>
          ) : isVideo && previewStream && !cameraOff ? (
            <video ref={previewVideoRef} className="pre-call-video-preview" autoPlay muted playsInline />
          ) : (
            <div className="pre-call-preview-placeholder">
              {isVideo && cameraOff ? (
                <span className="pre-call-camera-off"><VideoOffIcon className="call-action-icon" /></span>
              ) : (
                renderUserAvatar(preCallSetup.target, 'user-avatar pre-call-avatar')
              )}
              <span>{isVideo && cameraOff ? 'Camera is off' : 'Ready to call'}</span>
            </div>
          )}
        </div>

        {renderCallPermissionStatus(preCallSetup.type)}

        <div className="pre-call-quick-actions" aria-label="Call setup controls">
          <button
            type="button"
            className={`call-round-btn ${micMuted ? 'active' : ''}`}
            onClick={onToggleMic}
            disabled={previewLoading || submitting}
            aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            title={micMuted ? 'Unmute' : 'Mute'}
          >
            {micMuted ? <MicOffIcon className="call-action-icon" /> : <MicIcon className="call-action-icon" />}
          </button>
          {isVideo ? (
            <button
              type="button"
              className={`call-round-btn ${cameraOff ? 'active' : ''}`}
              onClick={onToggleCamera}
              disabled={previewLoading || submitting}
              aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
              title={cameraOff ? 'Camera on' : 'Camera off'}
            >
              {cameraOff ? <VideoOffIcon className="call-action-icon" /> : <VideoCallIcon className="call-action-icon" />}
            </button>
          ) : null}
        </div>

        <div className="call-device-controls pre-call-device-controls" aria-label="Pre-call devices">
          <label className="call-device-field">
            <span>Mic</span>
            <select
              className="call-device-select"
              value={selectedAudioInputId}
              onChange={onAudioInputChange}
              disabled={previewLoading || submitting}
            >
              <option value="">Default microphone</option>
              {selectedAudioInputId && !hasSelectedAudioDevice ? <option value={selectedAudioInputId}>Selected microphone</option> : null}
              {audioInputDevices.map((device, index) => (
                <option key={device.deviceId || `pre-audio-${index}`} value={device.deviceId}>{getMediaDeviceLabel(device, index)}</option>
              ))}
            </select>
          </label>
          {isVideo ? (
            <label className="call-device-field">
              <span>Camera</span>
              <select
                className="call-device-select"
                value={selectedVideoInputId}
                onChange={onVideoInputChange}
                disabled={previewLoading || submitting}
              >
                <option value="">Default camera</option>
                {selectedVideoInputId && !hasSelectedVideoDevice ? <option value={selectedVideoInputId}>Selected camera</option> : null}
                {videoInputDevices.map((device, index) => (
                  <option key={device.deviceId || `pre-video-${index}`} value={device.deviceId}>{getMediaDeviceLabel(device, index)}</option>
                ))}
              </select>
            </label>
          ) : null}
          {callDevicesLoading ? <span className="call-device-helper">Refreshing device list...</span> : null}
          {callDeviceError ? <span className="call-device-error">{callDeviceError}</span> : null}
        </div>

        {error ? (
          <div className="pre-call-error">
            <span>{error}</span>
            <button type="button" onClick={onRetryPreview}>Retry</button>
          </div>
        ) : null}

        <div className="pre-call-actions">
          <button type="button" className="secondary-btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="button" className="send-btn" onClick={() => void onStart()} disabled={!canStart}>
            {submitting ? 'Calling...' : 'Start call'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PreCallSetupModal;
