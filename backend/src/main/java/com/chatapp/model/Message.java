package com.chatapp.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "messages", indexes = {
        @Index(name = "idx_messages_conversation_timestamp", columnList = "sender_id, receiver_id, timestamp"),
        @Index(name = "idx_messages_sender_receiver_id", columnList = "sender_id, receiver_id, id"),
        @Index(name = "idx_messages_unread_receiver_sender", columnList = "receiver_id, read, sender_id"),
        @Index(name = "idx_messages_room_timestamp", columnList = "chat_room_id, timestamp"),
        @Index(name = "idx_messages_room_id", columnList = "chat_room_id, id"),
        @Index(name = "idx_messages_reply_to", columnList = "reply_to_message_id"),
        @Index(name = "idx_messages_call_session", columnList = "call_session_id"),
        @Index(name = "uk_messages_sender_client", columnList = "sender_id, client_id", unique = true)
})
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

    @Column(name = "link_preview_url", length = 2048)
    private String linkPreviewUrl;

    @Column(name = "link_preview_title", length = 255)
    private String linkPreviewTitle;

    @Column(name = "link_preview_description", length = 500)
    private String linkPreviewDescription;

    @Column(name = "link_preview_image_url", length = 2048)
    private String linkPreviewImageUrl;

    @Column(name = "link_preview_domain", length = 255)
    private String linkPreviewDomain;

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reply_to_message_id")
    private Message replyToMessage;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "call_session_id")
    private CallSession callSession;

    @Column(nullable = false)
    private Boolean recalled = false;

    @OneToMany(mappedBy = "message", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<MessageReaction> reactions = new HashSet<>();

    @Column(nullable = false)
    private Boolean read = false;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime timestamp;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    public enum MessageType {
        TEXT, IMAGE, VIDEO, AUDIO, CALL
    }
}
