package com.chatapp.repository;

import com.chatapp.model.ChatRoom;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, Long> {
    @EntityGraph(attributePaths = {"participants", "owner"})
    List<ChatRoom> findDistinctByParticipantsIdAndTypeOrderByCreatedAtDesc(
            Long participantId,
            ChatRoom.RoomType type
    );

    @EntityGraph(attributePaths = {"participants", "owner"})
    Optional<ChatRoom> findByIdAndType(Long id, ChatRoom.RoomType type);
}
