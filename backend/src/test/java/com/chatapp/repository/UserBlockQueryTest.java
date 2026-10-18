package com.chatapp.repository;

import com.chatapp.model.User;
import com.chatapp.model.UserBlock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Executes the block lookups used by group membership checks on H2 so JPQL issues surface in tests. */
@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"
})
class UserBlockQueryTest {
    @Autowired TestEntityManager entityManager;
    @Autowired UserBlockRepository userBlocks;

    @Test
    void findBetweenUserAndOtherUsersMatchesBlocksInBothDirections() {
        User sayu = user("sayu");
        User alice = user("alice");
        User bob = user("bob");
        User charlie = user("charlie");

        block(sayu, bob);
        block(charlie, sayu);
        block(alice, bob);
        block(alice, charlie);

        assertEquals(
                List.of(bob.getId(), charlie.getId()),
                userBlocks.findBetweenUserAndOtherUsers(sayu.getId(), List.of(alice.getId(), bob.getId(), charlie.getId()))
                        .stream()
                        .map(userBlock -> otherUserId(userBlock, sayu.getId()))
                        .sorted()
                        .toList());
    }

    @Test
    void findBetweenUserAndOtherUsersReturnsNothingForUnblockedPairs() {
        User sayu = user("sayu");
        User alice = user("alice");

        assertEquals(
                List.of(),
                userBlocks.findBetweenUserAndOtherUsers(sayu.getId(), List.of(alice.getId())));
    }

    private static Long otherUserId(UserBlock userBlock, Long userId) {
        return userBlock.getBlocker().getId().equals(userId)
                ? userBlock.getBlockedUser().getId()
                : userBlock.getBlocker().getId();
    }

    private User user(String name) {
        User user = new User();
        user.setUsername(name);
        user.setPassword("unused");
        user.setEmail(name + "@example.test");
        return entityManager.persistAndFlush(user);
    }

    private UserBlock block(User blocker, User blockedUser) {
        UserBlock userBlock = new UserBlock();
        userBlock.setBlocker(blocker);
        userBlock.setBlockedUser(blockedUser);
        return entityManager.persistAndFlush(userBlock);
    }
}
