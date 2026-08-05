package com.chatapp.service;

import com.chatapp.dto.request.CallSignalRequest;
import com.chatapp.dto.request.CallSignalRequest.CallSignalType;
import com.chatapp.dto.response.CallSignalResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.dto.response.UserResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.CallSession;
import com.chatapp.model.CallSession.CallStatus;
import com.chatapp.model.CallSession.CallType;
import com.chatapp.model.User;
import com.chatapp.repository.CallSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CallSessionService {
    private static final List<CallStatus> ACTIVE_CALL_STATUSES = List.of(CallStatus.RINGING, CallStatus.ACCEPTED);

    private final CallSessionRepository callSessionRepository;
    private final UserService userService;
    private final FriendshipService friendshipService;
    private final MessageService messageService;

    @Transactional
    public CallSignalResponse handleSignal(String currentUsername, CallSignalRequest request) {
        User currentUser = userService.findByUsername(currentUsername);
        return switch (request.eventType()) {
            case CALL_INVITE -> invite(currentUser, request);
            case CALL_ACCEPT -> accept(currentUser, request);
            case CALL_REJECT -> reject(currentUser, request);
            case CALL_CANCEL -> cancel(currentUser, request);
            case CALL_END -> end(currentUser, request);
            case CALL_MISSED, CALL_BUSY -> throw new AppException(ErrorCode.INVALID_CALL_SIGNAL);
            case WEBRTC_OFFER, WEBRTC_ANSWER, ICE_CANDIDATE -> relayWebRtcSignal(currentUser, request);
        };
    }

    private CallSignalResponse invite(User caller, CallSignalRequest request) {
        Long receiverId = requireReceiverId(request);
        User receiver = userService.findById(receiverId);
        CallType callType = requireCallType(request);

        if (caller.getId().equals(receiver.getId())) {
            throw new AppException(ErrorCode.SELF_CALL_NOT_ALLOWED);
        }

        if (!friendshipService.areFriends(caller, receiver)) {
            throw new AppException(ErrorCode.FRIENDSHIP_REQUIRED);
        }

        if (isUserInActiveCall(caller) || isUserInActiveCall(receiver)) {
            return busy(caller, receiver, callType);
        }

        CallSession callSession = new CallSession();
        callSession.setCaller(caller);
        callSession.setReceiver(receiver);
        callSession.setType(callType);
        callSession.setStatus(CallStatus.RINGING);

        return toResponse(
                callSessionRepository.saveAndFlush(callSession),
                CallSignalType.CALL_INVITE,
                caller,
                request
        );
    }

    private CallSignalResponse busy(User caller, User receiver, CallType callType) {
        CallSession callSession = new CallSession();
        callSession.setCaller(caller);
        callSession.setReceiver(receiver);
        callSession.setType(callType);
        callSession.setStatus(CallStatus.BUSY);
        callSession.setEndedAt(LocalDateTime.now());

        CallSession savedCallSession = callSessionRepository.saveAndFlush(callSession);
        MessageResponse historyMessage = messageService.saveCallHistoryMessage(savedCallSession, caller);

        return toResponse(
                savedCallSession,
                CallSignalType.CALL_BUSY,
                caller,
                null,
                historyMessage
        );
    }

    private CallSignalResponse accept(User receiver, CallSignalRequest request) {
        CallSession callSession = findCallSession(request);
        validateReceiver(callSession, receiver);
        validateRinging(callSession);

        callSession.setStatus(CallStatus.ACCEPTED);
        callSession.setStartedAt(LocalDateTime.now());

        return toResponse(
                callSessionRepository.saveAndFlush(callSession),
                CallSignalType.CALL_ACCEPT,
                receiver,
                request
        );
    }

    private CallSignalResponse reject(User receiver, CallSignalRequest request) {
        CallSession callSession = findCallSession(request);
        validateReceiver(callSession, receiver);
        validateRinging(callSession);

        callSession.setStatus(CallStatus.REJECTED);
        callSession.setEndedAt(LocalDateTime.now());

        CallSession savedCallSession = callSessionRepository.saveAndFlush(callSession);
        MessageResponse historyMessage = messageService.saveCallHistoryMessage(savedCallSession, receiver);

        return toResponse(
                savedCallSession,
                CallSignalType.CALL_REJECT,
                receiver,
                request,
                historyMessage
        );
    }

    private CallSignalResponse cancel(User caller, CallSignalRequest request) {
        CallSession callSession = findCallSession(request);
        validateCaller(callSession, caller);
        validateRinging(callSession);

        callSession.setStatus(CallStatus.CANCELED);
        callSession.setEndedAt(LocalDateTime.now());

        CallSession savedCallSession = callSessionRepository.saveAndFlush(callSession);
        MessageResponse historyMessage = messageService.saveCallHistoryMessage(savedCallSession, caller);

        return toResponse(
                savedCallSession,
                CallSignalType.CALL_CANCEL,
                caller,
                request,
                historyMessage
        );
    }

    private CallSignalResponse end(User participant, CallSignalRequest request) {
        CallSession callSession = findCallSession(request);
        validateParticipant(callSession, participant);
        validateNotTerminal(callSession);

        callSession.setStatus(CallStatus.ENDED);
        if (callSession.getStartedAt() == null) {
            callSession.setStartedAt(LocalDateTime.now());
        }
        callSession.setEndedAt(LocalDateTime.now());

        CallSession savedCallSession = callSessionRepository.saveAndFlush(callSession);
        MessageResponse historyMessage = messageService.saveCallHistoryMessage(savedCallSession, participant);

        return toResponse(
                savedCallSession,
                CallSignalType.CALL_END,
                participant,
                request,
                historyMessage
        );
    }

    private CallSignalResponse relayWebRtcSignal(User participant, CallSignalRequest request) {
        CallSession callSession = findCallSession(request);
        validateParticipant(callSession, participant);
        validateAccepted(callSession);
        validateSignalPayload(request);

        return toResponse(callSession, request.eventType(), participant, request);
    }

    private CallSession findCallSession(CallSignalRequest request) {
        if (request.callId() == null) {
            throw new AppException(ErrorCode.INVALID_CALL_SIGNAL, "Call id is required");
        }

        return callSessionRepository.findWithParticipantsById(request.callId())
                .orElseThrow(() -> new AppException(ErrorCode.CALL_NOT_FOUND));
    }

    private Long requireReceiverId(CallSignalRequest request) {
        if (request.receiverId() == null) {
            throw new AppException(ErrorCode.INVALID_CALL_SIGNAL, "Receiver id is required");
        }

        return request.receiverId();
    }

    private CallType requireCallType(CallSignalRequest request) {
        if (request.callType() == null) {
            throw new AppException(ErrorCode.INVALID_CALL_SIGNAL, "Call type is required");
        }

        return request.callType();
    }

    private void validateCaller(CallSession callSession, User caller) {
        if (!callSession.getCaller().getId().equals(caller.getId())) {
            throw new AppException(ErrorCode.CALL_ACCESS_DENIED);
        }
    }

    private void validateReceiver(CallSession callSession, User receiver) {
        if (!callSession.getReceiver().getId().equals(receiver.getId())) {
            throw new AppException(ErrorCode.CALL_ACCESS_DENIED);
        }
    }

    private void validateParticipant(CallSession callSession, User participant) {
        if (
                !callSession.getCaller().getId().equals(participant.getId()) &&
                        !callSession.getReceiver().getId().equals(participant.getId())
        ) {
            throw new AppException(ErrorCode.CALL_ACCESS_DENIED);
        }
    }

    private void validateRinging(CallSession callSession) {
        if (callSession.getStatus() != CallStatus.RINGING) {
            throw new AppException(ErrorCode.CALL_NOT_RINGING);
        }
    }

    private void validateAccepted(CallSession callSession) {
        if (callSession.getStatus() != CallStatus.ACCEPTED) {
            throw new AppException(ErrorCode.CALL_NOT_ACTIVE);
        }
    }

    private void validateNotTerminal(CallSession callSession) {
        if (
                callSession.getStatus() == CallStatus.REJECTED ||
                        callSession.getStatus() == CallStatus.MISSED ||
                        callSession.getStatus() == CallStatus.ENDED ||
                        callSession.getStatus() == CallStatus.CANCELED ||
                        callSession.getStatus() == CallStatus.BUSY
        ) {
            throw new AppException(ErrorCode.CALL_NOT_ACTIVE);
        }
    }

    private boolean isUserInActiveCall(User user) {
        return callSessionRepository.existsActiveCallForUser(user.getId(), ACTIVE_CALL_STATUSES);
    }

    private void validateSignalPayload(CallSignalRequest request) {
        if (
                (request.eventType() == CallSignalType.WEBRTC_OFFER ||
                        request.eventType() == CallSignalType.WEBRTC_ANSWER) &&
                        !StringUtils.hasText(request.sdp())
        ) {
            throw new AppException(ErrorCode.INVALID_CALL_SIGNAL, "SDP is required");
        }

        if (request.eventType() == CallSignalType.ICE_CANDIDATE && !StringUtils.hasText(request.candidate())) {
            throw new AppException(ErrorCode.INVALID_CALL_SIGNAL, "ICE candidate is required");
        }
    }

    private CallSignalResponse toResponse(
            CallSession callSession,
            CallSignalType eventType,
            User fromUser,
            CallSignalRequest request
    ) {
        return toResponse(callSession, eventType, fromUser, request, null);
    }

    private CallSignalResponse toResponse(
            CallSession callSession,
            CallSignalType eventType,
            User fromUser,
            CallSignalRequest request,
            MessageResponse historyMessage
    ) {
        return CallSignalResponse.from(
                callSession,
                eventType,
                UserResponse.from(fromUser),
                request == null ? null : request.sdp(),
                request == null ? null : request.candidate(),
                request == null ? null : request.sdpMid(),
                request == null ? null : request.sdpMLineIndex(),
                historyMessage
        );
    }
}
