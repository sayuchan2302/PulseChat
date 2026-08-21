package com.chatapp.service;

import com.chatapp.dto.request.CreateFriendRequest;
import com.chatapp.dto.response.FriendshipResponse;
import com.chatapp.dto.response.FriendshipSummaryResponse;
import com.chatapp.dto.response.UserResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.Friendship;
import com.chatapp.model.Friendship.FriendshipStatus;
import com.chatapp.model.ConversationSetting;
import com.chatapp.model.Message;
import com.chatapp.model.User;
import com.chatapp.repository.ConversationSettingRepository;
import com.chatapp.repository.FriendshipRepository;
import com.chatapp.repository.MessageRepository;
import com.chatapp.repository.UserRepository;
import com.chatapp.util.MessagePreviewFormatter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class FriendshipService {
    private static final String STATUS_NONE = "none";
    private static final String STATUS_PENDING_INCOMING = "pending_incoming";
    private static final String STATUS_PENDING_OUTGOING = "pending_outgoing";
    private static final String STATUS_ACCEPTED = "accepted";
    private static final String STATUS_DECLINED = "declined";

    private final FriendshipRepository friendshipRepository;
    private final UserRepository userRepository;
    private final MessageRepository messageRepository;
    private final ConversationSettingRepository conversationSettingRepository;
    private final UserService userService;

    @Transactional(readOnly = true)
    public List<UserResponse> listFriends(String currentUsername) {
        User currentUser = userService.findByUsername(currentUsername);

        List<User> friends = friendshipRepository
                .findFriendshipsForUserByStatus(currentUser.getId(), FriendshipStatus.ACCEPTED)
                .stream()
                .map(friendship -> otherParticipant(friendship, currentUser))
                .toList();
        Map<Long, Message> latestMessagesByFriendId = findLatestMessagesByFriendId(currentUser, friends);
        Map<Long, ConversationSetting> settingsByFriendId = findSettingsByFriendId(currentUser, friends);

        return friends.stream()
                .map(friend -> toAcceptedFriendResponse(
                        friend,
                        latestMessagesByFriendId.get(friend.getId()),
                        settingsByFriendId.get(friend.getId())
                ))
                .sorted(FriendshipService::compareAcceptedFriendResponses)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<UserResponse> listPrivateConversations(String currentUsername) {
        User currentUser = userService.findByUsername(currentUsername);
        Map<Long, Friendship> friendshipsByUserId = friendshipRepository.findFriendshipsForUser(currentUser.getId())
                .stream()
                .collect(Collectors.toMap(
                        friendship -> otherParticipant(friendship, currentUser).getId(),
                        Function.identity()
                ));
        Map<Long, User> contactsById = new LinkedHashMap<>();

        friendshipsByUserId.values().stream()
                .filter(friendship -> friendship.getStatus() == FriendshipStatus.ACCEPTED)
                .map(friendship -> otherParticipant(friendship, currentUser))
                .forEach(friend -> contactsById.put(friend.getId(), friend));

        List<Long> conversationPartnerIds = messageRepository.findPrivateConversationPartnerIds(currentUser.getId())
                .stream()
                .filter(partnerId -> !partnerId.equals(currentUser.getId()))
                .toList();
        userRepository.findAllById(conversationPartnerIds)
                .forEach(partner -> contactsById.put(partner.getId(), partner));

        List<User> contacts = List.copyOf(contactsById.values());
        Map<Long, Message> latestMessagesByContactId = findLatestMessagesByFriendId(currentUser, contacts);
        Map<Long, ConversationSetting> settingsByContactId = findSettingsByFriendId(currentUser, contacts);

        return contacts.stream()
                .map(contact -> toConversationResponse(
                        currentUser,
                        contact,
                        friendshipsByUserId.get(contact.getId()),
                        latestMessagesByContactId.get(contact.getId()),
                        settingsByContactId.get(contact.getId())
                ))
                .sorted(FriendshipService::compareAcceptedFriendResponses)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<UserResponse> searchUsers(String currentUsername, String usernameQuery) {
        User currentUser = userService.findByUsername(currentUsername);
        String normalizedQuery = normalizeSearchQuery(usernameQuery);
        List<User> users = normalizedQuery.isBlank()
                ? userRepository.findAllByUsernameNotOrderByUsernameAsc(currentUsername)
                : userRepository.findAllByUsernameContainingIgnoreCaseAndUsernameNotOrderByUsernameAsc(
                        normalizedQuery,
                        currentUsername
                );

        return users
                .stream()
                .map(user -> toUserResponseWithFriendshipStatus(currentUser, user))
                .toList();
    }

    @Transactional(readOnly = true)
    public UserResponse getUserProfile(String currentUsername, String username) {
        User currentUser = userService.findByUsername(currentUsername);
        User profileUser = userService.findByUsername(username);
        if (currentUser.getId().equals(profileUser.getId())) {
            return UserResponse.from(profileUser, STATUS_NONE);
        }

        return toUserResponseWithFriendshipStatus(currentUser, profileUser);
    }

    @Transactional(readOnly = true)
    public List<FriendshipResponse> listIncomingRequests(String currentUsername) {
        return friendshipRepository
                .findByReceiverUsernameAndStatusOrderByUpdatedAtDesc(
                        currentUsername,
                        FriendshipStatus.PENDING
                )
                .stream()
                .map(FriendshipResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<FriendshipResponse> listOutgoingRequests(String currentUsername) {
        return friendshipRepository
                .findByRequesterUsernameAndStatusOrderByUpdatedAtDesc(
                        currentUsername,
                        FriendshipStatus.PENDING
                )
                .stream()
                .map(FriendshipResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public FriendshipSummaryResponse getSummary(String currentUsername) {
        return new FriendshipSummaryResponse(
                friendshipRepository.countByReceiverUsernameAndStatus(
                        currentUsername,
                        FriendshipStatus.PENDING
                ),
                friendshipRepository.countByRequesterUsernameAndStatus(
                        currentUsername,
                        FriendshipStatus.PENDING
                )
        );
    }

    @Transactional
    public FriendshipResponse sendRequest(String currentUsername, CreateFriendRequest request) {
        User requester = userService.findByUsername(currentUsername);
        User receiver = userService.findById(request.receiverId());
        validateNotSelf(requester, receiver);

        PairKey pairKey = pairKey(requester, receiver);
        Friendship friendship = friendshipRepository
                .findByUserLowIdAndUserHighId(pairKey.userLowId(), pairKey.userHighId())
                .map(existingFriendship -> updateExistingRequest(existingFriendship, requester, receiver))
                .orElseGet(() -> createRequest(requester, receiver, pairKey));

        return FriendshipResponse.from(friendshipRepository.saveAndFlush(friendship));
    }

    @Transactional
    public FriendshipResponse acceptRequest(String currentUsername, Long requestId) {
        User receiver = userService.findByUsername(currentUsername);
        Friendship friendship = findById(requestId);
        validateReceiver(friendship, receiver);
        validatePending(friendship);

        friendship.setStatus(FriendshipStatus.ACCEPTED);
        return FriendshipResponse.from(friendshipRepository.saveAndFlush(friendship));
    }

    @Transactional
    public FriendshipResponse declineRequest(String currentUsername, Long requestId) {
        User receiver = userService.findByUsername(currentUsername);
        Friendship friendship = findById(requestId);
        validateReceiver(friendship, receiver);
        validatePending(friendship);

        friendship.setStatus(FriendshipStatus.DECLINED);
        return FriendshipResponse.from(friendshipRepository.saveAndFlush(friendship));
    }

    @Transactional
    public FriendshipResponse cancelRequest(String currentUsername, Long requestId) {
        User requester = userService.findByUsername(currentUsername);
        Friendship friendship = findById(requestId);
        validateRequester(friendship, requester);
        validatePending(friendship);

        FriendshipResponse response = FriendshipResponse.from(friendship);
        friendshipRepository.delete(friendship);
        return response;
    }

    @Transactional(readOnly = true)
    public boolean areFriends(User firstUser, User secondUser) {
        PairKey pairKey = pairKey(firstUser, secondUser);
        return friendshipRepository.existsByUserLowIdAndUserHighIdAndStatus(
                pairKey.userLowId(),
                pairKey.userHighId(),
                FriendshipStatus.ACCEPTED
        );
    }

    private Friendship findById(Long requestId) {
        return friendshipRepository.findById(requestId)
                .orElseThrow(() -> new AppException(ErrorCode.FRIENDSHIP_NOT_FOUND));
    }

    private Friendship updateExistingRequest(Friendship friendship, User requester, User receiver) {
        if (friendship.getStatus() == FriendshipStatus.PENDING) {
            throw new AppException(ErrorCode.FRIENDSHIP_ALREADY_PENDING);
        }

        if (friendship.getStatus() == FriendshipStatus.ACCEPTED) {
            throw new AppException(ErrorCode.FRIENDSHIP_ALREADY_ACCEPTED);
        }

        friendship.setRequester(requester);
        friendship.setReceiver(receiver);
        friendship.setStatus(FriendshipStatus.PENDING);
        return friendship;
    }

    private Friendship createRequest(User requester, User receiver, PairKey pairKey) {
        Friendship friendship = new Friendship();
        friendship.setRequester(requester);
        friendship.setReceiver(receiver);
        friendship.setStatus(FriendshipStatus.PENDING);
        friendship.setUserLowId(pairKey.userLowId());
        friendship.setUserHighId(pairKey.userHighId());
        return friendship;
    }

    private UserResponse toUserResponseWithFriendshipStatus(User currentUser, User otherUser) {
        PairKey pairKey = pairKey(currentUser, otherUser);

        return friendshipRepository
                .findByUserLowIdAndUserHighId(pairKey.userLowId(), pairKey.userHighId())
                .map(friendship -> UserResponse.from(
                        otherUser,
                        toFriendshipStatus(currentUser, friendship),
                        friendship.getId()
                ))
                .orElseGet(() -> UserResponse.from(otherUser, STATUS_NONE));
    }

    private Map<Long, Message> findLatestMessagesByFriendId(User currentUser, List<User> friends) {
        if (friends.isEmpty()) {
            return Map.of();
        }

        List<Long> friendIds = friends.stream()
                .map(User::getId)
                .toList();

        return messageRepository
                .findLatestMessagesForPrivateConversations(currentUser.getId(), friendIds)
                .stream()
                .collect(Collectors.toMap(
                        message -> getConversationFriendId(message, currentUser.getId()),
                        Function.identity(),
                        FriendshipService::newerMessage
                ));
    }

    private Map<Long, ConversationSetting> findSettingsByFriendId(User currentUser, List<User> friends) {
        if (friends.isEmpty()) {
            return Map.of();
        }

        List<Long> friendIds = friends.stream()
                .map(User::getId)
                .toList();

        List<ConversationSetting> settings =
                conversationSettingRepository.findByUserIdAndTargetUserIdIn(currentUser.getId(), friendIds);
        if (settings == null || settings.isEmpty()) {
            return Map.of();
        }

        return settings.stream()
                .collect(Collectors.toMap(setting -> setting.getTargetUser().getId(), Function.identity()));
    }

    private UserResponse toAcceptedFriendResponse(
            User friend,
            Message lastMessage,
            ConversationSetting setting
    ) {
        if (lastMessage == null) {
            return UserResponse.from(friend, STATUS_ACCEPTED, null, null, null, null, setting);
        }

        return UserResponse.from(
                friend,
                STATUS_ACCEPTED,
                null,
                MessagePreviewFormatter.previewContent(lastMessage),
                lastMessage.getTimestamp(),
                lastMessage.getSender().getId(),
                setting
        );
    }

    private UserResponse toConversationResponse(
            User currentUser,
            User contact,
            Friendship friendship,
            Message lastMessage,
            ConversationSetting setting
    ) {
        String friendshipStatus = friendship == null ? STATUS_NONE : toFriendshipStatus(currentUser, friendship);
        Long friendshipId = friendship == null ? null : friendship.getId();
        if (lastMessage == null) {
            return UserResponse.from(contact, friendshipStatus, friendshipId, null, null, null, setting);
        }

        return UserResponse.from(
                contact,
                friendshipStatus,
                friendshipId,
                MessagePreviewFormatter.previewContent(lastMessage),
                lastMessage.getTimestamp(),
                lastMessage.getSender().getId(),
                setting
        );
    }

    private static Long getConversationFriendId(Message message, Long currentUserId) {
        return message.getSender().getId().equals(currentUserId)
                ? message.getReceiver().getId()
                : message.getSender().getId();
    }

    private static Message newerMessage(Message firstMessage, Message secondMessage) {
        return firstMessage.getId() >= secondMessage.getId() ? firstMessage : secondMessage;
    }

    private static int compareAcceptedFriendResponses(UserResponse firstResponse, UserResponse secondResponse) {
        if (!firstResponse.pinned().equals(secondResponse.pinned())) {
            return Boolean.TRUE.equals(firstResponse.pinned()) ? -1 : 1;
        }

        if (firstResponse.lastMessageAt() != null && secondResponse.lastMessageAt() != null) {
            int latestMessageComparison = secondResponse.lastMessageAt().compareTo(firstResponse.lastMessageAt());
            if (latestMessageComparison != 0) {
                return latestMessageComparison;
            }
        } else if (firstResponse.lastMessageAt() != null) {
            return -1;
        } else if (secondResponse.lastMessageAt() != null) {
            return 1;
        }

        return String.CASE_INSENSITIVE_ORDER.compare(firstResponse.username(), secondResponse.username());
    }

    private String toFriendshipStatus(User currentUser, Friendship friendship) {
        return switch (friendship.getStatus()) {
            case ACCEPTED -> STATUS_ACCEPTED;
            case DECLINED -> STATUS_DECLINED;
            case PENDING -> friendship.getRequester().getId().equals(currentUser.getId())
                    ? STATUS_PENDING_OUTGOING
                    : STATUS_PENDING_INCOMING;
        };
    }

    private User otherParticipant(Friendship friendship, User currentUser) {
        return friendship.getRequester().getId().equals(currentUser.getId())
                ? friendship.getReceiver()
                : friendship.getRequester();
    }

    private void validateNotSelf(User requester, User receiver) {
        if (requester.getId().equals(receiver.getId())) {
            throw new AppException(ErrorCode.SELF_FRIEND_REQUEST_NOT_ALLOWED);
        }
    }

    private void validateReceiver(Friendship friendship, User currentUser) {
        if (!friendship.getReceiver().getId().equals(currentUser.getId())) {
            throw new AppException(ErrorCode.FRIENDSHIP_ACCESS_DENIED);
        }
    }

    private void validateRequester(Friendship friendship, User currentUser) {
        if (!friendship.getRequester().getId().equals(currentUser.getId())) {
            throw new AppException(ErrorCode.FRIENDSHIP_ACCESS_DENIED);
        }
    }

    private void validatePending(Friendship friendship) {
        if (friendship.getStatus() != FriendshipStatus.PENDING) {
            throw new AppException(ErrorCode.FRIENDSHIP_NOT_PENDING);
        }
    }

    private PairKey pairKey(User firstUser, User secondUser) {
        Long firstUserId = firstUser.getId();
        Long secondUserId = secondUser.getId();

        return firstUserId < secondUserId
                ? new PairKey(firstUserId, secondUserId)
                : new PairKey(secondUserId, firstUserId);
    }

    private String normalizeSearchQuery(String query) {
        return query == null ? "" : query.trim();
    }

    private record PairKey(Long userLowId, Long userHighId) {
    }
}
