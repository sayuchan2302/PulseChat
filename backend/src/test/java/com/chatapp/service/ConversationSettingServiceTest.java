package com.chatapp.service;

import com.chatapp.dto.request.UpdateConversationSettingRequest;
import com.chatapp.dto.response.ConversationSettingResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.ConversationSetting;
import com.chatapp.model.User;
import com.chatapp.repository.ConversationSettingRepository;
import com.chatapp.repository.ChatRoomReadStateRepository;
import com.chatapp.repository.MessageRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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
    private MessageRepository messageRepository;

    @Mock
    private ChatRoomReadStateRepository chatRoomReadStateRepository;

    @Mock
    private UserService userService;

    @Mock
    private ChatRoomService chatRoomService;

    @InjectMocks
    private ConversationSettingService conversationSettingService;

    @Test
    void updatePrivateSettingSavesPartialPatchForDirectUserWithoutFriendship() {
        User currentUser = user(1L, "sayu");
        User directUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(2L)).thenReturn(directUser);
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
    void updatePrivateSettingRejectsSelfConversation() {
        User currentUser = user(1L, "sayu");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(1L)).thenReturn(currentUser);

        AppException exception = assertThrows(
                AppException.class,
                () -> conversationSettingService.updatePrivateSetting(
                        "sayu",
                        1L,
                        new UpdateConversationSettingRequest(true, null, null)
                )
        );

        assertEquals(ErrorCode.SELF_CONVERSATION_NOT_ALLOWED, exception.getErrorCode());
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

    @Test
    void deletePrivateConversationCreatesAUserOnlyClearMarker() {
        User currentUser = user(1L, "sayu");
        User directUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(2L)).thenReturn(directUser);
        when(conversationSettingRepository.findByUserIdAndTargetUserId(1L, 2L))
                .thenReturn(Optional.empty());

        conversationSettingService.deletePrivateConversation("sayu", 2L);

        org.mockito.ArgumentCaptor<ConversationSetting> captor = org.mockito.ArgumentCaptor
                .forClass(ConversationSetting.class);
        verify(conversationSettingRepository).saveAndFlush(captor.capture());
        ConversationSetting setting = captor.getValue();
        assertEquals(currentUser, setting.getUser());
        assertEquals(directUser, setting.getTargetUser());
        assertNotNull(setting.getClearedAt());
        assertFalse(setting.getPinned());
        assertFalse(setting.getMuted());
        assertFalse(setting.getArchived());
        verify(messageRepository).markConversationAsRead(2L, 1L);
    }

    @Test
    void deleteRoomConversationCreatesAUserOnlyClearMarker() {
        User currentUser = user(1L, "sayu");
        ChatRoom room = new ChatRoom();
        room.setId(10L);
        room.setType(ChatRoom.RoomType.GROUP);
        room.addMember(currentUser);
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(chatRoomService.findGroupRoomForMember(currentUser, 10L)).thenReturn(room);
        when(conversationSettingRepository.findByUserIdAndChatRoomId(1L, 10L))
                .thenReturn(Optional.empty());

        conversationSettingService.deleteRoomConversation("sayu", 10L);

        org.mockito.ArgumentCaptor<ConversationSetting> captor = org.mockito.ArgumentCaptor
                .forClass(ConversationSetting.class);
        verify(conversationSettingRepository).saveAndFlush(captor.capture());
        ConversationSetting setting = captor.getValue();
        assertEquals(currentUser, setting.getUser());
        assertEquals(room, setting.getChatRoom());
        assertNotNull(setting.getClearedAt());
        verify(chatRoomReadStateRepository).saveAndFlush(any());
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
