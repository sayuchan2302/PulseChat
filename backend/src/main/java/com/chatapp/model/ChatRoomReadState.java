package com.chatapp.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "chat_room_read_states",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_chat_room_read_state_room_user",
                        columnNames = {"chat_room_id", "user_id"}
                )
        },
        indexes = {
                @Index(name = "idx_chat_room_read_states_user", columnList = "user_id"),
                @Index(name = "idx_chat_room_read_states_room", columnList = "chat_room_id")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ChatRoomReadState {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chat_room_id", nullable = false)
    private ChatRoom chatRoom;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private LocalDateTime lastReadAt;
}
