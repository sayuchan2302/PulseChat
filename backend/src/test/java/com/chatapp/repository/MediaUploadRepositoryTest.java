package com.chatapp.repository;

import com.chatapp.model.MediaUpload;
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

@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"
})
class MediaUploadRepositoryTest {
    @Autowired TestEntityManager entityManager;
    @Autowired MediaUploadRepository uploads;

    @Test
    void findsOnlyUploadsThatNoMessageOrAvatarReferences() {
        User alice = user("alice");
        User bob = user("bob");
        MediaUpload referencedByMessage = upload(alice, "11111111-1111-1111-1111-111111111111");
        MediaUpload referencedByAvatar = upload(alice, "22222222-2222-2222-2222-222222222222");
        MediaUpload orphan = upload(bob, "33333333-3333-3333-3333-333333333333");
        alice.setAvatar("http://localhost/api/uploads/media/" + referencedByAvatar.getPublicId() + ".png");
        entityManager.flush();

        Message message = new Message();
        message.setSender(alice);
        message.setReceiver(bob);
        message.setContent("see attachment");
        message.setType(MessageType.TEXT);
        message.setMediaPublicId(referencedByMessage.getPublicId());
        entityManager.persistAndFlush(message);

        List<MediaUpload> orphans = uploads.findOrphans(
                LocalDateTime.now().plusSeconds(5),
                PageRequest.of(0, 10)
        );

        assertEquals(List.of(orphan), orphans);
    }

    private User user(String name) {
        User user = new User();
        user.setUsername(name);
        user.setPassword("unused");
        user.setEmail(name + "@example.test");
        return entityManager.persistAndFlush(user);
    }

    private MediaUpload upload(User owner, String publicId) {
        MediaUpload upload = new MediaUpload();
        upload.setUser(owner);
        upload.setPublicId(publicId);
        upload.setFormat("png");
        upload.setSizeBytes(10L);
        return entityManager.persistAndFlush(upload);
    }
}
