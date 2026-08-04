package com.chatapp.controller;

import com.chatapp.dto.request.AddRoomMembersRequest;
import com.chatapp.dto.request.CreateChatRoomRequest;
import com.chatapp.dto.request.SendRoomMessageRequest;
import com.chatapp.dto.request.UpdateChatRoomRequest;
import com.chatapp.dto.request.UpdateRoomMemberNicknameRequest;
import com.chatapp.dto.response.ChatRoomResponse;
import com.chatapp.dto.response.MessagePageResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.exception.AppException;
import com.chatapp.service.ChatRoomService;
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
    public MessagePageResponse getRoomMessages(
            Authentication authentication,
            @PathVariable Long roomId,
            @RequestParam(required = false) Long before,
            @RequestParam(required = false) Integer size
    ) {
        return messageService.getRoomMessages(authentication.getName(), roomId, before, size);
    }

    @PatchMapping("/{roomId}/read")
    public ChatRoomResponse markRoomAsRead(
            Authentication authentication,
            @PathVariable Long roomId
    ) {
        return chatRoomService.markGroupAsRead(authentication.getName(), roomId);
    }

    @PatchMapping("/{roomId}")
    public ChatRoomResponse updateRoom(
            Authentication authentication,
            @PathVariable Long roomId,
            @Valid @RequestBody UpdateChatRoomRequest request
    ) {
        ChatRoomResponse room = chatRoomService.updateGroup(authentication.getName(), roomId, request);
        notifyRoomParticipants(room);

        return room;
    }

    @PostMapping("/{roomId}/members")
    public ChatRoomResponse addRoomMembers(
            Authentication authentication,
            @PathVariable Long roomId,
            @Valid @RequestBody AddRoomMembersRequest request
    ) {
        ChatRoomResponse room = chatRoomService.addMembers(authentication.getName(), roomId, request);
        notifyRoomParticipants(room);

        return room;
    }

    @DeleteMapping("/{roomId}/members/{memberId}")
    public ChatRoomResponse removeRoomMember(
            Authentication authentication,
            @PathVariable Long roomId,
            @PathVariable Long memberId
    ) {
        List<String> previousParticipantUsernames =
                chatRoomService.getGroupParticipantUsernames(authentication.getName(), roomId);
        ChatRoomResponse room = chatRoomService.removeMember(authentication.getName(), roomId, memberId);
        notifyRoomParticipants(roomId, previousParticipantUsernames, room);

        return room;
    }

    @PatchMapping("/{roomId}/members/{memberId}/nickname")
    public ChatRoomResponse updateRoomMemberNickname(
            Authentication authentication,
            @PathVariable Long roomId,
            @PathVariable Long memberId,
            @Valid @RequestBody UpdateRoomMemberNicknameRequest request
    ) {
        ChatRoomResponse room = chatRoomService.updateMemberNickname(
                authentication.getName(),
                roomId,
                memberId,
                request
        );
        notifyRoomParticipants(room);

        return room;
    }

    @DeleteMapping("/{roomId}/members/me")
    public ChatRoomResponse leaveRoom(
            Authentication authentication,
            @PathVariable Long roomId
    ) {
        List<String> previousParticipantUsernames =
                chatRoomService.getGroupParticipantUsernames(authentication.getName(), roomId);
        ChatRoomResponse room = chatRoomService.leaveGroup(authentication.getName(), roomId);
        notifyRoomParticipants(roomId, previousParticipantUsernames, room);

        return room;
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
        notifyRoomParticipants(
                room.id(),
                room.participants().stream().map(participant -> participant.username()).toList(),
                room
        );
    }

    private void notifyRoomParticipants(
            Long roomId,
            List<String> usernames,
            ChatRoomResponse fallbackRoom
    ) {
        usernames.forEach(username -> {
            ChatRoomResponse room = findRoomForNotification(username, roomId, fallbackRoom);
            messagingTemplate.convertAndSendToUser(username, ROOM_QUEUE, room);
        });
    }

    private ChatRoomResponse findRoomForNotification(
            String username,
            Long roomId,
            ChatRoomResponse fallbackRoom
    ) {
        try {
            return chatRoomService.getGroup(username, roomId);
        } catch (AppException exception) {
            return fallbackRoom;
        }
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
