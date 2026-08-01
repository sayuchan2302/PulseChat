package com.chatapp.controller;

import com.chatapp.dto.request.SendMessageRequest;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.service.MessageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/messages")
@RequiredArgsConstructor
public class MessageController {
    private final MessageService messageService;

    @GetMapping("/{userId}")
    public List<MessageResponse> getConversation(Authentication authentication, @PathVariable Long userId) {
        return messageService.getConversation(authentication.getName(), userId);
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
