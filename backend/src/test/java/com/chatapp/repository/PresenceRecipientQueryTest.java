package com.chatapp.repository;

import com.chatapp.model.ChatRoom;
import com.chatapp.model.Friendship;
import com.chatapp.model.Friendship.FriendshipStatus;
import com.chatapp.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Executes the presence fan-out recipient queries on H2 so JPQL issues surface in tests. */
@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"
})
class PresenceRecipientQueryTest {
    @Autowired TestEntityManager entityManager;
    @Autowired FriendshipRepository friendships;
    @Autowired ChatRoomRepository rooms;

    @Test
    void coParticipantsSpanRoomsWithoutDuplicates() {
        User sayu = user("sayu");
        User alice = user("alice");
        User bob = user("bob");
        User charlie = user("charlie");

        room(sayu, alice, bob);
        room(sayu, bob, charlie);
        room(alice, charlie);

        List<String> recipients = rooms.findCoParticipantUsernames(sayu.getId());

        assertEquals(List.of("alice", "bob", "charlie"), recipients.stream().sorted().toList());
    }

    @Test
    void friendQueriesReturnOnlyAcceptedFriendshipsInBothDirections() {
        User sayu = user("sayu");
        User alice = user("alice");
        User bob = user("bob");
        User charlie = user("charlie");
        User dave = user("dave");

        friendship(sayu, alice, FriendshipStatus.ACCEPTED);
        friendship(charlie, sayu, FriendshipStatus.ACCEPTED);
        friendship(sayu, bob, FriendshipStatus.PENDING);
        friendship(sayu, dave, FriendshipStatus.DECLINED);

        assertEquals(
                List.of("alice"),
                friendships.findAcceptedReceiverUsernames(sayu.getId(), FriendshipStatus.ACCEPTED));
        assertEquals(
                List.of("charlie"),
                friendships.findAcceptedRequesterUsernames(sayu.getId(), FriendshipStatus.ACCEPTED));
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
        room.setName("presence-room");
        room.setType(ChatRoom.RoomType.GROUP);
        room.setOwner(members[0]);
        entityManager.persistAndFlush(room);
        for (User member : members) {
            room.addMember(member);
        }
        entityManager.flush();
        return room;
    }

    private Friendship friendship(User requester, User receiver, FriendshipStatus status) {
        Friendship friendship = new Friendship();
        friendship.setRequester(requester);
        friendship.setReceiver(receiver);
        friendship.setStatus(status);
        friendship.setUserLowId(Math.min(requester.getId(), receiver.getId()));
        friendship.setUserHighId(Math.max(requester.getId(), receiver.getId()));
        return entityManager.persistAndFlush(friendship);
    }
}
