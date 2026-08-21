/**
 * WebRTC / call / browser notification utilities.
 */
import type { CallType, ConnectionStatus } from '../types';
import type { CallPermissionStatus, ActiveCall } from '../types/chat.types';

export function canSendWebRtcSignalForCall(call: ActiveCall | null, callId?: number) {
    return Boolean(
        call?.callId &&
        call.callId === callId &&
        (call.status === 'connecting' || call.status === 'connected')
    );
}

export function getCallMediaErrorMessage(error: unknown, callType: CallType) {
    if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
            return callType === 'VIDEO'
                ? 'Allow microphone and camera access, then retry the video call.'
                : 'Allow microphone access, then retry the audio call.';
        }
        if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            return callType === 'VIDEO'
                ? 'No microphone or camera was found for this video call.'
                : 'No microphone was found for this audio call.';
        }
        if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            return callType === 'VIDEO'
                ? 'Selected microphone or camera is already in use.'
                : 'Selected microphone is already in use.';
        }
        if (error.name === 'OverconstrainedError') {
            return callType === 'VIDEO'
                ? 'Selected microphone or camera is unavailable. Choose another device.'
                : 'Selected microphone is unavailable. Choose another device.';
        }
    }
    return callType === 'VIDEO'
        ? 'Unable to access microphone or camera.'
        : 'Unable to access microphone.';
}

export async function queryCallPermission(name: 'microphone' | 'camera'): Promise<CallPermissionStatus> {
    if (!navigator.permissions?.query) return 'unsupported';
    try {
        const perm = await navigator.permissions.query({ name: name as PermissionName });
        return perm.state;
    } catch {
        return 'unsupported';
    }
}

export function getCallPermissionLabel(status: CallPermissionStatus) {
    switch (status) {
        case 'granted': return 'Allowed';
        case 'prompt': return 'Ask';
        case 'denied': return 'Blocked';
        case 'unsupported': return 'Browser controlled';
        case 'unknown':
        default: return 'Checking';
    }
}

export function getScreenShareErrorMessage(error: unknown) {
    if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Screen sharing was canceled or blocked.';
        if (error.name === 'NotFoundError' || error.name === 'AbortError') return 'No screen was selected.';
        if (error.name === 'NotReadableError') return 'Unable to capture the selected screen.';
    }
    return 'Unable to share your screen.';
}

export function buildCallMediaConstraints(
    callType: CallType,
    audioInputId: string,
    videoInputId: string
): MediaStreamConstraints {
    return {
        audio: audioInputId ? { deviceId: { exact: audioInputId } } : true,
        video: callType === 'VIDEO'
            ? videoInputId ? { deviceId: { exact: videoInputId } } : true
            : false,
    };
}

export function stopMediaStream(stream: MediaStream | null) {
    stream?.getTracks().forEach((t) => t.stop());
}

export function getBrowserAwareConnectionStatus(status: ConnectionStatus): ConnectionStatus {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
    return status;
}

export function isBrowserNotificationSupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission(): NotificationPermission {
    return isBrowserNotificationSupported() ? Notification.permission : 'denied';
}

export function shouldShowBrowserNotification() {
    return typeof document === 'undefined' || document.hidden || !document.hasFocus();
}

