package com.chatapp.repository;

import com.chatapp.model.ChatRoomReadState;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ChatRoomReadStateRepository extends JpaRepository<ChatRoomReadState, Long> {
    Optional<ChatRoomReadState> findByChatRoomIdAndUserId(Long chatRoomId, Long userId);
}
