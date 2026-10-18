package com.chatapp.repository;

import com.chatapp.model.UserBlock;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserBlockRepository extends JpaRepository<UserBlock, Long> {
    @EntityGraph(attributePaths = "blockedUser")
    List<UserBlock> findByBlockerIdOrderByCreatedAtDesc(Long blockerId);

    Optional<UserBlock> findByBlockerIdAndBlockedUserId(Long blockerId, Long blockedUserId);

    @Query("""
            select count(userBlock) > 0
            from UserBlock userBlock
            where (userBlock.blocker.id = :firstUserId and userBlock.blockedUser.id = :secondUserId)
               or (userBlock.blocker.id = :secondUserId and userBlock.blockedUser.id = :firstUserId)
            """)
    boolean existsBetweenUsers(
            @Param("firstUserId") Long firstUserId,
            @Param("secondUserId") Long secondUserId);

    @Query("""
            select userBlock from UserBlock userBlock
            where (userBlock.blocker.id = :userId and userBlock.blockedUser.id in :otherUserIds)
               or (userBlock.blockedUser.id = :userId and userBlock.blocker.id in :otherUserIds)
            """)
    List<UserBlock> findBetweenUserAndOtherUsers(
            @Param("userId") Long userId,
            @Param("otherUserIds") List<Long> otherUserIds);
}
