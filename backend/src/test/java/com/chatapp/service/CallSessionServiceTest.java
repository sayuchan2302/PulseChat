package com.chatapp.service;

import com.chatapp.dto.request.CallSignalRequest;
import com.chatapp.dto.request.CallSignalRequest.CallSignalType;
import com.chatapp.dto.response.CallSignalResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.CallSession;
import com.chatapp.model.CallSession.CallStatus;
import com.chatapp.model.CallSession.CallType;
import com.chatapp.model.User;
import com.chatapp.repository.CallSessionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CallSessionServiceTest {
    @Mock
    private CallSessionRepository callSessionRepository;

    @Mock
    private UserService userService;

    @Mock
    private FriendshipService friendshipService;

    @Mock
    private MessageService messageService;

    @InjectMocks
    private CallSessionService callSessionService;

    @Test
    void inviteCreatesRingingCallForAcceptedFriends() {
        User caller = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(caller);
        when(userService.findById(receiver.getId())).thenReturn(receiver);
        when(friendshipService.areFriends(caller, receiver)).thenReturn(true);
        when(callSessionRepository.saveAndFlush(any(CallSession.class))).thenAnswer(invocation -> {
            CallSession callSession = invocation.getArgument(0);
            callSession.setId(99L);
            return callSession;
        });

        CallSignalResponse response = callSessionService.handleSignal(
                "sayu",
                new CallSignalRequest(
                        CallSignalType.CALL_INVITE,
                        null,
                        receiver.getId(),
                        CallType.VIDEO,
                        null,
                        null,
                        null,
                        null
                )
        );

        assertEquals(99L, response.callId());
        assertEquals(CallType.VIDEO, response.callType());
        assertEquals(CallStatus.RINGING, response.status());
        assertEquals(caller.getId(), response.caller().id());
        assertEquals(receiver.getId(), response.receiver().id());

        ArgumentCaptor<CallSession> captor = ArgumentCaptor.forClass(CallSession.class);
        verify(callSessionRepository).saveAndFlush(captor.capture());
        assertEquals(caller, captor.getValue().getCaller());
        assertEquals(receiver, captor.getValue().getReceiver());
    }

    @Test
    void inviteRequiresAcceptedFriendship() {
        User caller = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(caller);
        when(userService.findById(receiver.getId())).thenReturn(receiver);
        when(friendshipService.areFriends(caller, receiver)).thenReturn(false);

        AppException exception = assertThrows(
                AppException.class,
                () -> callSessionService.handleSignal(
                        "sayu",
                        new CallSignalRequest(
                                CallSignalType.CALL_INVITE,
                                null,
                                receiver.getId(),
                                CallType.AUDIO,
                                null,
                                null,
                                null,
                                null
                        )
                )
        );

        assertEquals(ErrorCode.FRIENDSHIP_REQUIRED, exception.getErrorCode());
        verify(callSessionRepository, never()).saveAndFlush(any(CallSession.class));
    }

    @Test
    void inviteReturnsBusyWhenReceiverAlreadyHasActiveCall() {
        User caller = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(caller);
        when(userService.findById(receiver.getId())).thenReturn(receiver);
        when(friendshipService.areFriends(caller, receiver)).thenReturn(true);
        when(callSessionRepository.existsActiveCallForUser(caller.getId(), java.util.List.of(
                CallStatus.RINGING,
                CallStatus.ACCEPTED
        ))).thenReturn(false);
        when(callSessionRepository.existsActiveCallForUser(receiver.getId(), java.util.List.of(
                CallStatus.RINGING,
                CallStatus.ACCEPTED
        ))).thenReturn(true);
        when(callSessionRepository.saveAndFlush(any(CallSession.class))).thenAnswer(invocation -> {
            CallSession callSession = invocation.getArgument(0);
            callSession.setId(101L);
            return callSession;
        });

        CallSignalResponse response = callSessionService.handleSignal(
                "sayu",
                new CallSignalRequest(
                        CallSignalType.CALL_INVITE,
                        null,
                        receiver.getId(),
                        CallType.AUDIO,
                        null,
                        null,
                        null,
                        null
                )
        );

        assertEquals(CallSignalType.CALL_BUSY, response.eventType());
        assertEquals(CallStatus.BUSY, response.status());
        verify(messageService).saveCallHistoryMessage(any(CallSession.class), org.mockito.ArgumentMatchers.eq(caller));
    }

    @Test
    void acceptRequiresReceiver() {
        User caller = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        CallSession callSession = callSession(10L, caller, receiver, CallStatus.RINGING);
        when(userService.findByUsername("sayu")).thenReturn(caller);
        when(callSessionRepository.findWithParticipantsById(callSession.getId()))
                .thenReturn(Optional.of(callSession));

        AppException exception = assertThrows(
                AppException.class,
                () -> callSessionService.handleSignal(
                        "sayu",
                        new CallSignalRequest(
                                CallSignalType.CALL_ACCEPT,
                                callSession.getId(),
                                null,
                                null,
                                null,
                                null,
                                null,
                                null
                        )
                )
        );

        assertEquals(ErrorCode.CALL_ACCESS_DENIED, exception.getErrorCode());
        verify(callSessionRepository, never()).saveAndFlush(any(CallSession.class));
    }

    @Test
    void webRtcOfferRequiresAcceptedCall() {
        User caller = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        CallSession callSession = callSession(10L, caller, receiver, CallStatus.RINGING);
        when(userService.findByUsername("sayu")).thenReturn(caller);
        when(callSessionRepository.findWithParticipantsById(callSession.getId()))
                .thenReturn(Optional.of(callSession));

        AppException exception = assertThrows(
                AppException.class,
                () -> callSessionService.handleSignal(
                        "sayu",
                        new CallSignalRequest(
                                CallSignalType.WEBRTC_OFFER,
                                callSession.getId(),
                                null,
                                null,
                                "offer-sdp",
                                null,
                                null,
                                null
                        )
                )
        );

        assertEquals(ErrorCode.CALL_NOT_ACTIVE, exception.getErrorCode());
    }

    @Test
    void screenShareStartRelaysForAcceptedCallWithoutPayload() {
        User caller = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        CallSession callSession = callSession(10L, caller, receiver, CallStatus.ACCEPTED);
        when(userService.findByUsername("sayu")).thenReturn(caller);
        when(callSessionRepository.findWithParticipantsById(callSession.getId()))
                .thenReturn(Optional.of(callSession));

        CallSignalResponse response = callSessionService.handleSignal(
                "sayu",
                new CallSignalRequest(
                        CallSignalType.SCREEN_SHARE_START,
                        callSession.getId(),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null
                )
        );

        assertEquals(CallSignalType.SCREEN_SHARE_START, response.eventType());
        assertEquals(CallStatus.ACCEPTED, response.status());
        assertEquals(caller.getId(), response.fromUser().id());
        verify(callSessionRepository, never()).saveAndFlush(any(CallSession.class));
    }

    @Test
    void receiverAcceptsRingingCall() {
        User caller = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        CallSession callSession = callSession(10L, caller, receiver, CallStatus.RINGING);
        when(userService.findByUsername("thinh")).thenReturn(receiver);
        when(callSessionRepository.findWithParticipantsById(callSession.getId()))
                .thenReturn(Optional.of(callSession));
        when(callSessionRepository.saveAndFlush(any(CallSession.class))).thenAnswer(invocation -> invocation.getArgument(0));

        CallSignalResponse response = callSessionService.handleSignal(
                "thinh",
                new CallSignalRequest(
                        CallSignalType.CALL_ACCEPT,
                        callSession.getId(),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null
                )
        );

        assertEquals(CallStatus.ACCEPTED, response.status());
        assertNotNull(callSession.getStartedAt());
    }

    @Test
    void receiverRejectCreatesCallHistoryMessage() {
        User caller = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        CallSession callSession = callSession(10L, caller, receiver, CallStatus.RINGING);
        when(userService.findByUsername("thinh")).thenReturn(receiver);
        when(callSessionRepository.findWithParticipantsById(callSession.getId()))
                .thenReturn(Optional.of(callSession));
        when(callSessionRepository.saveAndFlush(any(CallSession.class))).thenAnswer(invocation -> invocation.getArgument(0));

        CallSignalResponse response = callSessionService.handleSignal(
                "thinh",
                new CallSignalRequest(
                        CallSignalType.CALL_REJECT,
                        callSession.getId(),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null
                )
        );

        assertEquals(CallStatus.REJECTED, response.status());
        verify(messageService).saveCallHistoryMessage(callSession, receiver);
    }

    private static User user(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setFullName(username);
        user.setEmail(username + "@example.com");
        user.setPassword("password");
        user.setOnline(true);
        return user;
    }

    private static CallSession callSession(Long id, User caller, User receiver, CallStatus status) {
        CallSession callSession = new CallSession();
        callSession.setId(id);
        callSession.setCaller(caller);
        callSession.setReceiver(receiver);
        callSession.setType(CallType.VIDEO);
        callSession.setStatus(status);
        callSession.setCreatedAt(LocalDateTime.of(2026, 8, 5, 10, 0));
        return callSession;
    }
}
