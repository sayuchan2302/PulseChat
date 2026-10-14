package com.chatapp.service;

import com.chatapp.dto.request.CallSignalRequest.CallSignalType;
import com.chatapp.dto.response.CallSignalResponse;
import com.chatapp.dto.response.UserResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.CallSession;
import com.chatapp.model.CallSession.CallStatus;
import com.chatapp.model.Friendship;
import com.chatapp.model.User;
import com.chatapp.model.UserBlock;
import com.chatapp.repository.CallSessionRepository;
import com.chatapp.repository.FriendshipRepository;
import com.chatapp.repository.UserBlockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class UserBlockService {
    private static final List<CallStatus> ACTIVE_CALL_STATUSES = List.of(CallStatus.RINGING, CallStatus.ACCEPTED);

    private final UserBlockRepository userBlockRepository;
    private final FriendshipRepository friendshipRepository;
    private final CallSessionRepository callSessionRepository;
    private final UserService userService;
    private final CallRealtimeNotifier callRealtimeNotifier;

    @Transactional(readOnly = true)
    public List<UserResponse> listBlockedUsers(String currentUsername) {
        User blocker = userService.findByUsername(currentUsername);
        return userBlockRepository.findByBlockerIdOrderByCreatedAtDesc(blocker.getId()).stream()
                .map(userBlock -> UserResponse.from(userBlock.getBlockedUser(), "none"))
                .toList();
    }

    @Transactional
    public UserResponse blockUser(String currentUsername, Long blockedUserId) {
        User blocker = userService.findByUsername(currentUsername);
        User blockedUser = userService.findById(blockedUserId);
        if (blocker.getId().equals(blockedUser.getId())) {
            throw new AppException(ErrorCode.SELF_BLOCK_NOT_ALLOWED);
        }

        if (userBlockRepository.findByBlockerIdAndBlockedUserId(blocker.getId(), blockedUser.getId()).isEmpty()) {
            UserBlock userBlock = new UserBlock();
            userBlock.setBlocker(blocker);
            userBlock.setBlockedUser(blockedUser);
            userBlockRepository.saveAndFlush(userBlock);
        }

        long userLowId = Math.min(blocker.getId(), blockedUser.getId());
        long userHighId = Math.max(blocker.getId(), blockedUser.getId());
        friendshipRepository.findByUserLowIdAndUserHighId(userLowId, userHighId)
                .ifPresent(friendshipRepository::delete);

        terminateActiveCalls(blocker, blockedUser);
        return UserResponse.from(blockedUser, "none");
    }

    @Transactional
    public void unblockUser(String currentUsername, Long blockedUserId) {
        User blocker = userService.findByUsername(currentUsername);
        User blockedUser = userService.findById(blockedUserId);
        userBlockRepository.findByBlockerIdAndBlockedUserId(blocker.getId(), blockedUser.getId())
                .ifPresent(userBlockRepository::delete);
    }

    @Transactional(readOnly = true)
    public void ensureNotBlocked(User firstUser, User secondUser) {
        if (userBlockRepository.existsBetweenUsers(firstUser.getId(), secondUser.getId())) {
            throw new AppException(ErrorCode.USER_BLOCKED);
        }
    }

    @Transactional(readOnly = true)
    public boolean isBlocked(User firstUser, User secondUser) {
        return userBlockRepository.existsBetweenUsers(firstUser.getId(), secondUser.getId());
    }

    private void terminateActiveCalls(User blocker, User blockedUser) {
        for (CallSession callSession : callSessionRepository.findActiveCallsBetweenUsers(
                blocker.getId(), blockedUser.getId(), ACTIVE_CALL_STATUSES)) {
            boolean wasRinging = callSession.getStatus() == CallStatus.RINGING;
            callSession.setStatus(wasRinging ? CallStatus.CANCELED : CallStatus.ENDED);
            if (callSession.getStartedAt() == null && !wasRinging) {
                callSession.setStartedAt(LocalDateTime.now());
            }
            callSession.setEndedAt(LocalDateTime.now());
            CallSession savedCall = callSessionRepository.saveAndFlush(callSession);
            callRealtimeNotifier.notifyParticipants(CallSignalResponse.from(
                    savedCall,
                    wasRinging ? CallSignalType.CALL_CANCEL : CallSignalType.CALL_END,
                    UserResponse.from(blocker),
                    null,
                    null,
                    null,
                    null));
        }
    }
}
