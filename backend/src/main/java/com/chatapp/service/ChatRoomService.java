package com.chatapp.service;

import com.chatapp.dto.request.CreateChatRoomRequest;
import com.chatapp.dto.response.ChatRoomResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.ChatRoomReadState;
import com.chatapp.model.Message;
import com.chatapp.model.User;
import com.chatapp.repository.ChatRoomReadStateRepository;
import com.chatapp.repository.ChatRoomRepository;
import com.chatapp.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChatRoomService {
    private static final int MIN_GROUP_MEMBERS = 3;
    private static final int MIN_INVITED_PARTICIPANTS = MIN_GROUP_MEMBERS - 1;

    private final ChatRoomRepository chatRoomRepository;
    private final ChatRoomReadStateRepository chatRoomReadStateRepository;
    private final MessageRepository messageRepository;
    private final UserService userService;

    @Transactional
    public ChatRoomResponse createGroup(String currentUsername, CreateChatRoomRequest request) {
        User creator = userService.findByUsername(currentUsername);
        Set<Long> participantIds = new LinkedHashSet<>(request.participantIds());
        participantIds.remove(creator.getId());

        if (participantIds.size() < MIN_INVITED_PARTICIPANTS) {
            throw new AppException(ErrorCode.GROUP_REQUIRES_MINIMUM_MEMBERS);
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

        List<ChatRoom> rooms = chatRoomRepository
                .findDistinctByParticipantsIdAndTypeOrderByCreatedAtDesc(
                        currentUser.getId(),
                        ChatRoom.RoomType.GROUP
                );
        List<Long> roomIds = rooms.stream().map(ChatRoom::getId).toList();
        Map<Long, Message> latestMessagesByRoomId = findLatestMessagesByRoomId(roomIds);
        Map<Long, Long> unreadCountsByRoomId = countUnreadMessagesByRoomId(currentUser.getId(), roomIds);

        return rooms
                .stream()
                .map(room -> ChatRoomResponse.from(
                        room,
                        latestMessagesByRoomId.get(room.getId()),
                        unreadCountsByRoomId.getOrDefault(room.getId(), 0L)
                ))
                .sorted(this::compareByConversationActivity)
                .toList();
    }

    @Transactional
    public ChatRoomResponse markGroupAsRead(String currentUsername, Long roomId) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);
        ChatRoomReadState readState = chatRoomReadStateRepository
                .findByChatRoomIdAndUserId(room.getId(), currentUser.getId())
                .orElseGet(() -> {
                    ChatRoomReadState state = new ChatRoomReadState();
                    state.setChatRoom(room);
                    state.setUser(currentUser);
                    return state;
                });

        readState.setLastReadAt(LocalDateTime.now());
        chatRoomReadStateRepository.saveAndFlush(readState);

        Message latestMessage = findLatestMessagesByRoomId(List.of(room.getId())).get(room.getId());
        return ChatRoomResponse.from(room, latestMessage, 0);
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

    private Map<Long, Message> findLatestMessagesByRoomId(List<Long> roomIds) {
        if (roomIds.isEmpty()) {
            return Map.of();
        }

        return messageRepository.findLatestMessagesForRooms(roomIds)
                .stream()
                .collect(Collectors.toMap(
                        message -> message.getChatRoom().getId(),
                        Function.identity()
                ));
    }

    private Map<Long, Long> countUnreadMessagesByRoomId(Long currentUserId, List<Long> roomIds) {
        if (roomIds.isEmpty()) {
            return Map.of();
        }

        return messageRepository.countUnreadRoomMessages(currentUserId, roomIds)
                .stream()
                .collect(Collectors.toMap(
                        MessageRepository.RoomUnreadCountProjection::getRoomId,
                        MessageRepository.RoomUnreadCountProjection::getUnreadCount
                ));
    }

    private int compareByConversationActivity(ChatRoomResponse firstRoom, ChatRoomResponse secondRoom) {
        LocalDateTime firstActivityAt = firstRoom.lastMessageAt() == null
                ? firstRoom.createdAt()
                : firstRoom.lastMessageAt();
        LocalDateTime secondActivityAt = secondRoom.lastMessageAt() == null
                ? secondRoom.createdAt()
                : secondRoom.lastMessageAt();

        return secondActivityAt.compareTo(firstActivityAt);
    }
}
