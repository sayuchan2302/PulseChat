package com.chatapp.service;

import com.chatapp.dto.response.PresenceResponse;
import com.chatapp.model.Friendship.FriendshipStatus;
import com.chatapp.repository.ChatRoomRepository;
import com.chatapp.repository.FriendshipRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Fans presence updates out to the users allowed to see them (the subject themselves,
 * their accepted friends and their room co-participants) instead of broadcasting to a
 * shared topic where any authenticated subscriber could track everyone's online state.
 */
@Service
@RequiredArgsConstructor
public class PresenceService {
    private static final String PRESENCE_QUEUE = "/queue/presence";

    private final FriendshipRepository friendshipRepository;
    private final ChatRoomRepository chatRoomRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public void broadcast(PresenceResponse presence) {
        Set<String> recipients = new LinkedHashSet<>();
        recipients.add(presence.username());
        recipients.addAll(friendshipRepository.findAcceptedReceiverUsernames(
                presence.userId(), FriendshipStatus.ACCEPTED));
        recipients.addAll(friendshipRepository.findAcceptedRequesterUsernames(
                presence.userId(), FriendshipStatus.ACCEPTED));
        recipients.addAll(chatRoomRepository.findCoParticipantUsernames(presence.userId()));

        recipients.removeIf(username -> username == null || username.isBlank());
        recipients.forEach(username ->
                messagingTemplate.convertAndSendToUser(username, PRESENCE_QUEUE, presence));
    }
}
