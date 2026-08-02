package com.chatapp.service;

import com.chatapp.dto.request.CreateChatRoomRequest;
import com.chatapp.dto.response.ChatRoomResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.User;
import com.chatapp.repository.ChatRoomRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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
        assertEquals(3, response.participants().size());
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
}
