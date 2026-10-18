package com.chatapp.service;

import com.chatapp.dto.request.MediaAttachmentRequest;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.User;
import com.chatapp.repository.MediaUploadRepository;
import com.chatapp.repository.MessageRepository;
import com.chatapp.repository.ChatRoomRepository;
import com.chatapp.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MediaAccessServiceTest {
    @TempDir Path directory;
    private final MessageRepository messages = mock(MessageRepository.class);
    private final ChatRoomRepository rooms = mock(ChatRoomRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final MediaUploadRepository uploads = mock(MediaUploadRepository.class);
    private LocalMediaStorageService storage;
    private MediaAccessService access;
    private String filename;
    private String publicId;

    @BeforeEach
    void setUp() {
        storage = new LocalMediaStorageService(users, uploads);
        ReflectionTestUtils.setField(storage, "mediaDirectory", directory.toString());
        ReflectionTestUtils.setField(storage, "contextPath", "/api");
        ReflectionTestUtils.setField(storage, "dailyQuotaBytes", 1024L * 1024);
        User alice = new User();
        alice.setId(1L);
        when(users.findByUsername("alice")).thenReturn(Optional.of(alice));
        access = new MediaAccessService(storage, messages, rooms);
        var upload = storage.storeMedia(new MockMultipartFile("file", "note.txt", "text/plain", "private".getBytes()), "alice");
        publicId = upload.publicId();
        filename = publicId + ".txt";
    }

    @Test
    void ownerCanReadAnUploadBeforeSendingIt() {
        assertDoesNotThrow(() -> access.requireAccess("alice", filename));
        assertTrue(storage.loadMedia(filename).exists());
        verifyNoInteractions(messages);
    }

    @Test
    void nonParticipantCannotReadOrAttachSomeoneElsesUpload() {
        AppException denial = assertThrows(AppException.class, () -> access.requireAccess("bob", filename));
        assertEquals(ErrorCode.MEDIA_NOT_FOUND, denial.getErrorCode());
        assertThrows(AppException.class, () -> access.validateAttachment("bob", attachment(publicId)));
        assertThrows(AppException.class, () -> access.validateAvatar("bob", attachment(publicId).url()));
    }

    @Test
    void groupAvatarIsReadableByCurrentMembers() {
        when(rooms.countAccessibleLocalAvatars("bob", filename)).thenReturn(1L);
        assertDoesNotThrow(() -> access.requireAccess("bob", filename));
    }

    @Test
    void participantCanReadSharedMediaAndLosesAccessWhenNoAccessibleMessageRemains() {
        when(messages.countAccessibleLocalMedia("bob", publicId, filename)).thenReturn(1L, 0L);
        assertDoesNotThrow(() -> access.requireAccess("bob", filename));
        assertThrows(AppException.class, () -> access.requireAccess("bob", filename));
    }

    @Test
    void attachmentMustUseItsActualPublicIdAndCannotTraverseDirectories() {
        assertThrows(AppException.class, () -> access.validateAttachment("alice", attachment("some-other-file")));
        assertThrows(AppException.class, () -> access.requireAccess("alice", "../.owners/" + publicId));
        assertThrows(AppException.class, () -> storage.loadMedia("../secret.txt"));
        assertThrows(AppException.class, () -> access.validateAttachment("alice",
                new MediaAttachmentRequest("/api/uploads/media/../secret.txt", publicId, "raw", "txt", 7L, null, null, null)));
    }

    private MediaAttachmentRequest attachment(String id) {
        return new MediaAttachmentRequest("https://chat.example/api/uploads/media/" + filename,
                id, "raw", "txt", 7L, null, null, null);
    }
}
