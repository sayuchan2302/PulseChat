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

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private MessageType type = MessageType.TEXT;

    @Column(name = "media_url", length = 2048)
    private String mediaUrl;

    @Column(name = "media_public_id", length = 255)
    private String mediaPublicId;

    @Column(name = "media_resource_type", length = 20)
    private String mediaResourceType;

    @Column(name = "media_format", length = 20)
    private String mediaFormat;

    @Column(name = "media_bytes")
    private Long mediaBytes;

    @Column(name = "media_width")
    private Integer mediaWidth;

    @Column(name = "media_height")
    private Integer mediaHeight;

    @Column(name = "media_duration")
    private Double mediaDuration;

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

    public enum MessageType {
        TEXT, IMAGE, VIDEO
    }
}
