package com.chatapp.service;

import com.chatapp.dto.request.CreateChatRoomRequest;
import com.chatapp.dto.response.ChatRoomResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.User;
import com.chatapp.repository.ChatRoomRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ChatRoomService {
    private final ChatRoomRepository chatRoomRepository;
    private final UserService userService;

    @Transactional
    public ChatRoomResponse createGroup(String currentUsername, CreateChatRoomRequest request) {
        User creator = userService.findByUsername(currentUsername);
        Set<Long> participantIds = new LinkedHashSet<>(request.participantIds());
        participantIds.remove(creator.getId());

        if (participantIds.isEmpty()) {
            throw new AppException(ErrorCode.GROUP_REQUIRES_PARTICIPANTS);
        }

        ChatRoom room = new ChatRoom();
        room.setName(request.name().trim());
        room.setType(ChatRoom.RoomType.GROUP);
        room.getParticipants().add(creator);
        participantIds.stream()
                .map(userService::findById)
                .forEach(room.getParticipants()::add);

        return ChatRoomResponse.from(chatRoomRepository.saveAndFlush(room));
    }

    @Transactional(readOnly = true)
    public List<ChatRoomResponse> listGroups(String currentUsername) {
        User currentUser = userService.findByUsername(currentUsername);

        return chatRoomRepository
                .findDistinctByParticipantsIdAndTypeOrderByCreatedAtDesc(
                        currentUser.getId(),
                        ChatRoom.RoomType.GROUP
                )
                .stream()
                .map(ChatRoomResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public ChatRoom findGroupRoomForMember(String currentUsername, Long roomId) {
        return findGroupRoomForMember(userService.findByUsername(currentUsername), roomId);
    }

    @Transactional(readOnly = true)
    public ChatRoom findGroupRoomForMember(User member, Long roomId) {
        ChatRoom room = chatRoomRepository.findByIdAndType(roomId, ChatRoom.RoomType.GROUP)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));

        boolean isMember = room.getParticipants()
                .stream()
                .anyMatch(participant -> participant.getId().equals(member.getId()));

        if (!isMember) {
            throw new AppException(ErrorCode.ROOM_ACCESS_DENIED);
        }

        return room;
    }

    @Transactional(readOnly = true)
    public List<String> getGroupParticipantUsernames(String currentUsername, Long roomId) {
        return findGroupRoomForMember(currentUsername, roomId)
                .getParticipants()
                .stream()
                .map(User::getUsername)
                .toList();
    }
}
