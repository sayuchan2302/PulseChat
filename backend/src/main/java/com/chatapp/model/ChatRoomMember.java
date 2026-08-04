package com.chatapp.model;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
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
@Table(
        name = "chat_room_participants",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_chat_room_participant",
                        columnNames = {"chat_room_id", "user_id"}
                )
        },
        indexes = {
                @Index(name = "idx_chat_room_participants_room", columnList = "chat_room_id"),
                @Index(name = "idx_chat_room_participants_user", columnList = "user_id")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ChatRoomMember {
    @EmbeddedId
    private ChatRoomMemberId id = new ChatRoomMemberId();

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("chatRoomId")
    @JoinColumn(name = "chat_room_id", nullable = false)
    private ChatRoom chatRoom;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("userId")
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(length = 80)
    private String nickname;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    public ChatRoomMember(ChatRoom chatRoom, User user) {
        this.chatRoom = chatRoom;
        this.user = user;
        this.id = new ChatRoomMemberId(
                chatRoom == null ? null : chatRoom.getId(),
                user == null ? null : user.getId()
        );
    }
}
