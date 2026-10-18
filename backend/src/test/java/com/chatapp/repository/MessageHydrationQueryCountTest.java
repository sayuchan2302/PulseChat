package com.chatapp.repository;

import com.chatapp.dto.response.MessageResponse;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.Message;
import com.chatapp.model.MessageReaction;
import com.chatapp.model.User;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.PageRequest;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards against the message hydration N+1 regression: replies, reactions,
 * mentions, hidden users, room members and their users must be batch-loaded
 * instead of one query per message.
 */
@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.generate_statistics=true"
})
class MessageHydrationQueryCountTest {
    private static final int PAGE_SIZE = 20;
    private static final long MAX_HYDRATION_QUERIES = 15;

    @Autowired TestEntityManager entityManager;
    @Autowired MessageRepository messages;
    @Autowired EntityManagerFactory entityManagerFactory;

    @Test
    void hydratingAPageOfRoomMessagesIssuesBoundedQueries() {
        User alice = user("alice");
        User bob = user("bob");
        User carol = user("carol");
        ChatRoom room = room(alice, bob, carol);

        List<Message> created = new ArrayList<>();
        Message previous = null;
        for (int i = 0; i < PAGE_SIZE; i++) {
            Message message = new Message();
            message.setSender(i % 2 == 0 ? alice : bob);
            message.setChatRoom(room);
            message.setType(Message.MessageType.TEXT);
            message.setContent("message " + i);
            message.setRecalled(false);
            if (previous != null && i % 3 == 0) {
                message.setReplyToMessage(previous);
            }
            if (i % 2 == 0) {
                message.getMentions().add(carol);
            }
            entityManager.persistAndFlush(message);
            if (i % 2 == 0) {
                MessageReaction reaction = new MessageReaction();
                reaction.setMessage(message);
                reaction.setUser(carol);
                reaction.setEmoji("+1");
                message.getReactions().add(reaction);
                entityManager.flush();
            }
            created.add(message);
            previous = message;
        }
        entityManager.flush();
        entityManager.clear();

        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        List<Message> page = messages.findRoomMessagePage(
                room.getId(), alice.getId(), null, null, PageRequest.of(0, PAGE_SIZE));
        assertEquals(PAGE_SIZE, page.size());
        page.forEach(message -> MessageResponse.from(message, alice.getId()));

        long queries = statistics.getPrepareStatementCount();
        assertTrue(queries <= MAX_HYDRATION_QUERIES,
                () -> "expected batched hydration (<= " + MAX_HYDRATION_QUERIES
                        + " queries) but " + queries + " queries were issued");
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
        room.setName("query-count-room");
        room.setType(ChatRoom.RoomType.GROUP);
        room.setOwner(members[0]);
        entityManager.persistAndFlush(room);
        for (User member : members) {
            room.addMember(member);
        }
        entityManager.flush();
        return room;
    }
}
