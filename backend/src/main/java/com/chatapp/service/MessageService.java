package com.chatapp.service;

import com.chatapp.dto.request.SendMessageRequest;
import com.chatapp.dto.request.SendRoomMessageRequest;
import com.chatapp.dto.response.MessagePageResponse;
import com.chatapp.dto.response.ReadReceiptResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.dto.response.UnreadCountResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.Message;
import com.chatapp.model.User;
import com.chatapp.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class MessageService {
    private static final int DEFAULT_PAGE_SIZE = 30;
    private static final int MAX_PAGE_SIZE = 100;

    private final MessageRepository messageRepository;
    private final UserService userService;
    private final ChatRoomService chatRoomService;
    private final FriendshipService friendshipService;

    @Transactional(readOnly = true)
    public MessagePageResponse getConversation(
            String currentUsername,
            Long otherUserId,
            Long before,
            Integer size
    ) {
        User currentUser = userService.findByUsername(currentUsername);
        User otherUser = userService.findById(otherUserId);

        if (currentUser.getId().equals(otherUser.getId())) {
            throw new AppException(ErrorCode.SELF_CONVERSATION_NOT_ALLOWED);
        }

        validateFriends(currentUser, otherUser);

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findConversationPage(
                currentUser.getId(),
                otherUser.getId(),
                before,
                PageRequest.of(0, pageSize + 1)
        );

        return toMessagePage(messages, pageSize);
    }

    @Transactional(readOnly = true)
    public List<UnreadCountResponse> getUnreadCounts(String currentUsername) {
        User currentUser = userService.findByUsername(currentUsername);

        return messageRepository.countUnreadMessagesGroupedBySender(currentUser.getId())
                .stream()
                .map(count -> new UnreadCountResponse(count.getUserId(), count.getUnreadCount()))
                .toList();
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getRoomMessages(String currentUsername, Long roomId, Long before, Integer size) {
        chatRoomService.findGroupRoomForMember(currentUsername, roomId);

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findRoomMessagePage(
                roomId,
                before,
                PageRequest.of(0, pageSize + 1)
        );

        return toMessagePage(messages, pageSize);
    }

    @Transactional
    public MessageResponse sendMessage(String currentUsername, SendMessageRequest request) {
        User sender = userService.findByUsername(currentUsername);
        User receiver = userService.findById(request.receiverId());
        String clientId = normalizeClientId(request.clientId());

        if (sender.getId().equals(receiver.getId())) {
            throw new AppException(ErrorCode.SELF_MESSAGE_NOT_ALLOWED);
        }

        validateFriends(sender, receiver);

        if (clientId != null) {
            return messageRepository.findBySenderIdAndClientId(sender.getId(), clientId)
                    .map(MessageResponse::from)
                    .orElseGet(() -> saveMessage(sender, receiver, request.content(), clientId));
        }

        return saveMessage(sender, receiver, request.content(), null);
    }

    @Transactional
    public MessageResponse sendRoomMessage(
            String currentUsername,
            Long roomId,
            SendRoomMessageRequest request
    ) {
        User sender = userService.findByUsername(currentUsername);
        ChatRoom room = chatRoomService.findGroupRoomForMember(sender, roomId);
        String clientId = normalizeClientId(request.clientId());

        if (clientId != null) {
            return messageRepository.findBySenderIdAndClientId(sender.getId(), clientId)
                    .map(MessageResponse::from)
                    .orElseGet(() -> saveRoomMessage(sender, room, request.content(), clientId));
        }

        return saveRoomMessage(sender, room, request.content(), null);
    }

    private MessageResponse saveMessage(User sender, User receiver, String content, String clientId) {
        Message message = new Message();
        message.setSender(sender);
        message.setReceiver(receiver);
        message.setContent(content.trim());
        message.setClientId(clientId);
        message.setRead(false);

        Message savedMessage = messageRepository.saveAndFlush(message);
        return MessageResponse.from(savedMessage);
    }

    private MessageResponse saveRoomMessage(User sender, ChatRoom room, String content, String clientId) {
        Message message = new Message();
        message.setSender(sender);
        message.setChatRoom(room);
        message.setContent(content.trim());
        message.setClientId(clientId);
        message.setRead(false);

        Message savedMessage = messageRepository.saveAndFlush(message);
        return MessageResponse.from(savedMessage);
    }

    private String normalizeClientId(String clientId) {
        if (!StringUtils.hasText(clientId)) {
            return null;
        }

        return clientId.trim();
    }

    private void validateFriends(User firstUser, User secondUser) {
        if (!friendshipService.areFriends(firstUser, secondUser)) {
            throw new AppException(ErrorCode.FRIENDSHIP_REQUIRED);
        }
    }

    private int normalizePageSize(Integer size) {
        if (size == null) {
            return DEFAULT_PAGE_SIZE;
        }

        return Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
    }

    private MessagePageResponse toMessagePage(List<Message> newestFirstMessages, int pageSize) {
        boolean hasMore = newestFirstMessages.size() > pageSize;
        List<Message> pageMessages = hasMore
                ? newestFirstMessages.subList(0, pageSize)
                : newestFirstMessages;

        List<MessageResponse> items = pageMessages.stream()
                .sorted(Comparator.comparing(Message::getId))
                .map(MessageResponse::from)
                .toList();
        Long nextBefore = hasMore && !items.isEmpty() ? items.get(0).id() : null;

        return new MessagePageResponse(items, hasMore, nextBefore);
    }

    @Transactional
    public ReadReceiptResponse markConversationAsRead(String currentUsername, Long senderId) {
        User reader = userService.findByUsername(currentUsername);
        User sender = userService.findById(senderId);

        if (reader.getId().equals(sender.getId())) {
            throw new AppException(ErrorCode.SELF_CONVERSATION_NOT_ALLOWED);
        }

        int readCount = messageRepository.markConversationAsRead(sender.getId(), reader.getId());
        return new ReadReceiptResponse(reader.getId(), sender.getId(), readCount);
    }
}
