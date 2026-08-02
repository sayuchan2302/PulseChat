package com.chatapp.controller;

import com.chatapp.dto.request.CreateChatRoomRequest;
import com.chatapp.dto.request.SendRoomMessageRequest;
import com.chatapp.dto.response.ChatRoomResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.service.ChatRoomService;
import com.chatapp.service.MessageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/rooms")
@RequiredArgsConstructor
public class ChatRoomController {
    private static final String ROOM_QUEUE = "/queue/rooms";
    private static final String MESSAGE_QUEUE = "/queue/messages";

    private final ChatRoomService chatRoomService;
    private final MessageService messageService;
    private final SimpMessagingTemplate messagingTemplate;

    @GetMapping
    public List<ChatRoomResponse> listRooms(Authentication authentication) {
        return chatRoomService.listGroups(authentication.getName());
    }

    @PostMapping
    public ResponseEntity<ChatRoomResponse> createRoom(
            Authentication authentication,
            @Valid @RequestBody CreateChatRoomRequest request
    ) {
        ChatRoomResponse room = chatRoomService.createGroup(authentication.getName(), request);
        notifyRoomParticipants(room);

        return ResponseEntity.status(HttpStatus.CREATED).body(room);
    }

    @GetMapping("/{roomId}/messages")
    public List<MessageResponse> getRoomMessages(
            Authentication authentication,
            @PathVariable Long roomId
    ) {
        return messageService.getRoomMessages(authentication.getName(), roomId);
    }

    @PostMapping("/{roomId}/messages")
    public ResponseEntity<MessageResponse> sendRoomMessage(
            Authentication authentication,
            @PathVariable Long roomId,
            @Valid @RequestBody SendRoomMessageRequest request
    ) {
        MessageResponse message = messageService.sendRoomMessage(
                authentication.getName(),
                roomId,
                request
        );
        notifyMessageParticipants(authentication.getName(), roomId, message);

        return ResponseEntity.status(HttpStatus.CREATED).body(message);
    }

    private void notifyRoomParticipants(ChatRoomResponse room) {
        room.participants().forEach(participant ->
                messagingTemplate.convertAndSendToUser(
                        participant.username(),
                        ROOM_QUEUE,
                        room
                )
        );
    }

    private void notifyMessageParticipants(String currentUsername, Long roomId, MessageResponse message) {
        chatRoomService.getGroupParticipantUsernames(currentUsername, roomId)
                .forEach(username ->
                        messagingTemplate.convertAndSendToUser(
                                username,
                                MESSAGE_QUEUE,
                                message
                        )
                );
    }
}
