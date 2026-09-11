package com.chatapp.repository;

import com.chatapp.model.ChatRoom;
import com.chatapp.model.Message;
import com.chatapp.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;

import static org.junit.jupiter.api.Assertions.assertEquals;

@DataJpaTest(properties = {"spring.jpa.hibernate.ddl-auto=create-drop", "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"})
class LocalMediaAuthorizationTest {
    private static final String ID = "8c70df6a-ef7d-4fea-8bf6-090a38fd765f";
    private static final String FILE = ID + ".txt";
    @Autowired TestEntityManager entityManager;
    @Autowired MessageRepository messages;
    @Autowired ChatRoomRepository rooms;

    @Test
    void onlyDmParticipantsCanAccessAnUnrecalledAttachment() {
        User alice = user("alice");
        User bob = user("bob");
        user("mallory");
        Message message = message(alice);
        message.setReceiver(bob);
        entityManager.persistAndFlush(message);
        assertEquals(1, count("alice"));
        assertEquals(1, count("bob"));
        assertEquals(0, count("mallory"));
        message.setRecalled(true);
        entityManager.flush();
        assertEquals(0, count("bob"));
    }

    @Test
    void groupMediaRequiresCurrentMembershipIncludingForTheSender() {
        User alice = user("alice");
        User bob = user("bob");
        user("mallory");
        ChatRoom room = new ChatRoom();
        room.setName("Private group");
        room.setType(ChatRoom.RoomType.GROUP);
        room.setOwner(alice);
        entityManager.persistAndFlush(room);
        room.addMember(alice);
        room.addMember(bob);
        room.setAvatar("http://localhost:8080/api/uploads/media/" + FILE);
        entityManager.flush();
        Message message = message(alice);
        message.setChatRoom(room);
        entityManager.persistAndFlush(message);
        assertEquals(1, count("bob"));
        assertEquals(0, count("mallory"));
        assertEquals(1, rooms.countAccessibleLocalAvatars("bob", FILE));
        assertEquals(0, rooms.countAccessibleLocalAvatars("mallory", FILE));
        room.removeMemberByUserId(bob.getId());
        entityManager.flush();
        assertEquals(0, count("bob"));
        assertEquals(0, rooms.countAccessibleLocalAvatars("bob", FILE));
    }

    private long count(String username) { return messages.countAccessibleLocalMedia(username, ID, FILE); }

    private User user(String name) {
        User user = new User();
        user.setUsername(name);
        user.setPassword("unused");
        user.setEmail(name + "@example.test");
        return entityManager.persistAndFlush(user);
    }

    private Message message(User sender) {
        Message message = new Message();
        message.setSender(sender);
        message.setContent("attachment");
        message.setMediaPublicId(ID);
        message.setMediaUrl("http://localhost:8080/api/uploads/media/" + FILE);
        message.setRecalled(false);
        return message;
    }
}
