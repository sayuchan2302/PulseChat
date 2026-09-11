package com.chatapp.repository;

import com.chatapp.model.ChatRoom;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, Long> {
    @Query("""
            select count(room) from ChatRoom room join room.members member
            where member.user.username = :username
              and room.avatar like concat('%/uploads/media/', :filename)
            """)
    long countAccessibleLocalAvatars(@Param("username") String username, @Param("filename") String filename);

    @EntityGraph(attributePaths = { "members.user", "owner" })
    List<ChatRoom> findDistinctByMembersUserIdAndTypeOrderByCreatedAtDesc(
            Long memberId,
            ChatRoom.RoomType type);

    @EntityGraph(attributePaths = { "members.user", "owner" })
    Optional<ChatRoom> findByIdAndType(Long id, ChatRoom.RoomType type);

    @EntityGraph(attributePaths = { "members.user", "owner" })
    Optional<ChatRoom> findByInviteCode(String inviteCode);
}
