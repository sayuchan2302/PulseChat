import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ActiveCall } from '../types/chat.types';
import type { CallSignalPayload } from '../types';

interface Options {
  activeCallRef: MutableRefObject<ActiveCall | null>;
  sendCallSignal: (payload: CallSignalPayload) => boolean;
  finishCall: (message: string) => void;
  stopIncomingCallRingtone: () => void;
  loadCallDevices: () => Promise<void>;
  setActiveCall: Dispatch<SetStateAction<ActiveCall | null>>;
  setCallError: Dispatch<SetStateAction<string>>;
}

export function useCallLifecycleActions({ activeCallRef, sendCallSignal, finishCall, stopIncomingCallRingtone, loadCallDevices, setActiveCall, setCallError }: Options) {
  const handleAcceptCall = useCallback(() => { const call = activeCallRef.current; if (!call?.callId || call.direction !== 'incoming') return; stopIncomingCallRingtone(); void loadCallDevices(); if (sendCallSignal({ eventType: 'CALL_ACCEPT', callId: call.callId })) { setActiveCall({ ...call, status: 'connecting' }); setCallError(''); } }, [activeCallRef, loadCallDevices, sendCallSignal, setActiveCall, setCallError, stopIncomingCallRingtone]);
  const handleRejectCall = useCallback(() => { const call = activeCallRef.current; if (!call?.callId) { finishCall('Call declined.'); return; } sendCallSignal({ eventType: 'CALL_REJECT', callId: call.callId }); finishCall('Call declined.'); }, [activeCallRef, finishCall, sendCallSignal]);
  const handleEndCall = useCallback(() => { const call = activeCallRef.current; if (!call?.callId) { finishCall('Call ended.'); return; } const eventType = call.status === 'ringing' && call.direction === 'outgoing' ? 'CALL_CANCEL' : 'CALL_END'; sendCallSignal({ eventType, callId: call.callId }); finishCall(eventType === 'CALL_CANCEL' ? 'Call canceled.' : 'Call ended.'); }, [activeCallRef, finishCall, sendCallSignal]);
  return { handleAcceptCall, handleRejectCall, handleEndCall };
}

export default useCallLifecycleActions;
