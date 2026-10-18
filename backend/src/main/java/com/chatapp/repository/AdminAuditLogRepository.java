package com.chatapp.repository;

import com.chatapp.model.AdminAuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AdminAuditLogRepository extends JpaRepository<AdminAuditLog, Long> {
    @Query(value = """
            select log from AdminAuditLog log
            join fetch log.actor
            join fetch log.target
            order by log.createdAt desc, log.id desc
            """,
            countQuery = "select count(log) from AdminAuditLog log")
    Page<AdminAuditLog> findPageWithParticipants(Pageable pageable);
}
