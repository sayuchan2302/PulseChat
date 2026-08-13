import { useEffect, useRef, useState } from 'react';
import type { CallState, ActiveCall } from '../hooks/useCallManager';
import './CallModal.css';

// ─── Icons ────────────────────────────────────────────────────────────────────

function PhoneIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24 11.4 11.4 0 003.56.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.4 11.4 0 00.57 3.56 1 1 0 01-.25 1.03l-2.2 2.2z" />
        </svg>
    );
}

function PhoneOffIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.68 13.31a16 16 0 003.01 3.01l2.2-2.2a1 1 0 011.02-.24 11.4 11.4 0 003.56.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.4 11.4 0 00.57 3.56 1 1 0 01-.25 1.03l-2.2 2.2z" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    );
}

function VideoIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M15 10l4.55-2.73A1 1 0 0121 8.18V15.82a1 1 0 01-1.45.91L15 14v-4zM3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
        </svg>
    );
}

function MicIcon({ muted }: { muted: boolean }) {
    return muted ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
            <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
    ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
    );
}

function CameraIcon({ off }: { off: boolean }) {
    return off ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v4.34l1 1L23 7v10" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
    );
}

function ScreenShareIcon({ active }: { active: boolean }) {
    return active ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
            <polyline points="8 10 12 6 16 10" />
            <line x1="12" y1="6" x2="12" y2="14" />
        </svg>
    ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
        </svg>
    );
}

// ─── User avatar helper ────────────────────────────────────────────────────────

function CallAvatar({ user }: { user: { fullName?: string; username: string; avatar?: string } }) {
    const initial = (user.fullName ?? user.username)[0]?.toUpperCase() ?? '?';
    return (
        <div className="call-avatar">
            {user.avatar ? (
                <img src={user.avatar} alt={user.fullName ?? user.username} />
            ) : (
                <span>{initial}</span>
            )}
        </div>
    );
}

// ─── Duration timer ───────────────────────────────────────────────────────────

function useCallTimer(startedAt?: number) {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (!startedAt) { setElapsed(0); return; }
        const id = setInterval(() => { setElapsed(Math.floor((Date.now() - startedAt) / 1000)); }, 1000);
        return () => clearInterval(id);
    }, [startedAt]);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CallModalProps {
    callState: CallState;
    activeCall: ActiveCall | null;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isMuted: boolean;
    isCameraOff: boolean;
    isSharingScreen: boolean;
    peerSharingScreen: boolean;
    onAnswer: () => void;
    onReject: () => void;
    onCancel: () => void;
    onEnd: () => void;
    onToggleMute: () => void;
    onToggleCamera: () => void;
    onToggleScreenShare: () => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CallModal(props: CallModalProps) {
    const {
        callState,
        activeCall,
        localStream,
        remoteStream,
        isMuted,
        isCameraOff,
        isSharingScreen,
        peerSharingScreen,
        onAnswer,
        onReject,
        onCancel,
        onEnd,
        onToggleMute,
        onToggleCamera,
        onToggleScreenShare,
    } = props;

    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const timer = useCallTimer(activeCall?.startedAt);
    const [isExpanded, setIsExpanded] = useState(true);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    // Reset expand on new call
    useEffect(() => {
        if (callState === 'active') setIsExpanded(true);
    }, [callState]);

    if (callState === 'idle' || !activeCall) return null;

    const isVideo = activeCall.callType === 'VIDEO';
    const remote = activeCall.remoteUser;
    const displayName = remote.fullName ?? remote.username;

    // ── Ringing (incoming) ────────────────────────────────────────────────────
    if (callState === 'ringing') {
        return (
            <div className="call-overlay" role="dialog" aria-modal="true" aria-label="Incoming call">
                <div className="call-modal call-modal-ringing">
                    <p className="call-modal-label">{isVideo ? 'Video call' : 'Voice call'}</p>
                    <CallAvatar user={remote} />
                    <h2 className="call-modal-name">{displayName}</h2>
                    <p className="call-modal-sub">Incoming call…</p>
                    <div className="call-modal-actions">
                        <button
                            type="button"
                            className="call-btn call-btn-reject"
                            onClick={onReject}
                            aria-label="Reject call"
                            title="Reject"
                        >
                            <PhoneOffIcon />
                        </button>
                        <button
                            type="button"
                            className="call-btn call-btn-accept"
                            onClick={onAnswer}
                            aria-label="Accept call"
                            title="Accept"
                        >
                            {isVideo ? <VideoIcon /> : <PhoneIcon />}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Calling (outgoing) ────────────────────────────────────────────────────
    if (callState === 'calling') {
        return (
            <div className="call-overlay" role="dialog" aria-modal="true" aria-label="Outgoing call">
                <div className="call-modal call-modal-calling">
                    <CallAvatar user={remote} />
                    <h2 className="call-modal-name">{displayName}</h2>
                    <p className="call-modal-sub calling-pulse">Calling…</p>
                    <div className="call-modal-actions">
                        <button
                            type="button"
                            className="call-btn call-btn-reject"
                            onClick={onCancel}
                            aria-label="Cancel call"
                            title="Cancel"
                        >
                            <PhoneOffIcon />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Active call ───────────────────────────────────────────────────────────
    if (callState === 'active') {
        // Minimized pill for audio call
        if (!isVideo || !isExpanded) {
            return (
                <div className={`call-pill ${isVideo ? 'call-pill-video' : ''}`} role="dialog" aria-label="Active call">
                    {isVideo && (
                        <button
                            type="button"
                            className="call-pill-expand"
                            onClick={() => setIsExpanded(true)}
                            aria-label="Expand video call"
                        >
                            ▲
                        </button>
                    )}
                    <CallAvatar user={remote} />
                    <div className="call-pill-info">
                        <span className="call-pill-name">{displayName}</span>
                        <span className="call-pill-timer">{timer}</span>
                    </div>
                    <button
                        type="button"
                        className={`call-pill-btn ${isMuted ? 'active' : ''}`}
                        onClick={onToggleMute}
                        aria-label={isMuted ? 'Unmute' : 'Mute'}
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        <MicIcon muted={isMuted} />
                    </button>
                    <button
                        type="button"
                        className="call-pill-btn call-pill-end"
                        onClick={onEnd}
                        aria-label="End call"
                        title="End call"
                    >
                        <PhoneOffIcon />
                    </button>
                </div>
            );
        }

        // Full video call
        return (
            <div className="call-overlay call-overlay-video" role="dialog" aria-modal="true" aria-label="Video call">
                {/* Remote video – fills screen */}
                <video
                    ref={remoteVideoRef}
                    className="call-video-remote"
                    autoPlay
                    playsInline
                />

                {/* Screen share indicator */}
                {peerSharingScreen && (
                    <div className="call-share-indicator">
                        <ScreenShareIcon active={true} />
                        <span>{displayName} is sharing their screen</span>
                    </div>
                )}

                {/* Local preview PiP */}
                <video
                    ref={localVideoRef}
                    className="call-video-local"
                    autoPlay
                    playsInline
                    muted
                />

                {/* Header */}
                <div className="call-header-bar">
                    <CallAvatar user={remote} />
                    <div>
                        <div className="call-modal-name small">{displayName}</div>
                        <div className="call-pill-timer">{timer}</div>
                    </div>
                    <button
                        type="button"
                        className="call-pill-expand"
                        onClick={() => setIsExpanded(false)}
                        aria-label="Minimize call"
                        title="Minimize"
                    >
                        ▼
                    </button>
                </div>

                {/* Controls toolbar */}
                <div className="call-toolbar">
                    <button
                        type="button"
                        className={`call-ctrl-btn ${isMuted ? 'call-ctrl-active' : ''}`}
                        onClick={onToggleMute}
                        aria-label={isMuted ? 'Unmute' : 'Mute'}
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        <MicIcon muted={isMuted} />
                        <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                    </button>

                    <button
                        type="button"
                        className={`call-ctrl-btn ${isCameraOff ? 'call-ctrl-active' : ''}`}
                        onClick={onToggleCamera}
                        aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                        title={isCameraOff ? 'Camera on' : 'Camera off'}
                    >
                        <CameraIcon off={isCameraOff} />
                        <span>{isCameraOff ? 'Cam on' : 'Cam off'}</span>
                    </button>

                    <button
                        type="button"
                        className={`call-ctrl-btn ${isSharingScreen ? 'call-ctrl-sharing' : ''}`}
                        onClick={() => void onToggleScreenShare()}
                        aria-label={isSharingScreen ? 'Stop sharing screen' : 'Share screen'}
                        title={isSharingScreen ? 'Stop sharing' : 'Share screen'}
                    >
                        <ScreenShareIcon active={isSharingScreen} />
                        <span>{isSharingScreen ? 'Stop share' : 'Share screen'}</span>
                    </button>

                    <button
                        type="button"
                        className="call-ctrl-btn call-ctrl-end"
                        onClick={onEnd}
                        aria-label="End call"
                        title="End call"
                    >
                        <PhoneOffIcon />
                        <span>End</span>
                    </button>
                </div>
            </div>
        );
    }

    return null;
}
