package com.chatapp.controller;

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
import org.springframework.security.core.Authentication;
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
    private final MessageService messageService;

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
}
