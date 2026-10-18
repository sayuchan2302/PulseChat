package com.chatapp.repository;

import com.chatapp.model.Friendship;
import com.chatapp.model.Friendship.FriendshipStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {
    @EntityGraph(attributePaths = {"requester", "receiver"})
    Optional<Friendship> findByUserLowIdAndUserHighId(Long userLowId, Long userHighId);

    @EntityGraph(attributePaths = {"requester", "receiver"})
    Optional<Friendship> findById(Long id);

    @EntityGraph(attributePaths = {"requester", "receiver"})
    List<Friendship> findByReceiverUsernameAndStatusOrderByUpdatedAtDesc(
            String receiverUsername,
            FriendshipStatus status
    );

    @EntityGraph(attributePaths = {"requester", "receiver"})
    List<Friendship> findByRequesterUsernameAndStatusOrderByUpdatedAtDesc(
            String requesterUsername,
            FriendshipStatus status
    );

    long countByReceiverUsernameAndStatus(String receiverUsername, FriendshipStatus status);

    long countByRequesterUsernameAndStatus(String requesterUsername, FriendshipStatus status);

    boolean existsByUserLowIdAndUserHighIdAndStatus(
            Long userLowId,
            Long userHighId,
            FriendshipStatus status
    );

    @EntityGraph(attributePaths = {"requester", "receiver"})
    @Query("""
            select friendship from Friendship friendship
            where friendship.status = :status
              and (friendship.requester.id = :userId or friendship.receiver.id = :userId)
            order by friendship.updatedAt desc
            """)
    List<Friendship> findFriendshipsForUserByStatus(
            @Param("userId") Long userId,
            @Param("status") FriendshipStatus status
    );

    @EntityGraph(attributePaths = {"requester", "receiver"})
    @Query("""
            select friendship from Friendship friendship
            where friendship.requester.id = :userId or friendship.receiver.id = :userId
            """)
    List<Friendship> findFriendshipsForUser(@Param("userId") Long userId);

    @EntityGraph(attributePaths = {"requester", "receiver"})
    @Query("""
            select friendship from Friendship friendship
            where (friendship.requester.id = :userId and friendship.receiver.id in :otherUserIds)
               or (friendship.receiver.id = :userId and friendship.requester.id in :otherUserIds)
            """)
    List<Friendship> findBetweenUserAndOtherUsers(
            @Param("userId") Long userId,
            @Param("otherUserIds") List<Long> otherUserIds
    );

    @Query("""
            select friendship.receiver.username from Friendship friendship
            where friendship.status = :status
              and friendship.requester.id = :userId
            """)
    List<String> findAcceptedReceiverUsernames(
            @Param("userId") Long userId,
            @Param("status") FriendshipStatus status
    );

    @Query("""
            select friendship.requester.username from Friendship friendship
            where friendship.status = :status
              and friendship.receiver.id = :userId
            """)
    List<String> findAcceptedRequesterUsernames(
            @Param("userId") Long userId,
            @Param("status") FriendshipStatus status
    );
}
