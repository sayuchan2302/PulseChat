package com.chatapp.service;

import com.chatapp.dto.response.GlobalMessageSearchItemResponse;
import com.chatapp.dto.response.GlobalMessageSearchPageResponse;
import com.chatapp.dto.response.MessagePageResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.dto.response.MessageSeenByResponse;
import com.chatapp.dto.response.UnreadCountResponse;
import com.chatapp.dto.response.UserResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.ChatRoomMember;
import com.chatapp.model.ConversationSetting;
import com.chatapp.model.Message;
import com.chatapp.model.Message.MessageType;
import com.chatapp.model.User;
import com.chatapp.repository.ChatRoomReadStateRepository;
import com.chatapp.repository.ConversationSettingRepository;
import com.chatapp.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MessageQueryService {
    private static final int DEFAULT_PAGE_SIZE = 30;
    private static final int MAX_PAGE_SIZE = 100;
    private static final List<MessageType> MEDIA_MESSAGE_TYPES = List.of(
            MessageType.IMAGE,
            MessageType.VIDEO,
            MessageType.AUDIO,
            MessageType.FILE);

    private final MessageRepository messageRepository;
    private final ChatRoomReadStateRepository chatRoomReadStateRepository;
    private final UserService userService;
    private final ChatRoomService chatRoomService;
    private final ConversationSettingRepository conversationSettingRepository;

    @Transactional(readOnly = true)
    public MessagePageResponse getConversation(String username, Long otherUserId, Long before, Integer size) {
        PrivateConversationParticipants participants = findPrivateConversationParticipants(username, otherUserId);
        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findConversationPage(
                participants.currentUser().getId(),
                participants.otherUser().getId(),
                before,
                privateClearedAt(participants),
                PageRequest.of(0, pageSize + 1));

        return MessagePageAssembler.fromNewestFirst(
                messages, pageSize, participants.currentUser().getId());
    }

    @Transactional(readOnly = true)
    public List<UnreadCountResponse> getUnreadCounts(String username) {
        User currentUser = userService.findByUsername(username);
        return messageRepository.countUnreadMessagesGroupedBySender(currentUser.getId())
                .stream()
                .map(count -> new UnreadCountResponse(count.getUserId(), count.getUnreadCount()))
                .toList();
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getRoomMessages(String username, Long roomId, Long before, Integer size) {
        chatRoomService.findGroupRoomForMember(username, roomId);
        Long currentUserId = userService.findByUsername(username).getId();
        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findRoomMessagePage(
                roomId, currentUserId, before, roomClearedAt(username, roomId), PageRequest.of(0, pageSize + 1));

        return MessagePageAssembler.fromNewestFirst(messages, pageSize, currentUserId);
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getConversationMedia(String username, Long otherUserId, Long before, Integer size) {
        PrivateConversationParticipants participants = findPrivateConversationParticipants(username, otherUserId);
        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findConversationMediaPage(
                participants.currentUser().getId(), participants.otherUser().getId(), MEDIA_MESSAGE_TYPES,
                before, privateClearedAt(participants), PageRequest.of(0, pageSize + 1));

        return MessagePageAssembler.galleryFromNewestFirst(messages, pageSize,
                participants.currentUser().getId());
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getConversationLinks(String username, Long otherUserId, Long before, Integer size) {
        PrivateConversationParticipants participants = findPrivateConversationParticipants(username, otherUserId);
        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findConversationLinkPage(
                participants.currentUser().getId(), participants.otherUser().getId(),
                before, privateClearedAt(participants), PageRequest.of(0, pageSize + 1));

        return MessagePageAssembler.galleryFromNewestFirst(messages, pageSize,
                participants.currentUser().getId());
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getRoomMedia(String username, Long roomId, Long before, Integer size) {
        chatRoomService.findGroupRoomForMember(username, roomId);
        Long currentUserId = userService.findByUsername(username).getId();
        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findRoomMediaPage(
                roomId, MEDIA_MESSAGE_TYPES, currentUserId, before, roomClearedAt(username, roomId),
                PageRequest.of(0, pageSize + 1));

        return MessagePageAssembler.galleryFromNewestFirst(messages, pageSize, currentUserId);
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getRoomLinks(String username, Long roomId, Long before, Integer size) {
        chatRoomService.findGroupRoomForMember(username, roomId);
        Long currentUserId = userService.findByUsername(username).getId();
        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findRoomLinkPage(
                roomId, currentUserId, before, roomClearedAt(username, roomId), PageRequest.of(0, pageSize + 1));

        return MessagePageAssembler.galleryFromNewestFirst(messages, pageSize, currentUserId);
    }

    @Transactional(readOnly = true)
    public MessagePageResponse searchConversation(
            String username, Long otherUserId, String query, Long before, Integer size) {
        PrivateConversationParticipants participants = findPrivateConversationParticipants(username, otherUserId);
        String queryPattern = normalizeSearchPattern(query);
        if (queryPattern == null) {
            return MessagePageAssembler.emptyPage();
        }

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findConversationSearchPage(
                participants.currentUser().getId(), participants.otherUser().getId(), queryPattern,
                before, privateClearedAt(participants), PageRequest.of(0, pageSize + 1));

        return MessagePageAssembler.galleryFromNewestFirst(messages, pageSize,
                participants.currentUser().getId());
    }

    @Transactional(readOnly = true)
    public MessagePageResponse searchRoom(String username, Long roomId, String query, Long before, Integer size) {
        chatRoomService.findGroupRoomForMember(username, roomId);
        Long currentUserId = userService.findByUsername(username).getId();
        String queryPattern = normalizeSearchPattern(query);
        if (queryPattern == null) {
            return MessagePageAssembler.emptyPage();
        }

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findRoomSearchPage(
                roomId, queryPattern, currentUserId, before, roomClearedAt(username, roomId),
                PageRequest.of(0, pageSize + 1));

        return MessagePageAssembler.galleryFromNewestFirst(messages, pageSize, currentUserId);
    }

    @Transactional(readOnly = true)
    public GlobalMessageSearchPageResponse searchAllConversations(
            String username, String query, Long before, Integer size) {
        User currentUser = userService.findByUsername(username);
        String queryPattern = normalizeSearchPattern(query);
        if (queryPattern == null) {
            return new GlobalMessageSearchPageResponse(List.of(), false, null);
        }

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findGlobalSearchPage(
                currentUser.getId(), queryPattern, before, PageRequest.of(0, pageSize + 1));
        boolean hasMore = messages.size() > pageSize;
        List<Message> page = hasMore ? messages.subList(0, pageSize) : messages;
        List<GlobalMessageSearchItemResponse> items = page.stream()
                .map(message -> toGlobalSearchItem(message, currentUser.getId()))
                .toList();
        Long nextBefore = hasMore && !page.isEmpty() ? page.get(page.size() - 1).getId() : null;
        return new GlobalMessageSearchPageResponse(items, hasMore, nextBefore);
    }

    private GlobalMessageSearchItemResponse toGlobalSearchItem(Message message, Long currentUserId) {
        if (message.getChatRoom() != null) {
            ChatRoom room = message.getChatRoom();
            return new GlobalMessageSearchItemResponse(
                    MessageResponse.from(message, currentUserId), room.getName(), null, null, room.getId());
        }

        User otherUser = message.getSender().getId().equals(currentUserId)
                ? message.getReceiver()
                : message.getSender();
        String fullName = otherUser.getFullName();
        String conversationName = fullName == null || fullName.isBlank() ? otherUser.getUsername() : fullName;
        return new GlobalMessageSearchItemResponse(
                MessageResponse.from(message, currentUserId), conversationName,
                otherUser.getId(), otherUser.getUsername(), null);
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getConversationAroundMessage(
            String username, Long otherUserId, Long messageId, Integer size) {
        PrivateConversationParticipants participants = findPrivateConversationParticipants(username, otherUserId);
        Message anchorMessage = messageRepository.findConversationMessageById(
                participants.currentUser().getId(), participants.otherUser().getId(), messageId)
                .orElseThrow(() -> new AppException(ErrorCode.MESSAGE_NOT_FOUND));
        LocalDateTime clearedAt = privateClearedAt(participants);
        requireVisibleAfterClear(anchorMessage, clearedAt);

        return MessagePageAssembler.aroundAnchor(
                anchorMessage,
                normalizePageSize(size),
                participants.currentUser().getId(),
                (anchorId, pageable) -> messageRepository.findConversationMessagesBefore(
                        participants.currentUser().getId(), participants.otherUser().getId(), anchorId, clearedAt,
                        pageable),
                (anchorId, pageable) -> messageRepository.findConversationMessagesAfter(
                        participants.currentUser().getId(), participants.otherUser().getId(), anchorId, clearedAt,
                        pageable));
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getRoomAroundMessage(String username, Long roomId, Long messageId, Integer size) {
        chatRoomService.findGroupRoomForMember(username, roomId);
        Long currentUserId = userService.findByUsername(username).getId();
        Message anchorMessage = messageRepository.findRoomMessageById(roomId, messageId, currentUserId)
                .orElseThrow(() -> new AppException(ErrorCode.MESSAGE_NOT_FOUND));
        LocalDateTime clearedAt = roomClearedAt(username, roomId);
        requireVisibleAfterClear(anchorMessage, clearedAt);

        return MessagePageAssembler.aroundAnchor(
                anchorMessage,
                normalizePageSize(size),
                currentUserId,
                (anchorId, pageable) -> messageRepository.findRoomMessagesBefore(
                        roomId, anchorId, currentUserId, clearedAt, pageable),
                (anchorId, pageable) -> messageRepository.findRoomMessagesAfter(
                        roomId, anchorId, currentUserId, clearedAt, pageable));
    }

    @Transactional(readOnly = true)
    public MessageSeenByResponse getRoomMessageSeenBy(String username, Long roomId, Long messageId) {
        User currentUser = userService.findByUsername(username);
        ChatRoom room = chatRoomService.findGroupRoomForMember(currentUser, roomId);
        Message message = messageRepository.findRoomMessageById(room.getId(), messageId, currentUser.getId())
                .orElseThrow(() -> new AppException(ErrorCode.MESSAGE_NOT_FOUND));

        if (message.getTimestamp() == null) {
            return new MessageSeenByResponse(message.getId(), room.getId(), List.of());
        }

        Map<Long, ChatRoomMember> membersByUserId = room.getMembers().stream()
                .collect(Collectors.toMap(member -> member.getUser().getId(), member -> member));
        List<UserResponse> seenBy = chatRoomReadStateRepository
                .findByChatRoomIdAndLastReadAtGreaterThanEqualOrderByLastReadAtDesc(
                        room.getId(), message.getTimestamp())
                .stream()
                .filter(readState -> !readState.getUser().getId().equals(message.getSender().getId()))
                .map(readState -> membersByUserId.get(readState.getUser().getId()))
                .filter(Objects::nonNull)
                .map(UserResponse::from)
                .toList();

        return new MessageSeenByResponse(message.getId(), room.getId(), seenBy);
    }

    private PrivateConversationParticipants findPrivateConversationParticipants(String username, Long otherUserId) {
        User currentUser = userService.findByUsername(username);
        User otherUser = userService.findById(otherUserId);
        if (currentUser.getId().equals(otherUser.getId())) {
            throw new AppException(ErrorCode.SELF_CONVERSATION_NOT_ALLOWED);
        }
        return new PrivateConversationParticipants(currentUser, otherUser);
    }

    private LocalDateTime privateClearedAt(PrivateConversationParticipants participants) {
        return conversationSettingRepository
                .findByUserIdAndTargetUserId(participants.currentUser().getId(), participants.otherUser().getId())
                .map(ConversationSetting::getClearedAt)
                .orElse(null);
    }

    private LocalDateTime roomClearedAt(String username, Long roomId) {
        User currentUser = userService.findByUsername(username);
        return conversationSettingRepository.findByUserIdAndChatRoomId(currentUser.getId(), roomId)
                .map(ConversationSetting::getClearedAt)
                .orElse(null);
    }

    private void requireVisibleAfterClear(Message message, LocalDateTime clearedAt) {
        if (clearedAt != null && (message.getTimestamp() == null || !message.getTimestamp().isAfter(clearedAt))) {
            throw new AppException(ErrorCode.MESSAGE_NOT_FOUND);
        }
    }

    private int normalizePageSize(Integer size) {
        return size == null ? DEFAULT_PAGE_SIZE : Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
    }

    private String normalizeSearchPattern(String query) {
        return StringUtils.hasText(query) ? "%" + query.trim().toLowerCase() + "%" : null;
    }

    private record PrivateConversationParticipants(User currentUser, User otherUser) {
    }
}
