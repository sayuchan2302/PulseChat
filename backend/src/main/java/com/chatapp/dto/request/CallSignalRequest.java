package com.chatapp.dto.request;

import com.chatapp.model.CallSession.CallType;
import jakarta.validation.constraints.NotNull;

public record CallSignalRequest(
        @NotNull CallSignalType eventType,
        Long callId,
        Long receiverId,
        CallType callType,
        String sdp,
        String candidate,
        String sdpMid,
        Integer sdpMLineIndex
) {
    public enum CallSignalType {
        CALL_INVITE,
        CALL_ACCEPT,
        CALL_REJECT,
        CALL_CANCEL,
        CALL_END,
        CALL_MISSED,
        CALL_BUSY,
        WEBRTC_OFFER,
        WEBRTC_ANSWER,
        ICE_CANDIDATE,
        SCREEN_SHARE_START,
        SCREEN_SHARE_STOP
    }
}
