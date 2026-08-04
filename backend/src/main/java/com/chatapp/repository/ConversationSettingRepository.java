package com.chatapp.repository;

import com.chatapp.model.ConversationSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ConversationSettingRepository extends JpaRepository<ConversationSetting, Long> {
    List<ConversationSetting> findByUserId(Long userId);

    List<ConversationSetting> findByUserIdAndTargetUserIdIn(Long userId, List<Long> targetUserIds);

    List<ConversationSetting> findByUserIdAndChatRoomIdIn(Long userId, List<Long> roomIds);

    Optional<ConversationSetting> findByUserIdAndTargetUserId(Long userId, Long targetUserId);

    Optional<ConversationSetting> findByUserIdAndChatRoomId(Long userId, Long roomId);
}
