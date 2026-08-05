package com.chatapp.controller;

import com.chatapp.dto.request.CallSignalRequest;
import com.chatapp.dto.request.ReadReceiptRequest;
import com.chatapp.dto.request.RoomTypingRequest;
import com.chatapp.dto.request.SendMessageRequest;
import com.chatapp.dto.request.SendRoomMessageRequest;
import com.chatapp.dto.request.TypingRequest;
import com.chatapp.dto.response.CallSignalResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.dto.response.ReadReceiptResponse;
import com.chatapp.dto.response.TypingResponse;
import com.chatapp.service.CallSessionService;
import com.chatapp.service.CallRealtimeNotifier;
import com.chatapp.model.User;
import com.chatapp.service.ChatRoomService;
import com.chatapp.service.MessageService;
import com.chatapp.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
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
    private static final String TYPING_QUEUE = "/queue/typing";
    private static final String READ_RECEIPT_QUEUE = "/queue/read-receipts";

    private final CallSessionService callSessionService;
    private final CallRealtimeNotifier callRealtimeNotifier;
    private final MessageService messageService;
    private final UserService userService;
    private final ChatRoomService chatRoomService;
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/chat.send")
    public void sendMessage(@Valid @Payload SendMessageRequest request, Principal principal) {
        Principal authenticatedPrincipal = requireAuthenticatedPrincipal(principal);

        MessageResponse savedMessage = messageService.sendMessage(authenticatedPrincipal.getName(), request);
        User receiver = userService.findById(request.receiverId());

        messagingTemplate.convertAndSendToUser(
                receiver.getUsername(),
                PRIVATE_MESSAGE_QUEUE,
                savedMessage
        );
        messagingTemplate.convertAndSendToUser(
                authenticatedPrincipal.getName(),
                PRIVATE_MESSAGE_QUEUE,
                savedMessage
        );
    }

    @MessageMapping("/rooms/{roomId}/send")
    public void sendRoomMessage(
            @DestinationVariable Long roomId,
            @Valid @Payload SendRoomMessageRequest request,
            Principal principal
    ) {
        Principal authenticatedPrincipal = requireAuthenticatedPrincipal(principal);

        MessageResponse savedMessage = messageService.sendRoomMessage(
                authenticatedPrincipal.getName(),
                roomId,
                request
        );

        chatRoomService.getGroupParticipantUsernames(authenticatedPrincipal.getName(), roomId)
                .forEach(username ->
                        messagingTemplate.convertAndSendToUser(
                                username,
                                PRIVATE_MESSAGE_QUEUE,
                                savedMessage
                        )
                );
    }

    @MessageMapping("/chat.typing")
    public void sendTyping(@Valid @Payload TypingRequest request, Principal principal) {
        Principal authenticatedPrincipal = requireAuthenticatedPrincipal(principal);
        User sender = userService.findByUsername(authenticatedPrincipal.getName());
        User receiver = userService.findById(request.receiverId());

        TypingResponse response = new TypingResponse(
                sender.getId(),
                sender.getUsername(),
                null,
                request.typing()
        );

        messagingTemplate.convertAndSendToUser(
                receiver.getUsername(),
                TYPING_QUEUE,
                response
        );
    }

    @MessageMapping("/rooms/{roomId}/typing")
    public void sendRoomTyping(
            @DestinationVariable Long roomId,
            @Valid @Payload RoomTypingRequest request,
            Principal principal
    ) {
        Principal authenticatedPrincipal = requireAuthenticatedPrincipal(principal);
        User sender = userService.findByUsername(authenticatedPrincipal.getName());

        TypingResponse response = new TypingResponse(
                sender.getId(),
                sender.getUsername(),
                roomId,
                request.typing()
        );

        chatRoomService.getGroupParticipantUsernames(authenticatedPrincipal.getName(), roomId)
                .stream()
                .filter(username -> !username.equals(authenticatedPrincipal.getName()))
                .forEach(username ->
                        messagingTemplate.convertAndSendToUser(
                                username,
                                TYPING_QUEUE,
                                response
                        )
                );
    }

    @MessageMapping("/chat.read")
    public void markConversationAsRead(@Valid @Payload ReadReceiptRequest request, Principal principal) {
        Principal authenticatedPrincipal = requireAuthenticatedPrincipal(principal);
        ReadReceiptResponse response = messageService.markConversationAsRead(
                authenticatedPrincipal.getName(),
                request.senderId()
        );
        User sender = userService.findById(request.senderId());

        messagingTemplate.convertAndSendToUser(
                sender.getUsername(),
                READ_RECEIPT_QUEUE,
                response
        );
        messagingTemplate.convertAndSendToUser(
                authenticatedPrincipal.getName(),
                READ_RECEIPT_QUEUE,
                response
        );
    }

    @MessageMapping("/calls.signal")
    public void signalCall(@Valid @Payload CallSignalRequest request, Principal principal) {
        Principal authenticatedPrincipal = requireAuthenticatedPrincipal(principal);
        CallSignalResponse response = callSessionService.handleSignal(
                authenticatedPrincipal.getName(),
                request
        );

        if (response.eventType() == CallSignalRequest.CallSignalType.CALL_BUSY) {
            callRealtimeNotifier.notifyCallerOnly(response);
            return;
        }

        callRealtimeNotifier.notifyParticipants(response);
    }

    private Principal requireAuthenticatedPrincipal(Principal principal) {
        if (principal == null) {
            throw new AuthenticationCredentialsNotFoundException("Authentication is required");
        }

        return principal;
    }
}
