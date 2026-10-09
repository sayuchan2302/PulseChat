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
import {
  canSendWebRtcSignalForCall,
  getCallMediaErrorMessage,
  isMediaDeviceBusyError,
  stopMediaStream,
} from '../utils/callUtils';
import { getUserChatRoute } from '../utils/routeUtils';
import { getUserDisplayName } from '../utils/userUtils';

type MutableRef<T> = { current: T };
type PendingIceCandidate = { callId: number; candidate: RTCIceCandidateInit };
type PeerConnectionSetup = {
  callId: number;
  promise: Promise<RTCPeerConnection | null>;
};

type WebRtcSignalHandlersOptions = {
  activeCallRef: MutableRef<ActiveCall | null>;
  currentUserRef: MutableRef<User | null>;
  currentUserIdRef: MutableRef<number | null>;
  peerConnectionRef: MutableRef<RTCPeerConnection | null>;
  peerConnectionCallIdRef: MutableRef<number | null>;
  peerConnectionSetupRef: MutableRef<PeerConnectionSetup | null>;
  localCallStreamRef: MutableRef<MediaStream | null>;
  pendingIceCandidatesRef: MutableRef<PendingIceCandidate[]>;
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
  peerConnectionCallIdRef,
  peerConnectionSetupRef,
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

  const isCallActive = useCallback((callId: number) => {
    const call = activeCallRef.current;
    return call?.callId === callId && call.status !== 'ending';
  }, [activeCallRef]);

  const isCallEventForActiveCall = useCallback((event: CallSignalEvent) => {
    const call = activeCallRef.current;
    if (call?.callId === event.callId && call.status !== 'ending') {
      return true;
    }

    // CALL_BUSY can be the server's first response to the optimistic outgoing call,
    // before that call has received its persistent call id.
    return event.eventType === 'CALL_BUSY'
      && call !== null
      && call.callId === undefined
      && call.direction === 'outgoing'
      && call.peer.id === event.receiver.id;
  }, [activeCallRef]);

  const isCurrentPeerConnection = useCallback((callId: number, peerConnection?: RTCPeerConnection) => (
    isCallActive(callId)
    && peerConnectionCallIdRef.current === callId
    && (!peerConnection || peerConnectionRef.current === peerConnection)
  ), [isCallActive, peerConnectionCallIdRef, peerConnectionRef]);

  const flushPendingIceCandidates = useCallback(async (
    peerConnection: RTCPeerConnection,
    callId: number,
  ) => {
    const candidates = pendingIceCandidatesRef.current.filter((item) => item.callId === callId);
    pendingIceCandidatesRef.current = pendingIceCandidatesRef.current.filter(
      (item) => item.callId !== callId,
    );

    for (const { candidate } of candidates) {
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.error('Failed to apply queued ICE candidate:', error);
      }
    }
  }, [pendingIceCandidatesRef]);

  const createPeerConnection = useCallback(async (call: ActiveCall, initiator: boolean) => {
    const callId = call.callId;
    if (callId === undefined || !isCallActive(callId)) return null;

    if (peerConnectionRef.current && peerConnectionCallIdRef.current === callId) {
      return peerConnectionRef.current;
    }

    const pendingSetup = peerConnectionSetupRef.current;
    if (pendingSetup?.callId === callId) {
      return pendingSetup.promise;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    peerConnectionCallIdRef.current = callId;
    const setupPromise = (async (): Promise<RTCPeerConnection | null> => {
      let localStream: MediaStream | null = null;
      let mediaBusy = false;
      try {
        localStream = await getLocalCallMedia(call);
      } catch (error) {
        if (!isMediaDeviceBusyError(error)) throw error;
        mediaBusy = true;
      }

      if (!isCallActive(callId) || peerConnectionCallIdRef.current !== callId) {
        stopMediaStream(localStream);
        return null;
      }

      if (mediaBusy) {
        setCallError('Camera or microphone is used by another app or test tab. Joining without local media.');
      }
      if (localStream) {
        localCallStreamRef.current = localStream;
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = !micMutedRef.current;
        });
        localStream.getVideoTracks().forEach((track) => {
          track.enabled = !cameraOffRef.current;
        });
        setLocalCallStream(localStream);
        applySelectedDeviceIdsFromStream(localStream);
      }
      void loadCallDevices();
      void refreshCallPermissions(call.type);

      const peerConnection = new RTCPeerConnection({ iceServers: RTC_ICE_SERVERS });
      peerConnectionRef.current = peerConnection;
      setCallConnectionState('connecting');
      localStream?.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate || !isCurrentPeerConnection(callId, peerConnection)) return;

        const currentCall = activeCallRef.current;
        if (!canSendWebRtcSignalForCall(currentCall, callId)) return;
        sendCallSignal({
          eventType: 'ICE_CANDIDATE',
          callId,
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      };

      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream && isCurrentPeerConnection(callId, peerConnection)) {
          setRemoteCallStream(remoteStream);
        }
      };

      const updatePeerConnectionState = () => {
        if (!isCurrentPeerConnection(callId, peerConnection)) return;

        const connectionState = peerConnection.connectionState;
        const iceConnectionState = peerConnection.iceConnectionState;
        if (connectionState === 'connected' || iceConnectionState === 'connected' || iceConnectionState === 'completed') {
          setCallConnectionState('connected');
          setCallStartedAt((currentStartedAt) => currentStartedAt ?? Date.now());
          setActiveCallState((currentCall) => currentCall?.callId === callId
            ? { ...currentCall, status: 'connected' }
            : currentCall);
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

      if (initiator && canSendWebRtcSignalForCall(activeCallRef.current, callId)) {
        const offer = await peerConnection.createOffer();
        if (!isCurrentPeerConnection(callId, peerConnection)) return null;
        await peerConnection.setLocalDescription(offer);
        if (isCurrentPeerConnection(callId, peerConnection)
          && canSendWebRtcSignalForCall(activeCallRef.current, callId)) {
          sendCallSignal({ eventType: 'WEBRTC_OFFER', callId, sdp: offer.sdp });
        }
      }
      return peerConnection;
    })();
    const setup = { callId, promise: setupPromise };
    peerConnectionSetupRef.current = setup;

    try {
      return await setupPromise;
    } finally {
      if (peerConnectionSetupRef.current === setup) {
        peerConnectionSetupRef.current = null;
      }
    }
  }, [
    activeCallRef, applySelectedDeviceIdsFromStream, cameraOffRef, getLocalCallMedia,
    isCallActive, isCurrentPeerConnection, loadCallDevices, localCallStreamRef,
    micMutedRef, peerConnectionCallIdRef, peerConnectionRef, peerConnectionSetupRef,
    refreshCallPermissions, sendCallSignal, setActiveCallState, setCallConnectionState,
    setCallError, setCallStartedAt, setLocalCallStream, setRemoteCallStream,
  ]);

  const startPeerConnection = useCallback(async (call: ActiveCall, initiator: boolean) => {
    try {
      await createPeerConnection(call, initiator);
    } catch (error) {
      if (call.callId === undefined || !isCallActive(call.callId)) return;
      console.error('Failed to start call media:', error);
      const message = getCallMediaErrorMessage(error, call.type);
      setCallError(message);
      if (call.callId) sendCallSignal({ eventType: 'CALL_END', callId: call.callId });
      finishCall(message);
    }
  }, [createPeerConnection, finishCall, isCallActive, sendCallSignal, setCallError]);

  const handleWebRtcOffer = useCallback(async (event: CallSignalEvent) => {
    const callId = event.callId;
    const call = activeCallRef.current;
    if (
      callId === undefined ||
      !event.sdp ||
      isCallSignalFromCurrentUser(event) ||
      !call ||
      call.callId !== callId ||
      call.status === 'ending'
    ) return;

    setActiveCallState((currentCall) => currentCall?.callId === callId
      ? { ...currentCall, status: 'connecting' }
      : currentCall);

    try {
      const peerConnection = await createPeerConnection(call, false);
      if (!peerConnection || !isCurrentPeerConnection(callId, peerConnection)) return;
      await peerConnection.setRemoteDescription({ type: 'offer', sdp: event.sdp });
      if (!isCurrentPeerConnection(callId, peerConnection)) return;
      await flushPendingIceCandidates(peerConnection, callId);
      const answer = await peerConnection.createAnswer();
      if (!isCurrentPeerConnection(callId, peerConnection)) return;
      await peerConnection.setLocalDescription(answer);
      if (isCurrentPeerConnection(callId, peerConnection)) {
        sendCallSignal({ eventType: 'WEBRTC_ANSWER', callId, sdp: answer.sdp });
      }
    } catch (error) {
      if (!isCallActive(callId)) return;
      console.error('Failed to handle WebRTC offer:', error);
      setCallError('Unable to connect the call.');
      sendCallSignal({ eventType: 'CALL_END', callId });
      finishCall('Unable to connect the call.');
    }
  }, [
    activeCallRef, createPeerConnection, finishCall, flushPendingIceCandidates,
    isCallActive, isCallSignalFromCurrentUser, isCurrentPeerConnection,
    sendCallSignal, setActiveCallState, setCallError,
  ]);

  const handleWebRtcAnswer = useCallback(async (event: CallSignalEvent) => {
    const callId = event.callId;
    if (
      callId === undefined ||
      !event.sdp ||
      isCallSignalFromCurrentUser(event) ||
      !isCallActive(callId) ||
      peerConnectionCallIdRef.current !== callId
    ) return;
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection || !isCurrentPeerConnection(callId, peerConnection)) return;
    try {
      await peerConnection.setRemoteDescription({ type: 'answer', sdp: event.sdp });
      if (isCurrentPeerConnection(callId, peerConnection)) {
        await flushPendingIceCandidates(peerConnection, callId);
      }
    } catch (error) {
      if (!isCurrentPeerConnection(callId, peerConnection)) return;
      console.error('Failed to handle WebRTC answer:', error);
      setCallError('Unable to complete the call connection.');
    }
  }, [
    flushPendingIceCandidates, isCallActive, isCallSignalFromCurrentUser,
    isCurrentPeerConnection, peerConnectionCallIdRef, peerConnectionRef, setCallError,
  ]);

  const handleIceCandidate = useCallback(async (event: CallSignalEvent) => {
    const callId = event.callId;
    if (
      callId === undefined ||
      !event.candidate ||
      isCallSignalFromCurrentUser(event) ||
      !isCallActive(callId)
    ) return;

    if (peerConnectionCallIdRef.current !== null && peerConnectionCallIdRef.current !== callId) {
      return;
    }

    const candidate: RTCIceCandidateInit = {
      candidate: event.candidate,
      sdpMid: event.sdpMid ?? undefined,
      sdpMLineIndex: event.sdpMLineIndex ?? undefined,
    };
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection || !peerConnection.remoteDescription) {
      pendingIceCandidatesRef.current.push({ callId, candidate });
      return;
    }
    if (!isCurrentPeerConnection(callId, peerConnection)) return;
    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
    }
  }, [
    isCallActive, isCallSignalFromCurrentUser, isCurrentPeerConnection,
    peerConnectionCallIdRef, peerConnectionRef, pendingIceCandidatesRef,
  ]);

  return useCallback((event: CallSignalEvent) => {
    const currentRole = getCurrentCallRole(event);
    if (!currentRole || event.callId === undefined) return;
    const isFromCurrentUser = isCallSignalFromCurrentUser(event);
    const nextCall = buildCallFromSignal(event, 'ringing');
    if (!nextCall) return;

    if (event.eventType === 'CALL_INVITE') {
      const currentCall = activeCallRef.current;
      if (currentRole === 'caller') {
        if (currentCall?.callId === event.callId) return;
        if (currentCall && (
          currentCall.callId !== undefined ||
          currentCall.direction !== 'outgoing' ||
          currentCall.peer.id !== event.receiver.id
        )) return;
        setActiveCallState(nextCall);
        setCallError('');
        setRemoteScreenSharing(false);
        setScreenShareError('');
        return;
      }
      if (currentCall?.callId === event.callId) return;
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

    if (!isCallEventForActiveCall(event)) return;

    if (activeCallRef.current?.callId !== event.callId) {
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
    isCallEventForActiveCall,
    handleIceCandidate, handleWebRtcAnswer, handleWebRtcOffer,
    isCallSignalFromCurrentUser, notifyWithBrowserNotification, sendCallSignal,
    setActiveCallState, setCallError, setPreCallSetup, setRemoteScreenSharing,
    setScreenShareError, startPeerConnection, stopPreCallPreview,
  ]);
}

export default useWebRtcSignalHandlers;
