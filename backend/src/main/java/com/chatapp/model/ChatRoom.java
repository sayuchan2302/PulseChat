package com.chatapp.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Entity
@Table(name = "chat_rooms", indexes = {
        @Index(name = "idx_chat_rooms_type_created", columnList = "type, created_at"),
        @Index(name = "idx_chat_rooms_owner", columnList = "owner_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ChatRoom {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RoomType type;

    @Column(length = 500)
    private String avatar;

    @Column(length = 64, unique = true)
    private String inviteCode;

    @Column(nullable = false, columnDefinition = "boolean default true")
    private Boolean inviteCodeEnabled = true;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private User owner;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pinned_message_id")
    private Message pinnedMessage;

    @OneToMany(mappedBy = "chatRoom", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ChatRoomMember> members = new ArrayList<>();

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    public Set<User> getParticipants() {
        return members.stream()
                .map(ChatRoomMember::getUser)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    public void addMember(User user) {
        addMember(user, ChatRoomMember.Role.MEMBER);
    }

    public void addMember(User user, ChatRoomMember.Role role) {
        if (hasMember(user.getId())) {
            return;
        }

        members.add(new ChatRoomMember(this, user, role == null ? ChatRoomMember.Role.MEMBER : role));
    }

    public void removeMemberByUserId(Long userId) {
        members.removeIf(member -> member.getUser().getId().equals(userId));
    }

    public boolean hasMember(Long userId) {
        return members.stream().anyMatch(member -> member.getUser().getId().equals(userId));
    }

    public Optional<ChatRoomMember> findMemberByUserId(Long userId) {
        return members.stream()
                .filter(member -> member.getUser().getId().equals(userId))
                .findFirst();
    }

    public ChatRoomMember.Role getMemberRole(Long userId) {
        return findMemberByUserId(userId)
                .map(ChatRoomMember::getRole)
                .orElse(ChatRoomMember.Role.MEMBER);
    }

    public enum RoomType {
        PRIVATE, GROUP
    }
}
