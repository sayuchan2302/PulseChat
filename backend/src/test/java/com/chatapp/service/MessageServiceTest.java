package com.chatapp.service;

import com.chatapp.dto.response.MessagePageResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.Message;
import com.chatapp.model.User;
import com.chatapp.repository.MessageRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageServiceTest {
    @Mock
    private MessageRepository messageRepository;

    @Mock
    private UserService userService;

    @Mock
    private ChatRoomService chatRoomService;

    @Mock
    private FriendshipService friendshipService;

    @InjectMocks
    private MessageService messageService;

    @Test
    void getConversationReturnsNewestPageInAscendingOrderWithCursor() {
        User currentUser = user(1L, "sayu");
        User otherUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(otherUser.getId())).thenReturn(otherUser);
        when(friendshipService.areFriends(currentUser, otherUser)).thenReturn(true);
        when(messageRepository.findConversationPage(eq(1L), eq(2L), isNull(), any(Pageable.class)))
                .thenReturn(List.of(
                        privateMessage(3L, "three", currentUser, otherUser),
                        privateMessage(2L, "two", otherUser, currentUser),
                        privateMessage(1L, "one", currentUser, otherUser)
                ));

        MessagePageResponse page = messageService.getConversation("sayu", otherUser.getId(), null, 2);

        assertTrue(page.hasMore());
        assertEquals(2L, page.nextBefore());
        assertEquals(List.of(2L, 3L), page.items().stream().map(message -> message.id()).toList());

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(messageRepository).findConversationPage(eq(1L), eq(2L), isNull(), pageableCaptor.capture());
        assertEquals(3, pageableCaptor.getValue().getPageSize());
    }

    @Test
    void getConversationRequiresAcceptedFriendship() {
        User currentUser = user(1L, "sayu");
        User otherUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(otherUser.getId())).thenReturn(otherUser);
        when(friendshipService.areFriends(currentUser, otherUser)).thenReturn(false);

        AppException exception = assertThrows(
                AppException.class,
                () -> messageService.getConversation("sayu", otherUser.getId(), null, 30)
        );

        assertEquals(ErrorCode.FRIENDSHIP_REQUIRED, exception.getErrorCode());
        verify(messageRepository, never()).findConversationPage(any(), any(), any(), any());
    }

    @Test
    void getRoomMessagesReturnsDefaultPageWithoutCursorWhenNoMoreMessages() {
        ChatRoom room = room(10L, "Team");
        User sender = user(1L, "sayu");
        when(chatRoomService.findGroupRoomForMember("sayu", room.getId())).thenReturn(room);
        when(messageRepository.findRoomMessagePage(eq(room.getId()), eq(8L), any(Pageable.class)))
                .thenReturn(List.of(
                        roomMessage(7L, "older", sender, room),
                        roomMessage(6L, "oldest", sender, room)
                ));

        MessagePageResponse page = messageService.getRoomMessages("sayu", room.getId(), 8L, null);

        assertFalse(page.hasMore());
        assertNull(page.nextBefore());
        assertEquals(List.of(6L, 7L), page.items().stream().map(message -> message.id()).toList());

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(messageRepository).findRoomMessagePage(eq(room.getId()), eq(8L), pageableCaptor.capture());
        assertEquals(31, pageableCaptor.getValue().getPageSize());
    }

    private static User user(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setFullName(username);
        user.setEmail(username + "@example.com");
        user.setPassword("password");
        return user;
    }

    private static ChatRoom room(Long id, String name) {
        ChatRoom room = new ChatRoom();
        room.setId(id);
        room.setName(name);
        room.setType(ChatRoom.RoomType.GROUP);
        return room;
    }

    private static Message privateMessage(Long id, String content, User sender, User receiver) {
        Message message = baseMessage(id, content, sender);
        message.setReceiver(receiver);
        return message;
    }

    private static Message roomMessage(Long id, String content, User sender, ChatRoom room) {
        Message message = baseMessage(id, content, sender);
        message.setChatRoom(room);
        return message;
    }

    private static Message baseMessage(Long id, String content, User sender) {
        Message message = new Message();
        message.setId(id);
        message.setContent(content);
        message.setSender(sender);
        message.setRead(false);
        message.setTimestamp(LocalDateTime.of(2026, 8, 3, 10, id.intValue()));
        return message;
    }
}
