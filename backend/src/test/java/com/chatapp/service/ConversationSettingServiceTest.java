package com.chatapp.service;

import com.chatapp.dto.request.UpdateConversationSettingRequest;
import com.chatapp.dto.response.ConversationSettingResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.ConversationSetting;
import com.chatapp.model.User;
import com.chatapp.repository.ConversationSettingRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConversationSettingServiceTest {
    @Mock
    private ConversationSettingRepository conversationSettingRepository;

    @Mock
    private UserService userService;

    @Mock
    private FriendshipService friendshipService;

    @Mock
    private ChatRoomService chatRoomService;

    @InjectMocks
    private ConversationSettingService conversationSettingService;

    @Test
    void updatePrivateSettingSavesPartialPatchForAcceptedFriend() {
        User currentUser = user(1L, "sayu");
        User friend = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(2L)).thenReturn(friend);
        when(friendshipService.areFriends(currentUser, friend)).thenReturn(true);
        when(conversationSettingRepository.findByUserIdAndTargetUserId(1L, 2L))
                .thenReturn(Optional.empty());
        when(conversationSettingRepository.saveAndFlush(any(ConversationSetting.class)))
                .thenAnswer(invocation -> {
                    ConversationSetting setting = invocation.getArgument(0);
                    setting.setId(10L);
                    return setting;
                });

        ConversationSettingResponse response = conversationSettingService.updatePrivateSetting(
                "sayu",
                2L,
                new UpdateConversationSettingRequest(true, null, true)
        );

        assertEquals(10L, response.id());
        assertEquals(2L, response.targetUserId());
        assertEquals(true, response.pinned());
        assertEquals(false, response.muted());
        assertEquals(true, response.archived());
    }

    @Test
    void updatePrivateSettingRequiresAcceptedFriendship() {
        User currentUser = user(1L, "sayu");
        User otherUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(2L)).thenReturn(otherUser);
        when(friendshipService.areFriends(currentUser, otherUser)).thenReturn(false);

        AppException exception = assertThrows(
                AppException.class,
                () -> conversationSettingService.updatePrivateSetting(
                        "sayu",
                        2L,
                        new UpdateConversationSettingRequest(true, null, null)
                )
        );

        assertEquals(ErrorCode.FRIENDSHIP_REQUIRED, exception.getErrorCode());
        verify(conversationSettingRepository, never()).saveAndFlush(any(ConversationSetting.class));
    }

    @Test
    void updateRoomSettingSavesForRoomMember() {
        User currentUser = user(1L, "sayu");
        ChatRoom room = new ChatRoom();
        room.setId(10L);
        room.setName("Study group");
        room.setType(ChatRoom.RoomType.GROUP);
        room.addMember(currentUser);
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(chatRoomService.findGroupRoomForMember(currentUser, 10L)).thenReturn(room);
        when(conversationSettingRepository.findByUserIdAndChatRoomId(1L, 10L))
                .thenReturn(Optional.empty());
        when(conversationSettingRepository.saveAndFlush(any(ConversationSetting.class)))
                .thenAnswer(invocation -> {
                    ConversationSetting setting = invocation.getArgument(0);
                    setting.setId(11L);
                    return setting;
                });

        ConversationSettingResponse response = conversationSettingService.updateRoomSetting(
                "sayu",
                10L,
                new UpdateConversationSettingRequest(null, true, true)
        );

        assertEquals(11L, response.id());
        assertEquals(10L, response.chatRoomId());
        assertEquals(false, response.pinned());
        assertEquals(true, response.muted());
        assertEquals(true, response.archived());
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
