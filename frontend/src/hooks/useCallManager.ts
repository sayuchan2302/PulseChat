import { useCallback, useEffect, useRef, useState } from 'react';
import type { CallSignalEvent, CallSignalPayload, CallType, User } from '../types';
import { wsService } from '../services/websocket';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CallState = 'idle' | 'calling' | 'ringing' | 'active';

export interface ActiveCall {
  callId: number;
  callType: CallType;
  caller: User;
  receiver: User;
  /** The peer the current user is talking to */
  remoteUser: User;
  startedAt?: number;
}

export interface CallManager {
  callState: CallState;
  activeCall: ActiveCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen: boolean;
  /** Remote peer is sharing their screen */
  peerSharingScreen: boolean;
  startCall: (user: User, callType: CallType) => Promise<void>;
  answerCall: () => Promise<void>;
  rejectCall: () => void;
  cancelCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => Promise<void>;
  handleIncomingSignal: (event: CallSignalEvent) => void;
}

// ─── ICE servers (public STUN) ────────────────────────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCallManager(currentUser: User | null): CallManager {
  const [callState, setCallState] = useState<CallState>('idle');
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [peerSharingScreen, setPeerSharingScreen] = useState(false);

  // Refs – survive re-renders without triggers
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const callStateRef = useRef<CallState>('idle');
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // ── Signal sender ─────────────────────────────────────────────────────────

  const sendSignal = useCallback((payload: CallSignalPayload) => {
    wsService.sendMessage('/app/call', payload);
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;

    pendingCandidates.current = [];
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;

    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsCameraOff(false);
    setIsSharingScreen(false);
    setPeerSharingScreen(false);
    setCallState('idle');
    setActiveCall(null);
  }, []);

  // ── Create peer connection ─────────────────────────────────────────────────

  const createPeerConnection = useCallback(
    (call: ActiveCall): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Remote tracks → display
      const remoteMs = new MediaStream();
      pc.ontrack = (ev) => {
        ev.streams[0]?.getTracks().forEach((t) => remoteMs.addTrack(t));
        setRemoteStream(new MediaStream(remoteMs.getTracks()));
      };

      // ICE candidates → signal
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        sendSignal({
          eventType: 'ICE_CANDIDATE',
          callId: call.callId,
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid,
          sdpMLineIndex: ev.candidate.sdpMLineIndex,
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          cleanup();
        }
      };

      return pc;
    },
    [cleanup, sendSignal]
  );

  // ── Get user media ─────────────────────────────────────────────────────────

  const getUserMedia = useCallback(async (callType: CallType): Promise<MediaStream> => {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: callType === 'VIDEO' ? { width: 1280, height: 720, facingMode: 'user' } : false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  // ── Add tracks to peer connection ─────────────────────────────────────────

  const addLocalTracks = useCallback((pc: RTCPeerConnection, stream: MediaStream) => {
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });
  }, []);

  // ── Drain buffered ICE candidates ─────────────────────────────────────────

  const drainPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
    for (const init of pendingCandidates.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(init));
      } catch {
        /* ignore stale candidates */
      }
    }
    pendingCandidates.current = [];
  }, []);

  // ── startCall (caller initiates) ─────────────────────────────────────────

  const startCall = useCallback(
    async (user: User, callType: CallType) => {
      if (!currentUser || callStateRef.current !== 'idle') return;

      // The actual callId comes from the server CALL_INVITE response.
      // We store a provisional object; it's replaced once we get the signal back.
      const provisionalCall: ActiveCall = {
        callId: 0,
        callType,
        caller: currentUser,
        receiver: user,
        remoteUser: user,
      };

      setCallState('calling');
      setActiveCall(provisionalCall);

      sendSignal({
        eventType: 'CALL_INVITE',
        receiverId: user.id,
        callType,
      });
    },
    [currentUser, sendSignal]
  );

  // ── answerCall (receiver accepts) ─────────────────────────────────────────

  const answerCall = useCallback(async () => {
    const call = activeCallRef.current;
    if (!call) return;

    sendSignal({ eventType: 'CALL_ACCEPT', callId: call.callId });
    setCallState('active');
    activeCallRef.current = { ...call, startedAt: Date.now() };
    setActiveCall(activeCallRef.current);

    try {
      const stream = await getUserMedia(call.callType);
      const pc = createPeerConnection(call);
      addLocalTracks(pc, stream);
      // Caller creates offer; we wait for WEBRTC_OFFER
    } catch {
      cleanup();
    }
  }, [getUserMedia, createPeerConnection, addLocalTracks, cleanup, sendSignal]);

  // ── rejectCall ────────────────────────────────────────────────────────────

  const rejectCall = useCallback(() => {
    const call = activeCallRef.current;
    if (call) sendSignal({ eventType: 'CALL_REJECT', callId: call.callId });
    cleanup();
  }, [cleanup, sendSignal]);

  // ── cancelCall ────────────────────────────────────────────────────────────

  const cancelCall = useCallback(() => {
    const call = activeCallRef.current;
    if (call) sendSignal({ eventType: 'CALL_CANCEL', callId: call.callId });
    cleanup();
  }, [cleanup, sendSignal]);

  // ── endCall ───────────────────────────────────────────────────────────────

  const endCall = useCallback(() => {
    const call = activeCallRef.current;
    if (call) sendSignal({ eventType: 'CALL_END', callId: call.callId });
    cleanup();
  }, [cleanup, sendSignal]);

  // ── toggleMute ────────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsMuted((m) => !m);
  }, []);

  // ── toggleCamera ──────────────────────────────────────────────────────────

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsCameraOff((off) => !off);
  }, []);

  // ── toggleScreenShare ─────────────────────────────────────────────────────

  const toggleScreenShare = useCallback(async () => {
    const call = activeCallRef.current;
    const pc = pcRef.current;
    if (!call || !pc) return;

    if (isSharingScreen) {
      // Stop sharing – revert to camera track
      const screenStream = screenStreamRef.current;
      screenStream?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;

      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(cameraTrack);
      }

      setIsSharingScreen(false);
      sendSignal({ eventType: 'SCREEN_SHARE_STOP', callId: call.callId });
    } else {
      // Start sharing
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        screenStreamRef.current = screenStream;

        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(screenTrack);

        // Also update local preview
        const newLocal = new MediaStream([
          ...(localStreamRef.current?.getAudioTracks() ?? []),
          screenTrack,
        ]);
        setLocalStream(newLocal);

        setIsSharingScreen(true);
        sendSignal({ eventType: 'SCREEN_SHARE_START', callId: call.callId });

        // When user stops sharing via browser UI (e.g. "Stop sharing" button)
        screenTrack.onended = () => {
          void toggleScreenShare();
        };
      } catch {
        // User cancelled the picker – no-op
      }
    }
  }, [isSharingScreen, sendSignal]);

  // ── Handle incoming signal ─────────────────────────────────────────────────

  const handleIncomingSignal = useCallback(
    (event: CallSignalEvent) => {
      const { eventType, callId, callType, caller, receiver, fromUser, sdp, candidate, sdpMid, sdpMLineIndex, recipientRole } = event;

      const isCallerRole = recipientRole === 'CALLER';
      const remoteUser = isCallerRole ? receiver : caller;

      switch (eventType) {
        case 'CALL_INVITE': {
          // We are the receiver
          if (callStateRef.current !== 'idle') {
            // Already busy – backend should handle BUSY, but guard anyway
            return;
          }
          const call: ActiveCall = { callId, callType, caller, receiver, remoteUser };
          setActiveCall(call);
          setCallState('ringing');
          break;
        }

        case 'CALL_BUSY': {
          // We tried to call but someone is busy; just clean up
          cleanup();
          break;
        }

        case 'CALL_ACCEPT': {
          // Receiver accepted – now we (caller) set up WebRTC and send offer
          const call = activeCallRef.current;
          if (!call) return;

          // Update callId from server (it may have just been set)
          const updatedCall: ActiveCall = { ...call, callId, startedAt: Date.now() };
          setActiveCall(updatedCall);
          activeCallRef.current = updatedCall;
          setCallState('active');

          // Caller creates peer connection + offer
          void (async () => {
            try {
              const stream = await getUserMedia(call.callType);
              const pc = createPeerConnection(updatedCall);
              addLocalTracks(pc, stream);
              makingOfferRef.current = true;
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              makingOfferRef.current = false;
              sendSignal({ eventType: 'WEBRTC_OFFER', callId, sdp: offer.sdp });
            } catch {
              cleanup();
            }
          })();
          break;
        }

        case 'CALL_REJECT':
        case 'CALL_CANCEL':
        case 'CALL_END':
        case 'CALL_MISSED': {
          cleanup();
          break;
        }

        case 'WEBRTC_OFFER': {
          // We are the receiver – create answer
          if (!sdp) return;
          void (async () => {
            const call = activeCallRef.current;
            const pc = pcRef.current;
            if (!call || !pc) return;
            try {
              const offerCollides =
                makingOfferRef.current || pc.signalingState !== 'stable';
              ignoreOfferRef.current = !isCallerRole && offerCollides;
              if (ignoreOfferRef.current) return;

              await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
              await drainPendingCandidates(pc);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendSignal({ eventType: 'WEBRTC_ANSWER', callId, sdp: answer.sdp });
            } catch {
              cleanup();
            }
          })();
          break;
        }

        case 'WEBRTC_ANSWER': {
          if (!sdp) return;
          void (async () => {
            const pc = pcRef.current;
            if (!pc) return;
            try {
              if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
                await drainPendingCandidates(pc);
              }
            } catch {
              /* ignore */
            }
          })();
          break;
        }

        case 'ICE_CANDIDATE': {
          if (!candidate) return;
          void (async () => {
            const pc = pcRef.current;
            const init: RTCIceCandidateInit = { candidate, sdpMid: sdpMid ?? undefined, sdpMLineIndex: sdpMLineIndex ?? undefined };
            if (!pc || !pc.remoteDescription) {
              pendingCandidates.current.push(init);
              return;
            }
            try {
              await pc.addIceCandidate(new RTCIceCandidate(init));
            } catch {
              /* ignore */
            }
          })();
          break;
        }

        case 'SCREEN_SHARE_START': {
          setPeerSharingScreen(true);
          break;
        }

        case 'SCREEN_SHARE_STOP': {
          setPeerSharingScreen(false);
          break;
        }

        default:
          break;
      }
    },
    [cleanup, getUserMedia, createPeerConnection, addLocalTracks, sendSignal, drainPendingCandidates]
  );

  // ── Caller receives its own CALL_INVITE echo to get callId ───────────────
  // The server echoes CALL_INVITE back to caller with the real callId.
  // We update activeCall here.
  const handleCallerInviteEcho = useCallback(
    (event: CallSignalEvent) => {
      if (event.eventType !== 'CALL_INVITE') return;
      if (event.recipientRole !== 'CALLER') return;
      const call = activeCallRef.current;
      if (!call) return;
      const updated: ActiveCall = { ...call, callId: event.callId };
      activeCallRef.current = updated;
      setActiveCall(updated);
    },
    []
  );

  // Combine into one public handler
  const handleIncomingSignalPublic = useCallback(
    (event: CallSignalEvent) => {
      handleCallerInviteEcho(event);
      if (event.eventType !== 'CALL_INVITE' || event.recipientRole !== 'CALLER') {
        handleIncomingSignal(event);
      }
    },
    [handleCallerInviteEcho, handleIncomingSignal]
  );

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    callState,
    activeCall,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    isSharingScreen,
    peerSharingScreen,
    startCall,
    answerCall,
    rejectCall,
    cancelCall,
    endCall,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    handleIncomingSignal: handleIncomingSignalPublic,
  };
}
