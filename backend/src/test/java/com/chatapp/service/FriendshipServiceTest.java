package com.chatapp.service;

import com.chatapp.dto.request.CreateFriendRequest;
import com.chatapp.dto.response.UserResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.Friendship;
import com.chatapp.model.Friendship.FriendshipStatus;
import com.chatapp.model.Message;
import com.chatapp.model.User;
import com.chatapp.repository.FriendshipRepository;
import com.chatapp.repository.MessageRepository;
import com.chatapp.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FriendshipServiceTest {
    @Mock
    private FriendshipRepository friendshipRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private MessageRepository messageRepository;

    @Mock
    private UserService userService;

    @InjectMocks
    private FriendshipService friendshipService;

    @Test
    void sendRequestCreatesPendingFriendshipForNormalizedPair() {
        User requester = user(3L, "sayu");
        User receiver = user(7L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(requester);
        when(userService.findById(receiver.getId())).thenReturn(receiver);
        when(friendshipRepository.findByUserLowIdAndUserHighId(3L, 7L)).thenReturn(Optional.empty());
        when(friendshipRepository.saveAndFlush(any(Friendship.class))).thenAnswer(invocation -> {
            Friendship friendship = invocation.getArgument(0);
            friendship.setId(10L);
            return friendship;
        });

        friendshipService.sendRequest("sayu", new CreateFriendRequest(receiver.getId()));

        verify(friendshipRepository).saveAndFlush(any(Friendship.class));
    }

    @Test
    void sendRequestRejectsSelfRequest() {
        User requester = user(3L, "sayu");
        when(userService.findByUsername("sayu")).thenReturn(requester);
        when(userService.findById(requester.getId())).thenReturn(requester);

        AppException exception = assertThrows(
                AppException.class,
                () -> friendshipService.sendRequest("sayu", new CreateFriendRequest(requester.getId()))
        );

        assertEquals(ErrorCode.SELF_FRIEND_REQUEST_NOT_ALLOWED, exception.getErrorCode());
        verify(friendshipRepository, never()).saveAndFlush(any(Friendship.class));
    }

    @Test
    void sendRequestRejectsExistingPendingRequest() {
        User requester = user(3L, "sayu");
        User receiver = user(7L, "thinh");
        Friendship pendingFriendship = friendship(requester, receiver, FriendshipStatus.PENDING);
        when(userService.findByUsername("sayu")).thenReturn(requester);
        when(userService.findById(receiver.getId())).thenReturn(receiver);
        when(friendshipRepository.findByUserLowIdAndUserHighId(3L, 7L))
                .thenReturn(Optional.of(pendingFriendship));

        AppException exception = assertThrows(
                AppException.class,
                () -> friendshipService.sendRequest("sayu", new CreateFriendRequest(receiver.getId()))
        );

        assertEquals(ErrorCode.FRIENDSHIP_ALREADY_PENDING, exception.getErrorCode());
        verify(friendshipRepository, never()).saveAndFlush(any(Friendship.class));
    }

    @Test
    void sendRequestCanReuseDeclinedFriendshipWithNewDirection() {
        User previousRequester = user(3L, "sayu");
        User newRequester = user(7L, "thinh");
        Friendship declinedFriendship = friendship(previousRequester, newRequester, FriendshipStatus.DECLINED);
        when(userService.findByUsername("thinh")).thenReturn(newRequester);
        when(userService.findById(previousRequester.getId())).thenReturn(previousRequester);
        when(friendshipRepository.findByUserLowIdAndUserHighId(3L, 7L))
                .thenReturn(Optional.of(declinedFriendship));
        when(friendshipRepository.saveAndFlush(any(Friendship.class))).thenAnswer(invocation -> invocation.getArgument(0));

        friendshipService.sendRequest("thinh", new CreateFriendRequest(previousRequester.getId()));

        assertSame(newRequester, declinedFriendship.getRequester());
        assertSame(previousRequester, declinedFriendship.getReceiver());
        assertEquals(FriendshipStatus.PENDING, declinedFriendship.getStatus());
    }

    @Test
    void acceptRequestRequiresReceiver() {
        User requester = user(3L, "sayu");
        User receiver = user(7L, "thinh");
        Friendship pendingFriendship = friendship(requester, receiver, FriendshipStatus.PENDING);
        pendingFriendship.setId(99L);
        when(userService.findByUsername("sayu")).thenReturn(requester);
        when(friendshipRepository.findById(99L)).thenReturn(Optional.of(pendingFriendship));

        AppException exception = assertThrows(
                AppException.class,
                () -> friendshipService.acceptRequest("sayu", 99L)
        );

        assertEquals(ErrorCode.FRIENDSHIP_ACCESS_DENIED, exception.getErrorCode());
    }

    @Test
    void acceptRequestMarksPendingFriendshipAccepted() {
        User requester = user(3L, "sayu");
        User receiver = user(7L, "thinh");
        Friendship pendingFriendship = friendship(requester, receiver, FriendshipStatus.PENDING);
        pendingFriendship.setId(99L);
        when(userService.findByUsername("thinh")).thenReturn(receiver);
        when(friendshipRepository.findById(99L)).thenReturn(Optional.of(pendingFriendship));
        when(friendshipRepository.saveAndFlush(any(Friendship.class))).thenAnswer(invocation -> invocation.getArgument(0));

        friendshipService.acceptRequest("thinh", 99L);

        assertEquals(FriendshipStatus.ACCEPTED, pendingFriendship.getStatus());
    }

    @Test
    void cancelRequestRequiresRequester() {
        User requester = user(3L, "sayu");
        User receiver = user(7L, "thinh");
        Friendship pendingFriendship = friendship(requester, receiver, FriendshipStatus.PENDING);
        pendingFriendship.setId(99L);
        when(userService.findByUsername("thinh")).thenReturn(receiver);
        when(friendshipRepository.findById(99L)).thenReturn(Optional.of(pendingFriendship));

        AppException exception = assertThrows(
                AppException.class,
                () -> friendshipService.cancelRequest("thinh", 99L)
        );

        assertEquals(ErrorCode.FRIENDSHIP_ACCESS_DENIED, exception.getErrorCode());
        verify(friendshipRepository, never()).delete(any(Friendship.class));
    }

    @Test
    void areFriendsChecksAcceptedNormalizedPair() {
        User firstUser = user(7L, "thinh");
        User secondUser = user(3L, "sayu");
        when(friendshipRepository.existsByUserLowIdAndUserHighIdAndStatus(
                3L,
                7L,
                FriendshipStatus.ACCEPTED
        )).thenReturn(true);

        assertTrue(friendshipService.areFriends(firstUser, secondUser));
    }

    @Test
    void listFriendsIncludesLatestMessageAndSortsByRecentConversation() {
        User currentUser = user(1L, "sayu");
        User alpha = user(2L, "alpha");
        User beta = user(3L, "beta");
        Friendship alphaFriendship = friendship(currentUser, alpha, FriendshipStatus.ACCEPTED);
        Friendship betaFriendship = friendship(beta, currentUser, FriendshipStatus.ACCEPTED);
        Message olderMessage = message(10L, alpha, currentUser, "Older message", LocalDateTime.of(2026, 8, 1, 10, 0));
        Message newerMessage = message(11L, currentUser, beta, "Newest message", LocalDateTime.of(2026, 8, 1, 11, 0));
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(friendshipRepository.findFriendshipsForUserByStatus(1L, FriendshipStatus.ACCEPTED))
                .thenReturn(List.of(alphaFriendship, betaFriendship));
        when(messageRepository.findLatestMessagesForPrivateConversations(1L, List.of(2L, 3L)))
                .thenReturn(List.of(olderMessage, newerMessage));

        List<UserResponse> responses = friendshipService.listFriends("sayu");

        assertEquals(List.of("beta", "alpha"), responses.stream().map(UserResponse::username).toList());
        assertEquals("Newest message", responses.get(0).lastMessageContent());
        assertEquals(LocalDateTime.of(2026, 8, 1, 11, 0), responses.get(0).lastMessageAt());
        assertEquals(1L, responses.get(0).lastMessageSenderId());
        assertEquals("Older message", responses.get(1).lastMessageContent());
        assertEquals(2L, responses.get(1).lastMessageSenderId());
    }

    private User user(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setFullName(username);
        user.setEmail(username + "@example.com");
        user.setOnline(false);
        return user;
    }

    private Friendship friendship(User requester, User receiver, FriendshipStatus status) {
        Friendship friendship = new Friendship();
        friendship.setRequester(requester);
        friendship.setReceiver(receiver);
        friendship.setStatus(status);
        friendship.setUserLowId(Math.min(requester.getId(), receiver.getId()));
        friendship.setUserHighId(Math.max(requester.getId(), receiver.getId()));
        return friendship;
    }

    private Message message(Long id, User sender, User receiver, String content, LocalDateTime timestamp) {
        Message message = new Message();
        message.setId(id);
        message.setSender(sender);
        message.setReceiver(receiver);
        message.setContent(content);
        message.setTimestamp(timestamp);
        return message;
    }
}
