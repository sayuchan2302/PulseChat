package com.chatapp.service;

import com.chatapp.dto.response.PresenceResponse;
import com.chatapp.model.Friendship.FriendshipStatus;
import com.chatapp.repository.ChatRoomRepository;
import com.chatapp.repository.FriendshipRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PresenceServiceTest {

    @Mock
    private FriendshipRepository friendshipRepository;

    @Mock
    private ChatRoomRepository chatRoomRepository;

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @InjectMocks
    private PresenceService presenceService;

    @Test
    void broadcastsPresenceToSubjectFriendsAndCoParticipantsOnceEach() {
        PresenceResponse presence = new PresenceResponse(1L, "sayu", true, LocalDateTime.of(2026, 8, 1, 10, 0));
        when(friendshipRepository.findAcceptedReceiverUsernames(1L, FriendshipStatus.ACCEPTED))
                .thenReturn(List.of("alice", "bob"));
        when(friendshipRepository.findAcceptedRequesterUsernames(1L, FriendshipStatus.ACCEPTED))
                .thenReturn(List.of("charlie"));
        when(chatRoomRepository.findCoParticipantUsernames(1L))
                .thenReturn(List.of("bob", "dave"));

        presenceService.broadcast(presence);

        for (String username : List.of("sayu", "alice", "bob", "charlie", "dave")) {
            verify(messagingTemplate, times(1)).convertAndSendToUser(username, "/queue/presence", presence);
        }
        verifyNoMoreInteractions(messagingTemplate);
    }

    @Test
    void skipsBlankRecipientUsernames() {
        PresenceResponse presence = new PresenceResponse(1L, "sayu", false, LocalDateTime.of(2026, 8, 1, 10, 0));
        when(friendshipRepository.findAcceptedReceiverUsernames(1L, FriendshipStatus.ACCEPTED))
                .thenReturn(List.of(" ", "alice"));
        when(friendshipRepository.findAcceptedRequesterUsernames(1L, FriendshipStatus.ACCEPTED))
                .thenReturn(List.of());
        when(chatRoomRepository.findCoParticipantUsernames(1L)).thenReturn(List.of());

        presenceService.broadcast(presence);

        verify(messagingTemplate, times(1)).convertAndSendToUser("sayu", "/queue/presence", presence);
        verify(messagingTemplate, times(1)).convertAndSendToUser("alice", "/queue/presence", presence);
        verifyNoMoreInteractions(messagingTemplate);
    }
}
