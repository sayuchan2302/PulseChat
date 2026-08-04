package com.chatapp.controller;

import com.chatapp.dto.request.UpdateConversationSettingRequest;
import com.chatapp.dto.response.ConversationSettingResponse;
import com.chatapp.service.ConversationSettingService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/conversation-settings")
@RequiredArgsConstructor
public class ConversationSettingController {
    private final ConversationSettingService conversationSettingService;

    @GetMapping
    public List<ConversationSettingResponse> listSettings(Authentication authentication) {
        return conversationSettingService.listSettings(authentication.getName());
    }

    @PatchMapping("/private/{userId}")
    public ConversationSettingResponse updatePrivateSetting(
            Authentication authentication,
            @PathVariable Long userId,
            @RequestBody UpdateConversationSettingRequest request
    ) {
        return conversationSettingService.updatePrivateSetting(authentication.getName(), userId, request);
    }

    @PatchMapping("/rooms/{roomId}")
    public ConversationSettingResponse updateRoomSetting(
            Authentication authentication,
            @PathVariable Long roomId,
            @RequestBody UpdateConversationSettingRequest request
    ) {
        return conversationSettingService.updateRoomSetting(authentication.getName(), roomId, request);
    }
}
