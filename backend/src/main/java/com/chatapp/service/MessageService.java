package com.chatapp.service;

import com.chatapp.dto.request.SendMessageRequest;
import com.chatapp.dto.response.ReadReceiptResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.dto.response.UnreadCountResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.Message;
import com.chatapp.model.User;
import com.chatapp.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class MessageService {
    private final MessageRepository messageRepository;
    private final UserService userService;

    @Transactional(readOnly = true)
    public List<MessageResponse> getConversation(String currentUsername, Long otherUserId) {
        User currentUser = userService.findByUsername(currentUsername);
        User otherUser = userService.findById(otherUserId);

        if (currentUser.getId().equals(otherUser.getId())) {
            throw new AppException(ErrorCode.SELF_CONVERSATION_NOT_ALLOWED);
        }

        return messageRepository.findConversation(currentUser.getId(), otherUser.getId())
                .stream()
                .map(MessageResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<UnreadCountResponse> getUnreadCounts(String currentUsername) {
        User currentUser = userService.findByUsername(currentUsername);

        return messageRepository.countUnreadMessagesGroupedBySender(currentUser.getId())
                .stream()
                .map(count -> new UnreadCountResponse(count.getUserId(), count.getUnreadCount()))
                .toList();
    }

    @Transactional
    public MessageResponse sendMessage(String currentUsername, SendMessageRequest request) {
        User sender = userService.findByUsername(currentUsername);
        User receiver = userService.findById(request.receiverId());

        if (sender.getId().equals(receiver.getId())) {
            throw new AppException(ErrorCode.SELF_MESSAGE_NOT_ALLOWED);
        }

        Message message = new Message();
        message.setSender(sender);
        message.setReceiver(receiver);
        message.setContent(request.content().trim());
        message.setRead(false);

        Message savedMessage = messageRepository.saveAndFlush(message);
        return MessageResponse.from(savedMessage);
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
