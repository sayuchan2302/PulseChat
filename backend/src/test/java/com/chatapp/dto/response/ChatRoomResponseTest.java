package com.chatapp.dto.response;

import com.chatapp.model.ChatRoom;
import com.chatapp.model.ChatRoomMember;
import com.chatapp.model.User;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ChatRoomResponseTest {

    @Test
    void hidesInviteCodeFromRegularMembers() {
        User owner = user(1L, "owner");
        User member = user(2L, "member");
        ChatRoom room = groupRoom(owner, member);
        room.setOwner(owner);
        room.setInviteCode("secret-code");
        room.setInviteCodeEnabled(true);

        ChatRoomResponse response = ChatRoomResponse.from(room, null, 0, null, member.getId());

        assertNull(response.inviteCode());
        assertNull(response.inviteCodeEnabled());
    }

    @Test
    void exposesInviteCodeToOwnerAndModerators() {
        User owner = user(1L, "owner");
        User moderator = user(2L, "moderator");
        ChatRoom room = groupRoom(owner, moderator);
        room.setOwner(owner);
        room.setInviteCode("secret-code");
        room.setInviteCodeEnabled(true);
        room.findMemberByUserId(2L).orElseThrow().setRole(ChatRoomMember.Role.MODERATOR);

        ChatRoomResponse ownerView = ChatRoomResponse.from(room, null, 0, null, owner.getId());
        ChatRoomResponse moderatorView = ChatRoomResponse.from(room, null, 0, null, moderator.getId());

        assertEquals("secret-code", ownerView.inviteCode());
        assertEquals("secret-code", moderatorView.inviteCode());
    }

    private User user(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setFullName(username);
        user.setEmail(username + "@example.com");
        user.setOnline(false);
        return user;
    }

    private ChatRoom groupRoom(User... participants) {
        ChatRoom room = new ChatRoom();
        room.setId(10L);
        room.setName("Study group");
        room.setType(ChatRoom.RoomType.GROUP);
        room.setCreatedAt(LocalDateTime.of(2026, 8, 1, 9, 0));
        List.of(participants).forEach(room::addMember);
        return room;
    }
}
