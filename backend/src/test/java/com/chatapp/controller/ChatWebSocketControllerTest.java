package com.chatapp.controller;

import com.chatapp.dto.request.CallSignalRequest;
import com.chatapp.dto.request.CallSignalRequest.CallSignalType;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.service.CallRealtimeNotifier;
import com.chatapp.service.CallSessionService;
import com.chatapp.service.ChatRoomService;
import com.chatapp.service.MessageService;
import com.chatapp.service.UserService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.security.Principal;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatWebSocketControllerTest {
    @Mock
    private CallSessionService callSessionService;

    @Mock
    private CallRealtimeNotifier callRealtimeNotifier;

    @Mock
    private MessageService messageService;

    @Mock
    private UserService userService;

    @Mock
    private ChatRoomService chatRoomService;

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @InjectMocks
    private ChatWebSocketController controller;

    @Test
    void signalCallIgnoresStaleWebRtcSignal() {
        Principal principal = () -> "sayu";
        CallSignalRequest request = new CallSignalRequest(
                CallSignalType.ICE_CANDIDATE,
                42L,
                null,
                null,
                null,
                "candidate",
                null,
                0
        );
        when(callSessionService.handleSignal("sayu", request))
                .thenThrow(new AppException(ErrorCode.CALL_NOT_ACTIVE));

        controller.signalCall(request, principal);

        verify(callRealtimeNotifier, never()).notifyParticipants(org.mockito.ArgumentMatchers.any());
        verify(callRealtimeNotifier, never()).notifyCallerOnly(org.mockito.ArgumentMatchers.any());
    }
}
