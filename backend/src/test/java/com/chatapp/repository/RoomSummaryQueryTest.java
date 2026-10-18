package com.chatapp.repository;

import com.chatapp.model.ChatRoom;
import com.chatapp.model.ConversationSetting;
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

/** Executes the AI-summary query on H2 so the clearedAt filter cannot silently break the fetch. */
@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"
})
class RoomSummaryQueryTest {
    @Autowired TestEntityManager entityManager;
    @Autowired MessageRepository messages;

    @Test
    void excludesMessagesAtOrBeforeTheClearMarker() {
        User alice = user("alice");
        User bob = user("bob");
        ChatRoom room = room(alice, bob);

        Message cleared = message(bob, room, "cleared", MessageType.TEXT);
        LocalDateTime marker = cleared.getTimestamp();
        Message visible = message(alice, room, "kept", MessageType.TEXT);
        message(bob, room, "not-text", MessageType.IMAGE);
        setting(alice, room, marker);

        List<Message> found = messages.findRecentSummarizableRoomMessages(
                room.getId(), MessageType.TEXT, "alice", PageRequest.of(0, 10));

        assertEquals(List.of(visible.getId()), found.stream().map(Message::getId).toList());
    }

    @Test
    void returnsEveryTextMessageWhenNoClearMarkerExists() {
        User alice = user("alice");
        User bob = user("bob");
        ChatRoom room = room(alice, bob);

        Message older = message(bob, room, "older", MessageType.TEXT);
        Message newer = message(alice, room, "newer", MessageType.TEXT);

        List<Message> found = messages.findRecentSummarizableRoomMessages(
                room.getId(), MessageType.TEXT, "alice", PageRequest.of(0, 10));

        assertEquals(List.of(newer.getId(), older.getId()), found.stream().map(Message::getId).toList());
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
        room.setName("summary-room");
        room.setType(ChatRoom.RoomType.GROUP);
        room.setOwner(members[0]);
        entityManager.persistAndFlush(room);
        for (User member : members) {
            room.addMember(member);
        }
        entityManager.flush();
        return room;
    }

    private Message message(User sender, ChatRoom room, String content, MessageType type) {
        Message message = new Message();
        message.setSender(sender);
        message.setChatRoom(room);
        message.setContent(content);
        message.setType(type);
        return entityManager.persistAndFlush(message);
    }

    private ConversationSetting setting(User user, ChatRoom room, LocalDateTime clearedAt) {
        ConversationSetting setting = new ConversationSetting();
        setting.setUser(user);
        setting.setChatRoom(room);
        setting.setClearedAt(clearedAt);
        return entityManager.persistAndFlush(setting);
    }
}
