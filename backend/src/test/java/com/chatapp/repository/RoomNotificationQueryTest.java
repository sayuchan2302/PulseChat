package com.chatapp.repository;

import com.chatapp.model.ChatRoom;
import com.chatapp.model.ChatRoomReadState;
import com.chatapp.model.Message;
import com.chatapp.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Guards the batched room-notification queries against the single-user variants. */
@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"
})
class RoomNotificationQueryTest {
    @Autowired TestEntityManager entityManager;
    @Autowired MessageRepository messages;

    @Test
    void batchedUnreadCountsMatchThePerUserQuery() {
        User alice = user("alice");
        User bob = user("bob");
        User carol = user("carol");
        ChatRoom room = room(alice, bob, carol);

        roomMessage(alice, room);
        Message hiddenForCarol = roomMessage(alice, room);
        roomMessage(bob, room);
        entityManager.flush();

        hiddenForCarol.getHiddenByUsers().add(carol);
        ChatRoomReadState bobReadState = new ChatRoomReadState();
        bobReadState.setChatRoom(room);
        bobReadState.setUser(bob);
        bobReadState.setLastReadAt(LocalDateTime.now().plusDays(1));
        entityManager.persistAndFlush(bobReadState);

        Map<Long, Long> batched = messages
                .countUnreadRoomMessagesByUser(room.getId(), List.of(alice.getId(), bob.getId(), carol.getId()))
                .stream()
                .collect(Collectors.toMap(
                        MessageRepository.UnreadCountProjection::getUserId,
                        MessageRepository.UnreadCountProjection::getUnreadCount));

        assertEquals(1L, batched.get(alice.getId()));
        assertEquals(0L, batched.get(bob.getId()));
        assertEquals(2L, batched.get(carol.getId()));

        for (User user : List.of(alice, bob, carol)) {
            long perUser = messages.countUnreadRoomMessages(user.getId(), List.of(room.getId()))
                    .stream()
                    .mapToLong(MessageRepository.RoomUnreadCountProjection::getUnreadCount)
                    .sum();
            assertEquals(perUser, batched.getOrDefault(user.getId(), 0L),
                    "batched unread count mismatch for " + user.getUsername());
        }
    }

    @Test
    void privateConversationActivityIsGroupedPerPartnerInBothDirections() {
        User alice = user("alice");
        User bob = user("bob");
        User carol = user("carol");

        Message toBob = directMessage(alice, bob, "hello");
        Message toCarol = directMessage(alice, carol, "hey");
        Message fromCarol = directMessage(carol, alice, "again");

        assertEquals(
                Map.of(bob.getId(), toBob.getId(), carol.getId(), toCarol.getId()),
                latestByPartner(messages.findLatestSentActivityByReceiver(alice.getId())));
        assertEquals(
                Map.of(carol.getId(), fromCarol.getId()),
                latestByPartner(messages.findLatestReceivedActivityBySender(alice.getId())));
    }

    private Map<Long, Long> latestByPartner(List<MessageRepository.PartnerActivityProjection> activity) {
        return activity.stream()
                .collect(Collectors.toMap(
                        MessageRepository.PartnerActivityProjection::getPartnerId,
                        MessageRepository.PartnerActivityProjection::getLatestMessageId));
    }

    private User user(String name) {
        User user = new User();
        user.setUsername(name);
        user.setPassword("unused");
        user.setEmail(name + "@example.test");
        return entityManager.persistAndFlush(user);
    }

    private ChatRoom room(User... members) {
        ChatRoom room = new ChatRoom();
        room.setName("notification-room");
        room.setType(ChatRoom.RoomType.GROUP);
        room.setOwner(members[0]);
        entityManager.persistAndFlush(room);
        for (User member : members) {
            room.addMember(member);
        }
        entityManager.flush();
        return room;
    }

    private Message roomMessage(User sender, ChatRoom room) {
        Message message = new Message();
        message.setSender(sender);
        message.setChatRoom(room);
        message.setContent("room message");
        message.setRecalled(false);
        return entityManager.persistAndFlush(message);
    }

    private Message directMessage(User sender, User receiver, String content) {
        Message message = new Message();
        message.setSender(sender);
        message.setReceiver(receiver);
        message.setContent(content);
        message.setRecalled(false);
        return entityManager.persistAndFlush(message);
    }
}
