package com.chatapp.service;

import com.chatapp.dto.request.UpdateConversationSettingRequest;
import com.chatapp.dto.response.ConversationSettingResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.ConversationSetting;
import com.chatapp.model.User;
import com.chatapp.repository.ConversationSettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ConversationSettingService {
    private final ConversationSettingRepository conversationSettingRepository;
    private final UserService userService;
    private final FriendshipService friendshipService;
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

        if (!friendshipService.areFriends(currentUser, targetUser)) {
            throw new AppException(ErrorCode.FRIENDSHIP_REQUIRED);
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
}
