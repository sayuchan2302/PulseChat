package com.chatapp.service;

import com.chatapp.dto.request.AddRoomMembersRequest;
import com.chatapp.dto.request.CreateChatRoomRequest;
import com.chatapp.dto.request.UpdateChatRoomRequest;
import com.chatapp.dto.request.UpdateRoomMemberNicknameRequest;
import com.chatapp.dto.response.ChatRoomResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.ChatRoomReadState;
import com.chatapp.model.Message;
import com.chatapp.model.User;
import com.chatapp.repository.ChatRoomReadStateRepository;
import com.chatapp.repository.ChatRoomRepository;
import com.chatapp.repository.ConversationSettingRepository;
import com.chatapp.repository.MessageRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatRoomServiceTest {
    @Mock
    private ChatRoomRepository chatRoomRepository;

    @Mock
    private ChatRoomReadStateRepository chatRoomReadStateRepository;

    @Mock
    private MessageRepository messageRepository;

    @Mock
    private ConversationSettingRepository conversationSettingRepository;

    @Mock
    private UserService userService;

    @InjectMocks
    private ChatRoomService chatRoomService;

    @Test
    void createGroupRequiresAtLeastThreeMembersIncludingCreator() {
        User creator = user(1L, "sayu");
        when(userService.findByUsername("sayu")).thenReturn(creator);

        AppException exception = assertThrows(
                AppException.class,
                () -> chatRoomService.createGroup(
                        "sayu",
                        new CreateChatRoomRequest("Study group", Set.of(2L))
                )
        );

        assertEquals(ErrorCode.GROUP_REQUIRES_MINIMUM_MEMBERS, exception.getErrorCode());
        verify(chatRoomRepository, never()).saveAndFlush(any(ChatRoom.class));
    }

    @Test
    void createGroupDoesNotCountCreatorAsInvitedParticipant() {
        User creator = user(1L, "sayu");
        when(userService.findByUsername("sayu")).thenReturn(creator);

        AppException exception = assertThrows(
                AppException.class,
                () -> chatRoomService.createGroup(
                        "sayu",
                        new CreateChatRoomRequest("Study group", Set.of(1L, 2L))
                )
        );

        assertEquals(ErrorCode.GROUP_REQUIRES_MINIMUM_MEMBERS, exception.getErrorCode());
        verify(chatRoomRepository, never()).saveAndFlush(any(ChatRoom.class));
    }

    @Test
    void createGroupAllowsCreatorPlusAtLeastTwoInvitedParticipants() {
        User creator = user(1L, "sayu");
        User alice = user(2L, "alice");
        User bob = user(3L, "bob");
        when(userService.findByUsername("sayu")).thenReturn(creator);
        when(userService.findById(2L)).thenReturn(alice);
        when(userService.findById(3L)).thenReturn(bob);
        when(chatRoomRepository.saveAndFlush(any(ChatRoom.class))).thenAnswer(invocation -> {
            ChatRoom room = invocation.getArgument(0);
            room.setId(10L);
            return room;
        });

        ChatRoomResponse response = chatRoomService.createGroup(
                "sayu",
                new CreateChatRoomRequest("  Study group  ", Set.of(2L, 3L))
        );

        assertEquals("Study group", response.name());
        assertEquals("group", response.type());
        assertEquals(1L, response.ownerId());
        assertEquals(3, response.participants().size());
    }

    @Test
    void listGroupsIncludesLatestMessageAndUnreadCount() {
        User sayu = user(1L, "sayu");
        User alice = user(2L, "alice");
        ChatRoom olderRoom = room(10L, "Older room", LocalDateTime.of(2026, 8, 1, 9, 0), sayu, alice);
        ChatRoom activeRoom = room(20L, "Active room", LocalDateTime.of(2026, 8, 1, 8, 0), sayu, alice);
        Message latestMessage = message(100L, activeRoom, alice, "Newest group message", LocalDateTime.of(2026, 8, 1, 11, 0));

        when(userService.findByUsername("sayu")).thenReturn(sayu);
        when(chatRoomRepository.findDistinctByMembersUserIdAndTypeOrderByCreatedAtDesc(1L, ChatRoom.RoomType.GROUP))
                .thenReturn(List.of(olderRoom, activeRoom));
        when(messageRepository.findLatestMessagesForRooms(List.of(10L, 20L))).thenReturn(List.of(latestMessage));
        when(messageRepository.countUnreadRoomMessages(1L, List.of(10L, 20L)))
                .thenReturn(List.of(roomUnreadCount(20L, 2)));

        List<ChatRoomResponse> responses = chatRoomService.listGroups("sayu");

        assertEquals(20L, responses.get(0).id());
        assertEquals("Newest group message", responses.get(0).lastMessageContent());
        assertEquals(LocalDateTime.of(2026, 8, 1, 11, 0), responses.get(0).lastMessageAt());
        assertEquals(2L, responses.get(0).lastMessageSenderId());
        assertEquals("alice", responses.get(0).lastMessageSenderName());
        assertEquals(2, responses.get(0).unreadCount());
    }

    @Test
    void markGroupAsReadCreatesReadStateAndReturnsRoomWithZeroUnreadCount() {
        User sayu = user(1L, "sayu");
        User alice = user(2L, "alice");
        ChatRoom room = room(10L, "Study group", LocalDateTime.of(2026, 8, 1, 9, 0), sayu, alice);
        Message latestMessage = message(100L, room, alice, "Latest", LocalDateTime.of(2026, 8, 1, 11, 0));

        when(userService.findByUsername("sayu")).thenReturn(sayu);
        when(chatRoomRepository.findByIdAndType(10L, ChatRoom.RoomType.GROUP)).thenReturn(Optional.of(room));
        when(chatRoomReadStateRepository.findByChatRoomIdAndUserId(10L, 1L)).thenReturn(Optional.empty());
        when(messageRepository.findLatestMessagesForRooms(List.of(10L))).thenReturn(List.of(latestMessage));

        ChatRoomResponse response = chatRoomService.markGroupAsRead("sayu", 10L);

        assertEquals(10L, response.id());
        assertEquals("Latest", response.lastMessageContent());
        assertEquals(0, response.unreadCount());
        verify(chatRoomReadStateRepository).saveAndFlush(any(ChatRoomReadState.class));
    }

    @Test
    void updateGroupRequiresOwner() {
        User sayu = user(1L, "sayu");
        User alice = user(2L, "alice");
        User bob = user(3L, "bob");
        ChatRoom room = room(10L, "Study group", LocalDateTime.of(2026, 8, 1, 9, 0), sayu, alice, bob);
        room.setOwner(alice);

        when(userService.findByUsername("sayu")).thenReturn(sayu);
        when(chatRoomRepository.findByIdAndType(10L, ChatRoom.RoomType.GROUP)).thenReturn(Optional.of(room));

        AppException exception = assertThrows(
                AppException.class,
                () -> chatRoomService.updateGroup(
                        "sayu",
                        10L,
                        new UpdateChatRoomRequest("New name")
                )
        );

        assertEquals(ErrorCode.ROOM_OWNER_REQUIRED, exception.getErrorCode());
        verify(chatRoomRepository, never()).saveAndFlush(any(ChatRoom.class));
    }

    @Test
    void updateGroupRenamesWhenOwner() {
        User sayu = user(1L, "sayu");
        User alice = user(2L, "alice");
        User bob = user(3L, "bob");
        ChatRoom room = room(10L, "Study group", LocalDateTime.of(2026, 8, 1, 9, 0), sayu, alice, bob);
        room.setOwner(sayu);

        when(userService.findByUsername("sayu")).thenReturn(sayu);
        when(chatRoomRepository.findByIdAndType(10L, ChatRoom.RoomType.GROUP)).thenReturn(Optional.of(room));
        when(chatRoomRepository.saveAndFlush(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageRepository.findLatestMessagesForRooms(List.of(10L))).thenReturn(List.of());
        when(messageRepository.countUnreadRoomMessages(1L, List.of(10L))).thenReturn(List.of());

        ChatRoomResponse response = chatRoomService.updateGroup(
                "sayu",
                10L,
                new UpdateChatRoomRequest("  New name  ")
        );

        assertEquals("New name", response.name());
        assertEquals(1L, response.ownerId());
    }

    @Test
    void addMembersAddsOnlyNewParticipants() {
        User sayu = user(1L, "sayu");
        User alice = user(2L, "alice");
        User bob = user(3L, "bob");
        User charlie = user(4L, "charlie");
        ChatRoom room = room(10L, "Study group", LocalDateTime.of(2026, 8, 1, 9, 0), sayu, alice, bob);
        room.setOwner(sayu);

        when(userService.findByUsername("sayu")).thenReturn(sayu);
        when(userService.findById(4L)).thenReturn(charlie);
        when(chatRoomRepository.findByIdAndType(10L, ChatRoom.RoomType.GROUP)).thenReturn(Optional.of(room));
        when(chatRoomRepository.saveAndFlush(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageRepository.findLatestMessagesForRooms(List.of(10L))).thenReturn(List.of());
        when(messageRepository.countUnreadRoomMessages(1L, List.of(10L))).thenReturn(List.of());

        ChatRoomResponse response = chatRoomService.addMembers(
                "sayu",
                10L,
                new AddRoomMembersRequest(Set.of(2L, 4L))
        );

        assertEquals(4, response.participants().size());
        assertEquals(
                1,
                response.participants()
                        .stream()
                        .filter(participant -> participant.username().equals("charlie"))
                        .count()
        );
    }

    @Test
    void leaveGroupTransfersOwner() {
        User sayu = user(1L, "sayu");
        User alice = user(2L, "alice");
        User bob = user(3L, "bob");
        ChatRoom room = room(10L, "Study group", LocalDateTime.of(2026, 8, 1, 9, 0), sayu, alice, bob);
        room.setOwner(sayu);

        when(userService.findByUsername("sayu")).thenReturn(sayu);
        when(chatRoomRepository.findByIdAndType(10L, ChatRoom.RoomType.GROUP)).thenReturn(Optional.of(room));
        when(chatRoomRepository.saveAndFlush(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageRepository.findLatestMessagesForRooms(List.of(10L))).thenReturn(List.of());

        ChatRoomResponse response = chatRoomService.leaveGroup("sayu", 10L);

        assertEquals(2L, response.ownerId());
        assertEquals(2, response.participants().size());
        assertEquals(
                0,
                response.participants()
                        .stream()
                        .filter(participant -> participant.id().equals(1L))
                        .count()
        );
    }

    @Test
    void transferOwnerUpdatesOwnerToExistingMember() {
        User sayu = user(1L, "sayu");
        User alice = user(2L, "alice");
        User bob = user(3L, "bob");
        ChatRoom room = room(10L, "Study group", LocalDateTime.of(2026, 8, 1, 9, 0), sayu, alice, bob);
        room.setOwner(sayu);

        when(userService.findByUsername("sayu")).thenReturn(sayu);
        when(chatRoomRepository.findByIdAndType(10L, ChatRoom.RoomType.GROUP)).thenReturn(Optional.of(room));
        when(chatRoomRepository.saveAndFlush(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageRepository.findLatestMessagesForRooms(List.of(10L))).thenReturn(List.of());
        when(messageRepository.countUnreadRoomMessages(1L, List.of(10L))).thenReturn(List.of());

        ChatRoomResponse response = chatRoomService.transferOwner(
                "sayu",
                10L,
                new com.chatapp.dto.request.TransferRoomOwnerRequest(2L)
        );

        assertEquals(2L, response.ownerId());
    }

    @Test
    void removeMemberRequiresOwner() {
        User sayu = user(1L, "sayu");
        User alice = user(2L, "alice");
        User bob = user(3L, "bob");
        User charlie = user(4L, "charlie");
        ChatRoom room = room(10L, "Study group", LocalDateTime.of(2026, 8, 1, 9, 0), sayu, alice, bob, charlie);
        room.setOwner(alice);

        when(userService.findByUsername("sayu")).thenReturn(sayu);
        when(chatRoomRepository.findByIdAndType(10L, ChatRoom.RoomType.GROUP)).thenReturn(Optional.of(room));

        AppException exception = assertThrows(
                AppException.class,
                () -> chatRoomService.removeMember("sayu", 10L, 4L)
        );

        assertEquals(ErrorCode.ROOM_OWNER_REQUIRED, exception.getErrorCode());
        verify(chatRoomRepository, never()).saveAndFlush(any(ChatRoom.class));
    }

    @Test
    void removeMemberKicksNonOwnerMember() {
        User sayu = user(1L, "sayu");
        User alice = user(2L, "alice");
        User bob = user(3L, "bob");
        User charlie = user(4L, "charlie");
        ChatRoom room = room(10L, "Study group", LocalDateTime.of(2026, 8, 1, 9, 0), sayu, alice, bob, charlie);
        room.setOwner(sayu);

        when(userService.findByUsername("sayu")).thenReturn(sayu);
        when(chatRoomRepository.findByIdAndType(10L, ChatRoom.RoomType.GROUP)).thenReturn(Optional.of(room));
        when(chatRoomRepository.saveAndFlush(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageRepository.findLatestMessagesForRooms(List.of(10L))).thenReturn(List.of());
        when(messageRepository.countUnreadRoomMessages(1L, List.of(10L))).thenReturn(List.of());

        ChatRoomResponse response = chatRoomService.removeMember("sayu", 10L, 4L);

        assertEquals(3, response.participants().size());
        assertEquals(
                0,
                response.participants()
                        .stream()
                        .filter(participant -> participant.id().equals(4L))
                        .count()
        );
    }

    @Test
    void updateMemberNicknameRequiresOwner() {
        User sayu = user(1L, "sayu");
        User alice = user(2L, "alice");
        User bob = user(3L, "bob");
        ChatRoom room = room(10L, "Study group", LocalDateTime.of(2026, 8, 1, 9, 0), sayu, alice, bob);
        room.setOwner(alice);

        when(userService.findByUsername("sayu")).thenReturn(sayu);
        when(chatRoomRepository.findByIdAndType(10L, ChatRoom.RoomType.GROUP)).thenReturn(Optional.of(room));

        AppException exception = assertThrows(
                AppException.class,
                () -> chatRoomService.updateMemberNickname(
                        "sayu",
                        10L,
                        3L,
                        new UpdateRoomMemberNicknameRequest("Bobby")
                )
        );

        assertEquals(ErrorCode.ROOM_OWNER_REQUIRED, exception.getErrorCode());
        verify(chatRoomRepository, never()).saveAndFlush(any(ChatRoom.class));
    }

    @Test
    void updateMemberNicknameSavesNickname() {
        User sayu = user(1L, "sayu");
        User alice = user(2L, "alice");
        User bob = user(3L, "bob");
        ChatRoom room = room(10L, "Study group", LocalDateTime.of(2026, 8, 1, 9, 0), sayu, alice, bob);
        room.setOwner(sayu);

        when(userService.findByUsername("sayu")).thenReturn(sayu);
        when(chatRoomRepository.findByIdAndType(10L, ChatRoom.RoomType.GROUP)).thenReturn(Optional.of(room));
        when(chatRoomRepository.saveAndFlush(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageRepository.findLatestMessagesForRooms(List.of(10L))).thenReturn(List.of());
        when(messageRepository.countUnreadRoomMessages(1L, List.of(10L))).thenReturn(List.of());

        ChatRoomResponse response = chatRoomService.updateMemberNickname(
                "sayu",
                10L,
                3L,
                new UpdateRoomMemberNicknameRequest("  Bobby  ")
        );

        assertEquals(
                "Bobby",
                response.participants()
                        .stream()
                        .filter(participant -> participant.id().equals(3L))
                        .findFirst()
                        .orElseThrow()
                        .nickname()
        );
    }

    private User user(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setFullName(username);
        user.setEmail(username + "@example.com");
        user.setOnline(false);
        return user;
    }

    private ChatRoom room(Long id, String name, LocalDateTime createdAt, User... participants) {
        ChatRoom room = new ChatRoom();
        room.setId(id);
        room.setName(name);
        room.setType(ChatRoom.RoomType.GROUP);
        room.setCreatedAt(createdAt);
        List.of(participants).forEach(room::addMember);
        return room;
    }

    private Message message(Long id, ChatRoom room, User sender, String content, LocalDateTime timestamp) {
        Message message = new Message();
        message.setId(id);
        message.setChatRoom(room);
        message.setSender(sender);
        message.setContent(content);
        message.setTimestamp(timestamp);
        message.setRead(false);
        return message;
    }

    private MessageRepository.RoomUnreadCountProjection roomUnreadCount(Long roomId, long unreadCount) {
        return new MessageRepository.RoomUnreadCountProjection() {
            @Override
            public Long getRoomId() {
                return roomId;
            }

            @Override
            public long getUnreadCount() {
                return unreadCount;
            }
        };
    }
}
