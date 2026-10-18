package com.chatapp.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "admin_audit_logs",
        indexes = {
                @Index(name = "idx_admin_audit_logs_target", columnList = "target_id, created_at"),
                @Index(name = "idx_admin_audit_logs_created_at", columnList = "created_at")
        }
)
@Getter
@Setter
@NoArgsConstructor
public class AdminAuditLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "actor_id", nullable = false)
    private User actor;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "target_id", nullable = false)
    private User target;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private AuditAction action;

    @Column(name = "previous_value", length = 50)
    private String previousValue;

    @Column(name = "new_value", length = 50)
    private String newValue;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public enum AuditAction {
        STATUS_CHANGE, ROLE_CHANGE
    }
}
