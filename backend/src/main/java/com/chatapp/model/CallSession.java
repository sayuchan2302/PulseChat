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
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "call_sessions",
        indexes = {
                @Index(name = "idx_call_sessions_caller", columnList = "caller_id, created_at"),
                @Index(name = "idx_call_sessions_receiver", columnList = "receiver_id, created_at"),
                @Index(name = "idx_call_sessions_status", columnList = "status"),
                @Index(name = "uk_call_sessions_active_caller", columnList = "active_caller_key", unique = true),
                @Index(name = "uk_call_sessions_active_receiver", columnList = "active_receiver_key", unique = true)
        }
)
@BatchSize(size = 50)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class CallSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "caller_id", nullable = false)
    private User caller;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "receiver_id", nullable = false)
    private User receiver;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CallType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CallStatus status = CallStatus.RINGING;

    /**
     * Mirrors {@code caller} while the call is active and is cleared for every terminal status,
     * so {@code uk_call_sessions_active_caller} can enforce at the database level what the
     * service pre-check cannot guarantee under concurrent invites: at most one active call per
     * user. Maintained by {@link #syncActiveCallKeys()} on every insert/update.
     */
    @Column(name = "active_caller_key")
    private Long activeCallerKey;

    @Column(name = "active_receiver_key")
    private Long activeReceiverKey;

    private LocalDateTime startedAt;

    private LocalDateTime endedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    private void syncActiveCallKeys() {
        boolean active = status == CallStatus.RINGING || status == CallStatus.ACCEPTED;
        activeCallerKey = active && caller != null ? caller.getId() : null;
        activeReceiverKey = active && receiver != null ? receiver.getId() : null;
    }

    public enum CallType {
        AUDIO, VIDEO
    }

    public enum CallStatus {
        RINGING, ACCEPTED, REJECTED, MISSED, ENDED, CANCELED, BUSY
    }
}
