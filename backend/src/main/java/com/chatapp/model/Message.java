package com.chatapp.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "messages",
        indexes = {
                @Index(name = "idx_messages_conversation_timestamp", columnList = "sender_id, receiver_id, timestamp"),
                @Index(name = "idx_messages_sender_receiver_id", columnList = "sender_id, receiver_id, id"),
                @Index(name = "idx_messages_unread_receiver_sender", columnList = "receiver_id, read, sender_id"),
                @Index(name = "idx_messages_room_timestamp", columnList = "chat_room_id, timestamp"),
                @Index(name = "idx_messages_room_id", columnList = "chat_room_id, id"),
                @Index(name = "uk_messages_sender_client", columnList = "sender_id, client_id", unique = true)
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Message {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 5000)
    private String content;

    @Column(name = "client_id", length = 100)
    private String clientId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id", nullable = false)
    private User sender;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "receiver_id")
    private User receiver;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chat_room_id")
    private ChatRoom chatRoom;

    @Column(nullable = false)
    private Boolean read = false;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime timestamp;
}
