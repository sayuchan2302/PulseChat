package com.chatapp.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "user_blocks",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_user_blocks_blocker_blocked",
                columnNames = {"blocker_id", "blocked_user_id"}),
        indexes = {
                @Index(name = "idx_user_blocks_blocker", columnList = "blocker_id, created_at"),
                @Index(name = "idx_user_blocks_blocked", columnList = "blocked_user_id")
        })
@Getter
@Setter
@NoArgsConstructor
public class UserBlock {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "blocker_id", nullable = false)
    private User blocker;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "blocked_user_id", nullable = false)
    private User blockedUser;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
