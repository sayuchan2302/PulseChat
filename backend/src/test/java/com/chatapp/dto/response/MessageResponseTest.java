package com.chatapp.dto.response;

import com.chatapp.model.Message;
import com.chatapp.model.User;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MessageResponseTest {
    @Test
    void replyPreviewIsRedactedOnlyForUsersWhoHidTheOriginalMessage() {
        User sender = user(1L, "alice");
        User hiddenFor = user(2L, "bob");

        Message original = new Message();
        original.setId(10L);
        original.setContent("private original text");
        original.setSender(sender);
        original.getHiddenByUsers().add(hiddenFor);

        Message reply = new Message();
        reply.setId(11L);
        reply.setContent("reply text");
        reply.setSender(sender);
        reply.setReplyToMessage(original);

        MessageResponse hiddenView = MessageResponse.from(reply, hiddenFor.getId());
        MessageResponse otherView = MessageResponse.from(reply, 3L);

        assertEquals("Message deleted for you", hiddenView.replyTo().content());
        assertEquals("private original text", otherView.replyTo().content());
    }

    private static User user(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        return user;
    }
}
