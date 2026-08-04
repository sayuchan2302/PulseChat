package com.chatapp.controller;

import com.chatapp.dto.request.MessageReactionRequest;
import com.chatapp.dto.request.SendMessageRequest;
import com.chatapp.dto.response.MessagePageResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.dto.response.ReadReceiptResponse;
import com.chatapp.dto.response.UnreadCountResponse;
import com.chatapp.service.MessageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/messages")
@RequiredArgsConstructor
public class MessageController {
    private static final String MESSAGE_UPDATE_QUEUE = "/queue/message-updates";

    private final MessageService messageService;
    private final SimpMessagingTemplate messagingTemplate;

    @GetMapping("/unread-counts")
    public List<UnreadCountResponse> getUnreadCounts(Authentication authentication) {
        return messageService.getUnreadCounts(authentication.getName());
    }

    @GetMapping("/{userId}")
    public MessagePageResponse getConversation(
            Authentication authentication,
            @PathVariable Long userId,
            @RequestParam(required = false) Long before,
            @RequestParam(required = false) Integer size
    ) {
        return messageService.getConversation(authentication.getName(), userId, before, size);
    }

    @GetMapping("/{userId}/media")
    public MessagePageResponse getConversationMedia(
            Authentication authentication,
            @PathVariable Long userId,
            @RequestParam(required = false) Long before,
            @RequestParam(required = false) Integer size
    ) {
        return messageService.getConversationMedia(authentication.getName(), userId, before, size);
    }

    @GetMapping("/{userId}/links")
    public MessagePageResponse getConversationLinks(
            Authentication authentication,
            @PathVariable Long userId,
            @RequestParam(required = false) Long before,
            @RequestParam(required = false) Integer size
    ) {
        return messageService.getConversationLinks(authentication.getName(), userId, before, size);
    }

    @GetMapping("/{userId}/search")
    public MessagePageResponse searchConversation(
            Authentication authentication,
            @PathVariable Long userId,
            @RequestParam String query,
            @RequestParam(required = false) Long before,
            @RequestParam(required = false) Integer size
    ) {
        return messageService.searchConversation(authentication.getName(), userId, query, before, size);
    }

    @GetMapping("/{userId}/around/{messageId}")
    public MessagePageResponse getConversationAroundMessage(
            Authentication authentication,
            @PathVariable Long userId,
            @PathVariable Long messageId,
            @RequestParam(required = false) Integer size
    ) {
        return messageService.getConversationAroundMessage(authentication.getName(), userId, messageId, size);
    }

    @PatchMapping("/{userId}/read")
    public ReadReceiptResponse markConversationAsRead(Authentication authentication, @PathVariable Long userId) {
        return messageService.markConversationAsRead(authentication.getName(), userId);
    }

    @PostMapping
    public ResponseEntity<MessageResponse> sendMessage(
            Authentication authentication,
            @Valid @RequestBody SendMessageRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(messageService.sendMessage(authentication.getName(), request));
    }

    @PostMapping("/{messageId}/reactions")
    public MessageResponse reactToMessage(
            Authentication authentication,
            @PathVariable Long messageId,
            @Valid @RequestBody MessageReactionRequest request
    ) {
        MessageResponse message = messageService.reactToMessage(authentication.getName(), messageId, request);
        notifyMessageUpdateParticipants(authentication.getName(), messageId, message);
        return message;
    }

    @DeleteMapping("/{messageId}/reactions")
    public MessageResponse removeReaction(
            Authentication authentication,
            @PathVariable Long messageId
    ) {
        MessageResponse message = messageService.removeReaction(authentication.getName(), messageId);
        notifyMessageUpdateParticipants(authentication.getName(), messageId, message);
        return message;
    }

    @PatchMapping("/{messageId}/recall")
    public MessageResponse recallMessage(
            Authentication authentication,
            @PathVariable Long messageId
    ) {
        MessageResponse message = messageService.recallMessage(authentication.getName(), messageId);
        notifyMessageUpdateParticipants(authentication.getName(), messageId, message);
        return message;
    }

    private void notifyMessageUpdateParticipants(String currentUsername, Long messageId, MessageResponse message) {
        messageService.getMessageParticipantUsernames(currentUsername, messageId)
                .forEach(username ->
                        messagingTemplate.convertAndSendToUser(
                                username,
                                MESSAGE_UPDATE_QUEUE,
                                message
                        )
                );
    }
}
