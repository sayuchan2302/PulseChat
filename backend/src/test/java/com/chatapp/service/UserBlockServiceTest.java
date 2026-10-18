package com.chatapp.service;

import com.chatapp.dto.request.CallSignalRequest.CallSignalType;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.CallSession;
import com.chatapp.model.CallSession.CallStatus;
import com.chatapp.model.CallSession.CallType;
import com.chatapp.model.Friendship;
import com.chatapp.model.Friendship.FriendshipStatus;
import com.chatapp.model.User;
import com.chatapp.model.UserBlock;
import com.chatapp.repository.CallSessionRepository;
import com.chatapp.repository.FriendshipRepository;
import com.chatapp.repository.UserBlockRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserBlockServiceTest {
    @Mock
    private UserBlockRepository userBlockRepository;
    @Mock
    private FriendshipRepository friendshipRepository;
    @Mock
    private CallSessionRepository callSessionRepository;
    @Mock
    private UserService userService;
    @Mock
    private CallRealtimeNotifier callRealtimeNotifier;
    @Mock
    private AfterCommitExecutor afterCommitExecutor;

    @InjectMocks
    private UserBlockService userBlockService;

    @Test
    void blockingRemovesFriendshipAndTerminatesAnActiveCall() {
        User blocker = user(1L, "alice");
        User blocked = user(2L, "bob");
        Friendship friendship = new Friendship();
        friendship.setRequester(blocker);
        friendship.setReceiver(blocked);
        friendship.setStatus(FriendshipStatus.ACCEPTED);
        CallSession call = new CallSession();
        call.setCaller(blocker);
        call.setReceiver(blocked);
        call.setType(CallType.VIDEO);
        call.setStatus(CallStatus.ACCEPTED);

        when(userService.findByUsername("alice")).thenReturn(blocker);
        when(userService.findById(2L)).thenReturn(blocked);
        when(userBlockRepository.findByBlockerIdAndBlockedUserId(1L, 2L)).thenReturn(Optional.empty());
        when(friendshipRepository.findByUserLowIdAndUserHighId(1L, 2L)).thenReturn(Optional.of(friendship));
        when(callSessionRepository.findActiveCallsBetweenUsers(eq(1L), eq(2L), any()))
                .thenReturn(List.of(call));
        when(callSessionRepository.saveAndFlush(any(CallSession.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        doAnswer(invocation -> {
            invocation.getArgument(0, Runnable.class).run();
            return null;
        }).when(afterCommitExecutor).execute(any(Runnable.class));

        userBlockService.blockUser("alice", 2L);

        verify(userBlockRepository).saveAndFlush(any(UserBlock.class));
        verify(friendshipRepository).delete(friendship);
        assertEquals(CallStatus.ENDED, call.getStatus());
        ArgumentCaptor<com.chatapp.dto.response.CallSignalResponse> signalCaptor =
                ArgumentCaptor.forClass(com.chatapp.dto.response.CallSignalResponse.class);
        verify(callRealtimeNotifier).notifyParticipants(signalCaptor.capture());
        assertEquals(CallSignalType.CALL_END, signalCaptor.getValue().eventType());
        assertEquals("alice", signalCaptor.getValue().fromUser().username());
    }

    @Test
    void blockCannotTargetTheCurrentUser() {
        User current = user(1L, "alice");
        when(userService.findByUsername("alice")).thenReturn(current);
        when(userService.findById(1L)).thenReturn(current);

        AppException exception = assertThrows(
                AppException.class,
                () -> userBlockService.blockUser("alice", 1L));

        assertEquals(ErrorCode.SELF_BLOCK_NOT_ALLOWED, exception.getErrorCode());
        verify(userBlockRepository, never()).saveAndFlush(any(UserBlock.class));
    }

    @Test
    void blockedPairCannotStartNewDirectInteractions() {
        User first = user(1L, "alice");
        User second = user(2L, "bob");
        when(userBlockRepository.existsBetweenUsers(1L, 2L)).thenReturn(true);

        AppException exception = assertThrows(
                AppException.class,
                () -> userBlockService.ensureNotBlocked(first, second));

        assertEquals(ErrorCode.USER_BLOCKED, exception.getErrorCode());
    }

    private static User user(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setFullName(username);
        user.setEmail(username + "@example.com");
        user.setPassword("encoded");
        user.setOnline(false);
        return user;
    }
}
