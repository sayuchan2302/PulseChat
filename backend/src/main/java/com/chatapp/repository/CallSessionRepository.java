package com.chatapp.repository;

import com.chatapp.model.CallSession;
import com.chatapp.model.CallSession.CallStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CallSessionRepository extends JpaRepository<CallSession, Long> {
    @EntityGraph(attributePaths = {"caller", "receiver"})
    Optional<CallSession> findWithParticipantsById(Long id);

    @Query("""
            select count(callSession) > 0
            from CallSession callSession
            where (callSession.caller.id = :userId or callSession.receiver.id = :userId)
              and callSession.status in :statuses
            """)
    boolean existsActiveCallForUser(
            @Param("userId") Long userId,
            @Param("statuses") Collection<CallStatus> statuses
    );

    @EntityGraph(attributePaths = {"caller", "receiver"})
    List<CallSession> findByStatusAndCreatedAtBefore(CallStatus status, LocalDateTime createdAt);
}
