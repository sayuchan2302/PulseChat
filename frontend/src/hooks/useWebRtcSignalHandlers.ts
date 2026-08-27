import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { RTC_ICE_SERVERS } from '../config/constants';
import type { CallSignalEvent, CallSignalPayload, User } from '../types';
import type {
  ActiveCall,
  CallConnectionState,
  ChatBrowserNotification,
  PreCallSetup,
} from '../types/chat.types';
import { canSendWebRtcSignalForCall, getCallMediaErrorMessage } from '../utils/callUtils';
import { getUserChatRoute } from '../utils/routeUtils';
import { getUserDisplayName } from '../utils/userUtils';

type MutableRef<T> = { current: T };

type WebRtcSignalHandlersOptions = {
  activeCallRef: MutableRef<ActiveCall | null>;
  currentUserRef: MutableRef<User | null>;
  currentUserIdRef: MutableRef<number | null>;
  peerConnectionRef: MutableRef<RTCPeerConnection | null>;
  localCallStreamRef: MutableRef<MediaStream | null>;
  pendingIceCandidatesRef: MutableRef<RTCIceCandidateInit[]>;
  micMutedRef: MutableRef<boolean>;
  cameraOffRef: MutableRef<boolean>;
  getLocalCallMedia: (call: ActiveCall) => Promise<MediaStream>;
  applySelectedDeviceIdsFromStream: (stream: MediaStream) => void;
  loadCallDevices: () => Promise<void>;
  refreshCallPermissions: (callType: ActiveCall['type']) => Promise<void>;
  sendCallSignal: (payload: CallSignalPayload) => boolean;
  finishCall: (message?: string) => void;
  stopPreCallPreview: () => void;
  setPreCallSetup: Dispatch<SetStateAction<PreCallSetup>>;
  setActiveCallState: Dispatch<SetStateAction<ActiveCall | null>>;
  setLocalCallStream: Dispatch<SetStateAction<MediaStream | null>>;
  setRemoteCallStream: Dispatch<SetStateAction<MediaStream | null>>;
  setCallConnectionState: Dispatch<SetStateAction<CallConnectionState>>;
  setCallStartedAt: Dispatch<SetStateAction<number | null>>;
  setCallError: Dispatch<SetStateAction<string>>;
  setRemoteScreenSharing: Dispatch<SetStateAction<boolean>>;
  setScreenShareError: Dispatch<SetStateAction<string>>;
  notifyWithBrowserNotification: (notification: ChatBrowserNotification) => void;
};

export function useWebRtcSignalHandlers({
  activeCallRef,
  currentUserRef,
  currentUserIdRef,
  peerConnectionRef,
  localCallStreamRef,
  pendingIceCandidatesRef,
  micMutedRef,
  cameraOffRef,
  getLocalCallMedia,
  applySelectedDeviceIdsFromStream,
  loadCallDevices,
  refreshCallPermissions,
  sendCallSignal,
  finishCall,
  stopPreCallPreview,
  setPreCallSetup,
  setActiveCallState,
  setLocalCallStream,
  setRemoteCallStream,
  setCallConnectionState,
  setCallStartedAt,
  setCallError,
  setRemoteScreenSharing,
  setScreenShareError,
  notifyWithBrowserNotification,
}: WebRtcSignalHandlersOptions) {
  const getCurrentCallRole = useCallback((event: CallSignalEvent) => {
    if (event.recipientRole === 'CALLER') return 'caller' as const;
    if (event.recipientRole === 'RECEIVER') return 'receiver' as const;

    const currentAccount = currentUserRef.current;
    if (currentAccount) {
      if (event.caller.id === currentAccount.id || event.caller.username === currentAccount.username) {
        return 'caller' as const;
      }
      if (event.receiver.id === currentAccount.id || event.receiver.username === currentAccount.username) {
        return 'receiver' as const;
      }
      return null;
    }

    const currentUserId = currentUserIdRef.current;
    if (currentUserId === null) return null;
    if (event.caller.id === currentUserId) return 'caller' as const;
    if (event.receiver.id === currentUserId) return 'receiver' as const;
    return null;
  }, [currentUserIdRef, currentUserRef]);

  const isCallSignalFromCurrentUser = useCallback((event: CallSignalEvent) => {
    if (event.recipientRole === 'CALLER') {
      return event.fromUser.id === event.caller.id || event.fromUser.username === event.caller.username;
    }
    if (event.recipientRole === 'RECEIVER') {
      return event.fromUser.id === event.receiver.id || event.fromUser.username === event.receiver.username;
    }

    const currentAccount = currentUserRef.current;
    if (currentAccount) {
      return event.fromUser.id === currentAccount.id || event.fromUser.username === currentAccount.username;
    }
    return currentUserIdRef.current !== null && event.fromUser.id === currentUserIdRef.current;
  }, [currentUserIdRef, currentUserRef]);

  const buildCallFromSignal = useCallback((
    event: CallSignalEvent,
    status: ActiveCall['status'],
  ): ActiveCall | null => {
    const role = getCurrentCallRole(event);
    if (!role) return null;

    return {
      callId: event.callId,
      type: event.callType,
      status,
      direction: role === 'caller' ? 'outgoing' : 'incoming',
      peer: role === 'caller' ? event.receiver : event.caller,
    };
  }, [getCurrentCallRole]);

  const flushPendingIceCandidates = useCallback(async (peerConnection: RTCPeerConnection) => {
    const candidates = pendingIceCandidatesRef.current;
    pendingIceCandidatesRef.current = [];

    for (const candidate of candidates) {
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.error('Failed to apply queued ICE candidate:', error);
      }
    }
  }, [pendingIceCandidatesRef]);

  const createPeerConnection = useCallback(async (call: ActiveCall, initiator: boolean) => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const localStream = await getLocalCallMedia(call);
    localCallStreamRef.current = localStream;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !micMutedRef.current;
    });
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = !cameraOffRef.current;
    });
    setLocalCallStream(localStream);
    applySelectedDeviceIdsFromStream(localStream);
    void loadCallDevices();
    void refreshCallPermissions(call.type);

    const peerConnection = new RTCPeerConnection({ iceServers: RTC_ICE_SERVERS });
    peerConnectionRef.current = peerConnection;
    setCallConnectionState('connecting');
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
      const currentCall = activeCallRef.current;
      const signalCallId = currentCall?.callId;
      if (!event.candidate || signalCallId === undefined || !canSendWebRtcSignalForCall(currentCall, call.callId)) {
        return;
      }

      sendCallSignal({
        eventType: 'ICE_CANDIDATE',
        callId: signalCallId,
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      });
    };

    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) setRemoteCallStream(remoteStream);
    };

    const updatePeerConnectionState = () => {
      const connectionState = peerConnection.connectionState;
      const iceConnectionState = peerConnection.iceConnectionState;
      if (connectionState === 'connected' || iceConnectionState === 'connected' || iceConnectionState === 'completed') {
        setCallConnectionState('connected');
        setCallStartedAt((currentStartedAt) => currentStartedAt ?? Date.now());
        setActiveCallState((currentCall) => currentCall ? { ...currentCall, status: 'connected' } : currentCall);
        setCallError('');
      } else if (connectionState === 'connecting' || iceConnectionState === 'checking') {
        setCallConnectionState('connecting');
      } else if (connectionState === 'disconnected' || iceConnectionState === 'disconnected') {
        setCallConnectionState('reconnecting');
        setCallError('Poor connection. Trying to reconnect the call.');
      } else if (connectionState === 'failed' || iceConnectionState === 'failed') {
        setCallConnectionState('failed');
        setCallError('Call connection failed.');
      } else if (connectionState === 'closed' || iceConnectionState === 'closed') {
        setCallConnectionState('closed');
      }
    };
    peerConnection.onconnectionstatechange = updatePeerConnectionState;
    peerConnection.oniceconnectionstatechange = updatePeerConnectionState;

    if (initiator && canSendWebRtcSignalForCall(activeCallRef.current, call.callId)) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      if (canSendWebRtcSignalForCall(activeCallRef.current, call.callId)) {
        sendCallSignal({ eventType: 'WEBRTC_OFFER', callId: call.callId, sdp: offer.sdp });
      }
    }
    return peerConnection;
  }, [
    activeCallRef, applySelectedDeviceIdsFromStream, cameraOffRef, getLocalCallMedia,
    loadCallDevices, localCallStreamRef, micMutedRef, peerConnectionRef,
    refreshCallPermissions, sendCallSignal, setActiveCallState, setCallConnectionState,
    setCallError, setCallStartedAt, setLocalCallStream, setRemoteCallStream,
  ]);

  const startPeerConnection = useCallback(async (call: ActiveCall, initiator: boolean) => {
    try {
      await createPeerConnection(call, initiator);
    } catch (error) {
      console.error('Failed to start call media:', error);
      const message = getCallMediaErrorMessage(error, call.type);
      setCallError(message);
      if (call.callId) sendCallSignal({ eventType: 'CALL_END', callId: call.callId });
      finishCall(message);
    }
  }, [createPeerConnection, finishCall, sendCallSignal, setCallError]);

  const handleWebRtcOffer = useCallback(async (event: CallSignalEvent) => {
    if (!event.sdp || isCallSignalFromCurrentUser(event)) return;
    const call = activeCallRef.current ?? buildCallFromSignal(event, 'connecting');
    if (!call) return;
    setActiveCallState({ ...call, status: 'connecting' });

    try {
      const peerConnection = await createPeerConnection(call, false);
      await peerConnection.setRemoteDescription({ type: 'offer', sdp: event.sdp });
      await flushPendingIceCandidates(peerConnection);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      sendCallSignal({ eventType: 'WEBRTC_ANSWER', callId: event.callId, sdp: answer.sdp });
    } catch (error) {
      console.error('Failed to handle WebRTC offer:', error);
      setCallError('Unable to connect the call.');
      sendCallSignal({ eventType: 'CALL_END', callId: event.callId });
      finishCall('Unable to connect the call.');
    }
  }, [
    activeCallRef, buildCallFromSignal, createPeerConnection, finishCall,
    flushPendingIceCandidates, isCallSignalFromCurrentUser, sendCallSignal,
    setActiveCallState, setCallError,
  ]);

  const handleWebRtcAnswer = useCallback(async (event: CallSignalEvent) => {
    if (!event.sdp || isCallSignalFromCurrentUser(event)) return;
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection) return;
    try {
      await peerConnection.setRemoteDescription({ type: 'answer', sdp: event.sdp });
      await flushPendingIceCandidates(peerConnection);
    } catch (error) {
      console.error('Failed to handle WebRTC answer:', error);
      setCallError('Unable to complete the call connection.');
    }
  }, [flushPendingIceCandidates, isCallSignalFromCurrentUser, peerConnectionRef, setCallError]);

  const handleIceCandidate = useCallback(async (event: CallSignalEvent) => {
    if (!event.candidate || isCallSignalFromCurrentUser(event)) return;
    const candidate: RTCIceCandidateInit = {
      candidate: event.candidate,
      sdpMid: event.sdpMid ?? undefined,
      sdpMLineIndex: event.sdpMLineIndex ?? undefined,
    };
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection || !peerConnection.remoteDescription) {
      pendingIceCandidatesRef.current.push(candidate);
      return;
    }
    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
    }
  }, [isCallSignalFromCurrentUser, peerConnectionRef, pendingIceCandidatesRef]);

  return useCallback((event: CallSignalEvent) => {
    const currentRole = getCurrentCallRole(event);
    if (!currentRole) return;
    const isFromCurrentUser = isCallSignalFromCurrentUser(event);
    const nextCall = buildCallFromSignal(event, 'ringing');
    if (!nextCall) return;

    if (event.eventType === 'CALL_INVITE') {
      if (currentRole === 'caller') {
        setActiveCallState(nextCall);
        setCallError('');
        setRemoteScreenSharing(false);
        setScreenShareError('');
        return;
      }
      const currentCall = activeCallRef.current;
      if (currentCall && currentCall.callId !== event.callId) {
        sendCallSignal({ eventType: 'CALL_REJECT', callId: event.callId });
        return;
      }
      stopPreCallPreview();
      setPreCallSetup(null);
      setActiveCallState(nextCall);
      setCallError('');
      setRemoteScreenSharing(false);
      setScreenShareError('');
      notifyWithBrowserNotification({
        title: event.callType === 'VIDEO' ? 'Incoming video call' : 'Incoming audio call',
        body: `${getUserDisplayName(event.caller)} is calling you.`,
        path: getUserChatRoute(event.caller.username),
        user: event.caller,
        browserTag: `call-${event.callId}`,
      });
      return;
    }

    if (activeCallRef.current?.callId !== event.callId && ![
      'WEBRTC_OFFER', 'WEBRTC_ANSWER', 'ICE_CANDIDATE', 'SCREEN_SHARE_START', 'SCREEN_SHARE_STOP',
    ].includes(event.eventType)) {
      setActiveCallState(nextCall);
    }

    if (event.eventType === 'CALL_ACCEPT') {
      const connectingCall = { ...nextCall, status: 'connecting' as const };
      setActiveCallState(connectingCall);
      if (currentRole === 'receiver') {
        void startPeerConnection(connectingCall, false);
      } else if (!isFromCurrentUser && currentRole === 'caller') {
        void startPeerConnection(connectingCall, true);
      }
      return;
    }
    if (event.eventType === 'CALL_REJECT') return void finishCall('Call declined.');
    if (event.eventType === 'CALL_BUSY') return void finishCall('User is busy.');
    if (event.eventType === 'CALL_MISSED') return void finishCall('Missed call.');
    if (event.eventType === 'CALL_CANCEL') return void finishCall('Call canceled.');
    if (event.eventType === 'CALL_END') return void finishCall('Call ended.');
    if (event.eventType === 'SCREEN_SHARE_START') {
      if (!isFromCurrentUser) setRemoteScreenSharing(true);
      return;
    }
    if (event.eventType === 'SCREEN_SHARE_STOP') {
      if (!isFromCurrentUser) setRemoteScreenSharing(false);
      return;
    }
    if (event.eventType === 'WEBRTC_OFFER') return void handleWebRtcOffer(event);
    if (event.eventType === 'WEBRTC_ANSWER') return void handleWebRtcAnswer(event);
    if (event.eventType === 'ICE_CANDIDATE') void handleIceCandidate(event);
  }, [
    activeCallRef, buildCallFromSignal, finishCall, getCurrentCallRole,
    handleIceCandidate, handleWebRtcAnswer, handleWebRtcOffer,
    isCallSignalFromCurrentUser, notifyWithBrowserNotification, sendCallSignal,
    setActiveCallState, setCallError, setPreCallSetup, setRemoteScreenSharing,
    setScreenShareError, startPeerConnection, stopPreCallPreview,
  ]);
}

export default useWebRtcSignalHandlers;
