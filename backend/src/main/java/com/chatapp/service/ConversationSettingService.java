package com.chatapp.service;

import com.chatapp.dto.request.UpdateConversationSettingRequest;
import com.chatapp.dto.response.ConversationSettingResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.ChatRoomReadState;
import com.chatapp.model.ConversationSetting;
import com.chatapp.model.User;
import com.chatapp.repository.ConversationSettingRepository;
import com.chatapp.repository.ChatRoomReadStateRepository;
import com.chatapp.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ConversationSettingService {
    private final ConversationSettingRepository conversationSettingRepository;
    private final MessageRepository messageRepository;
    private final ChatRoomReadStateRepository chatRoomReadStateRepository;
    private final UserService userService;
    private final ChatRoomService chatRoomService;

    @Transactional(readOnly = true)
    public List<ConversationSettingResponse> listSettings(String currentUsername) {
        User currentUser = userService.findByUsername(currentUsername);
        return conversationSettingRepository.findByUserId(currentUser.getId())
                .stream()
                .map(ConversationSettingResponse::from)
                .toList();
    }

    @Transactional
    public ConversationSettingResponse updatePrivateSetting(
            String currentUsername,
            Long targetUserId,
            UpdateConversationSettingRequest request
    ) {
        User currentUser = userService.findByUsername(currentUsername);
        User targetUser = userService.findById(targetUserId);
        if (currentUser.getId().equals(targetUser.getId())) {
            throw new AppException(ErrorCode.SELF_CONVERSATION_NOT_ALLOWED);
        }

        ConversationSetting setting = conversationSettingRepository
                .findByUserIdAndTargetUserId(currentUser.getId(), targetUser.getId())
                .orElseGet(() -> {
                    ConversationSetting newSetting = new ConversationSetting();
                    newSetting.setUser(currentUser);
                    newSetting.setTargetUser(targetUser);
                    return newSetting;
                });

        applyPatch(setting, request);
        return ConversationSettingResponse.from(conversationSettingRepository.saveAndFlush(setting));
    }

    @Transactional
    public ConversationSettingResponse updateRoomSetting(
            String currentUsername,
            Long roomId,
            UpdateConversationSettingRequest request
    ) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = chatRoomService.findGroupRoomForMember(currentUser, roomId);
        ConversationSetting setting = conversationSettingRepository
                .findByUserIdAndChatRoomId(currentUser.getId(), room.getId())
                .orElseGet(() -> {
                    ConversationSetting newSetting = new ConversationSetting();
                    newSetting.setUser(currentUser);
                    newSetting.setChatRoom(room);
                    return newSetting;
                });

        applyPatch(setting, request);
        return ConversationSettingResponse.from(conversationSettingRepository.saveAndFlush(setting));
    }

    @Transactional
    public void deletePrivateConversation(String currentUsername, Long targetUserId) {
        User currentUser = userService.findByUsername(currentUsername);
        User targetUser = userService.findById(targetUserId);
        if (currentUser.getId().equals(targetUser.getId())) {
            throw new AppException(ErrorCode.SELF_CONVERSATION_NOT_ALLOWED);
        }

        ConversationSetting setting = conversationSettingRepository
                .findByUserIdAndTargetUserId(currentUser.getId(), targetUser.getId())
                .orElseGet(() -> newPrivateSetting(currentUser, targetUser));
        clearConversation(setting);
        conversationSettingRepository.saveAndFlush(setting);
        messageRepository.markConversationAsRead(targetUser.getId(), currentUser.getId());
    }

    @Transactional
    public void deleteRoomConversation(String currentUsername, Long roomId) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = chatRoomService.findGroupRoomForMember(currentUser, roomId);
        ConversationSetting setting = conversationSettingRepository
                .findByUserIdAndChatRoomId(currentUser.getId(), room.getId())
                .orElseGet(() -> newRoomSetting(currentUser, room));
        clearConversation(setting);
        conversationSettingRepository.saveAndFlush(setting);
        markRoomAsRead(room, currentUser);
    }

    private void applyPatch(ConversationSetting setting, UpdateConversationSettingRequest request) {
        if (request.pinned() != null) {
            setting.setPinned(request.pinned());
        }

        if (request.muted() != null) {
            setting.setMuted(request.muted());
        }

        if (request.archived() != null) {
            setting.setArchived(request.archived());
        }
    }

    private ConversationSetting newPrivateSetting(User currentUser, User targetUser) {
        ConversationSetting setting = new ConversationSetting();
        setting.setUser(currentUser);
        setting.setTargetUser(targetUser);
        return setting;
    }

    private ConversationSetting newRoomSetting(User currentUser, ChatRoom room) {
        ConversationSetting setting = new ConversationSetting();
        setting.setUser(currentUser);
        setting.setChatRoom(room);
        return setting;
    }

    private void clearConversation(ConversationSetting setting) {
        setting.setClearedAt(LocalDateTime.now());
        setting.setPinned(false);
        setting.setMuted(false);
        setting.setArchived(false);
        setting.setPinnedMessageId(null);
    }

    private void markRoomAsRead(ChatRoom room, User currentUser) {
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
    }
}
