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
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "conversation_settings", uniqueConstraints = {
                @UniqueConstraint(name = "uk_conversation_settings_private", columnNames = { "user_id",
                                "target_user_id" }),
                @UniqueConstraint(name = "uk_conversation_settings_room", columnNames = { "user_id", "chat_room_id" })
}, indexes = {
                @Index(name = "idx_conversation_settings_user_private", columnList = "user_id, target_user_id"),
                @Index(name = "idx_conversation_settings_user_room", columnList = "user_id, chat_room_id"),
                @Index(name = "idx_conversation_settings_user_flags", columnList = "user_id, pinned, archived")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ConversationSetting {
        @Id
        @GeneratedValue(strategy = GenerationType.IDENTITY)
        private Long id;

        @ManyToOne(fetch = FetchType.LAZY)
        @JoinColumn(name = "user_id", nullable = false)
        private User user;

        @ManyToOne(fetch = FetchType.LAZY)
        @JoinColumn(name = "target_user_id")
        private User targetUser;

        @ManyToOne(fetch = FetchType.LAZY)
        @JoinColumn(name = "chat_room_id")
        private ChatRoom chatRoom;

        @Column(nullable = false)
        private Boolean pinned = false;

        @Column(nullable = false)
        private Boolean muted = false;

        @Column(nullable = false)
        private Boolean archived = false;

        @Column(name = "pinned_message_id")
        private Long pinnedMessageId;

        @Column(name = "cleared_at")
        private LocalDateTime clearedAt;

        @CreationTimestamp
        @Column(updatable = false)
        private LocalDateTime createdAt;

        @UpdateTimestamp
        private LocalDateTime updatedAt;
}
