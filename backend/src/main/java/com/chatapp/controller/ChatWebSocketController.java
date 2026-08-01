package com.chatapp.controller;

import com.chatapp.dto.request.SendMessageRequest;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.model.User;
import com.chatapp.service.MessageService;
import com.chatapp.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
@RequiredArgsConstructor
public class ChatWebSocketController {
    private static final String PRIVATE_MESSAGE_QUEUE = "/queue/messages";

    private final MessageService messageService;
    private final UserService userService;
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/chat.send")
    public void sendMessage(@Valid @Payload SendMessageRequest request, Principal principal) {
        if (principal == null) {
            throw new AuthenticationCredentialsNotFoundException("Authentication is required");
        }

        MessageResponse savedMessage = messageService.sendMessage(principal.getName(), request);
        User receiver = userService.findById(request.receiverId());

        messagingTemplate.convertAndSendToUser(
                receiver.getUsername(),
                PRIVATE_MESSAGE_QUEUE,
                savedMessage
        );
        messagingTemplate.convertAndSendToUser(
                principal.getName(),
                PRIVATE_MESSAGE_QUEUE,
                savedMessage
        );
    }
}
