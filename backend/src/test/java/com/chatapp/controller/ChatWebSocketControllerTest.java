package com.chatapp.controller;

import com.chatapp.dto.request.CallSignalRequest;
import com.chatapp.dto.request.CallSignalRequest.CallSignalType;
import com.chatapp.dto.request.TypingRequest;
import com.chatapp.dto.response.CallSignalResponse;
import com.chatapp.dto.response.RealtimeErrorResponse;
import com.chatapp.dto.response.UserResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.CallSession;
import com.chatapp.model.CallSession.CallStatus;
import com.chatapp.model.CallSession.CallType;
import com.chatapp.service.CallRealtimeNotifier;
import com.chatapp.service.CallSessionService;
import com.chatapp.service.ChatRoomService;
import com.chatapp.service.FriendshipService;
import com.chatapp.service.MessageService;
import com.chatapp.service.UserService;
import com.chatapp.model.User;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.security.Principal;
import java.sql.SQLException;

import static org.mockito.Mockito.mock;
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
    private FriendshipService friendshipService;

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

    @Test
    void sendTypingRequiresAcceptedFriendship() {
        Principal principal = () -> "sayu";
        User sender = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        TypingRequest request = new TypingRequest(receiver.getId(), true);
        when(userService.findByUsername("sayu")).thenReturn(sender);
        when(userService.findById(receiver.getId())).thenReturn(receiver);
        when(friendshipService.areFriends(sender, receiver)).thenReturn(false);

        AppException exception = Assertions.assertThrows(
                AppException.class,
                () -> controller.sendTyping(request, principal)
        );

        Assertions.assertEquals(ErrorCode.FRIENDSHIP_REQUIRED, exception.getErrorCode());
        verify(messagingTemplate, never()).convertAndSendToUser(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any()
        );
    }

    @Test
    void appExceptionsAreReportedToTheCallerInsteadOfBeingSwallowed() {
        Principal principal = () -> "sayu";

        controller.handleAppException(new AppException(ErrorCode.FRIENDSHIP_REQUIRED), principal);

        verify(messagingTemplate).convertAndSendToUser(
                "sayu",
                "/queue/errors",
                new RealtimeErrorResponse(
                        ErrorCode.FRIENDSHIP_REQUIRED.getCode(),
                        ErrorCode.FRIENDSHIP_REQUIRED.getDefaultMessage())
        );
    }

    @Test
    void validationFailuresAreReportedWithTheStandardValidationCode() {
        Principal principal = () -> "sayu";

        controller.handleValidationException(mock(MethodArgumentNotValidException.class), principal);

        verify(messagingTemplate).convertAndSendToUser(
                "sayu",
                "/queue/errors",
                new RealtimeErrorResponse(
                        ErrorCode.VALIDATION_FAILED.getCode(),
                        ErrorCode.VALIDATION_FAILED.getDefaultMessage())
        );
    }

    @Test
    void errorsWithoutAnAuthenticatedPrincipalAreOnlyLogged() {
        controller.handleAppException(new AppException(ErrorCode.FRIENDSHIP_REQUIRED), null);

        verify(messagingTemplate, never()).convertAndSendToUser(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any()
        );
    }

    @Test
    void inviteLosingTheActiveCallRaceFallsBackToCallBusy() {
        Principal principal = () -> "sayu";
        CallSignalRequest request = new CallSignalRequest(
                CallSignalType.CALL_INVITE,
                null,
                2L,
                CallType.AUDIO,
                null,
                null,
                null,
                null
        );
        DataIntegrityViolationException conflict = new DataIntegrityViolationException("insert failed",
                new SQLException(
                        "duplicate key value violates unique constraint \"uk_call_sessions_active_caller\"",
                        "23505"));
        CallSession callSession = new CallSession();
        callSession.setId(55L);
        callSession.setCaller(user(1L, "sayu"));
        callSession.setReceiver(user(2L, "thinh"));
        callSession.setType(CallType.AUDIO);
        callSession.setStatus(CallStatus.BUSY);
        CallSignalResponse busyResponse = CallSignalResponse.from(
                callSession,
                CallSignalType.CALL_BUSY,
                UserResponse.from(callSession.getCaller()),
                null,
                null,
                null,
                null
        );
        when(callSessionService.handleSignal("sayu", request)).thenThrow(conflict);
        when(callSessionService.isActiveCallRaceConflict(conflict)).thenReturn(true);
        when(callSessionService.recordBusyCall("sayu", request)).thenReturn(busyResponse);

        controller.signalCall(request, principal);

        verify(callRealtimeNotifier).notifyCallerOnly(busyResponse);
        verify(callRealtimeNotifier, never()).notifyParticipants(org.mockito.ArgumentMatchers.any());
    }

    private static User user(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        return user;
    }
}
