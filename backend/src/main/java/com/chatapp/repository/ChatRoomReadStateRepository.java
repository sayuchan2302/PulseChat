package com.chatapp.repository;

import com.chatapp.model.ChatRoomReadState;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ChatRoomReadStateRepository extends JpaRepository<ChatRoomReadState, Long> {
    Optional<ChatRoomReadState> findByChatRoomIdAndUserId(Long chatRoomId, Long userId);

    @EntityGraph(attributePaths = {"user"})
    List<ChatRoomReadState> findByChatRoomIdAndLastReadAtGreaterThanEqualOrderByLastReadAtDesc(
            Long chatRoomId,
            LocalDateTime lastReadAt
    );
}
