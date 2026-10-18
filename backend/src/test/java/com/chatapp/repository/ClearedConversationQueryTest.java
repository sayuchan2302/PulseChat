package com.chatapp.repository;

import com.chatapp.model.Message;
import com.chatapp.model.Message.MessageType;
import com.chatapp.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies that the clear marker is applied inside the queries, before the page limit:
 * cleared messages must not consume page slots or break hasMore calculations.
 */
@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"
})
class ClearedConversationQueryTest {
    @Autowired TestEntityManager entityManager;
    @Autowired MessageRepository messages;

    @Test
    void clearedMessagesAreExcludedBeforeThePageLimitIsApplied() {
        User alice = user("alice");
        User bob = user("bob");
        privateMessage(bob, alice, "cleared one");
        Message lastCleared = privateMessage(alice, bob, "cleared two");
        LocalDateTime marker = lastCleared.getTimestamp();
        Message keptOne = privateMessage(alice, bob, "kept one");
        Message keptTwo = privateMessage(bob, alice, "kept two");

        List<Message> page = messages.findConversationPage(
                alice.getId(), bob.getId(), null, marker, PageRequest.of(0, 3));

        assertEquals(List.of(keptTwo.getId(), keptOne.getId()), page.stream().map(Message::getId).toList());
    }

    @Test
    void aroundAnchorPagesAlsoSkipClearedMessages() {
        User alice = user("alice");
        User bob = user("bob");
        privateMessage(alice, bob, "cleared one");
        Message lastCleared = privateMessage(bob, alice, "cleared two");
        LocalDateTime marker = lastCleared.getTimestamp();
        Message keptOne = privateMessage(alice, bob, "kept one");
        Message anchor = privateMessage(bob, alice, "anchor");

        List<Message> older = messages.findConversationMessagesBefore(
                alice.getId(), bob.getId(), anchor.getId(), marker, PageRequest.of(0, 10));

        assertEquals(List.of(keptOne.getId()), older.stream().map(Message::getId).toList());
    }

    private User user(String name) {
        User user = new User();
        user.setUsername(name);
        user.setPassword("unused");
        user.setEmail(name + "@example.test");
        return entityManager.persistAndFlush(user);
    }

    private Message privateMessage(User sender, User receiver, String content) {
        Message message = new Message();
        message.setSender(sender);
        message.setReceiver(receiver);
        message.setContent(content);
        message.setType(MessageType.TEXT);
        return entityManager.persistAndFlush(message);
    }
}
