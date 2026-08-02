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
}
