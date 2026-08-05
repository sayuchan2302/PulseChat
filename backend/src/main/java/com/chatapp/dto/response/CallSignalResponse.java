package com.chatapp.dto.response;

import com.chatapp.dto.request.CallSignalRequest.CallSignalType;
import com.chatapp.model.CallSession;
import com.chatapp.model.CallSession.CallStatus;
import com.chatapp.model.CallSession.CallType;

import java.time.LocalDateTime;

public record CallSignalResponse(
        CallSignalType eventType,
        Long callId,
        CallType callType,
        CallStatus status,
        CallRecipientRole recipientRole,
        UserResponse caller,
        UserResponse receiver,
        UserResponse fromUser,
        String sdp,
        String candidate,
        String sdpMid,
        Integer sdpMLineIndex,
        MessageResponse historyMessage,
        LocalDateTime occurredAt
) {
    public enum CallRecipientRole {
        CALLER,
        RECEIVER
    }

    public static CallSignalResponse from(
            CallSession callSession,
            CallSignalType eventType,
            UserResponse fromUser,
            String sdp,
            String candidate,
            String sdpMid,
            Integer sdpMLineIndex
    ) {
        return from(callSession, eventType, fromUser, sdp, candidate, sdpMid, sdpMLineIndex, null);
    }

    public static CallSignalResponse from(
            CallSession callSession,
            CallSignalType eventType,
            UserResponse fromUser,
            String sdp,
            String candidate,
            String sdpMid,
            Integer sdpMLineIndex,
            MessageResponse historyMessage
    ) {
        return new CallSignalResponse(
                eventType,
                callSession.getId(),
                callSession.getType(),
                callSession.getStatus(),
                null,
                UserResponse.from(callSession.getCaller()),
                UserResponse.from(callSession.getReceiver()),
                fromUser,
                sdp,
                candidate,
                sdpMid,
                sdpMLineIndex,
                historyMessage,
                LocalDateTime.now()
        );
    }

    public CallSignalResponse forRecipient(CallRecipientRole recipientRole) {
        return new CallSignalResponse(
                eventType,
                callId,
                callType,
                status,
                recipientRole,
                caller,
                receiver,
                fromUser,
                sdp,
                candidate,
                sdpMid,
                sdpMLineIndex,
                historyMessage,
                occurredAt
        );
    }
}
