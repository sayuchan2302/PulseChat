package com.chatapp.service;

import com.chatapp.model.MediaUpload;
import com.chatapp.repository.MediaUploadRepository;
import com.chatapp.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MediaOrphanCleanupServiceTest {
    private static final String PUBLIC_ID = "11111111-1111-1111-1111-111111111111";

    @TempDir
    Path mediaDirectory;

    @Test
    void deletesUnreferencedUploadsAndTheirRecords() throws Exception {
        Path stored = mediaDirectory.resolve(PUBLIC_ID + ".txt");
        Files.createDirectories(mediaDirectory.resolve(".owners"));
        Files.writeString(stored, "payload");
        Files.writeString(mediaDirectory.resolve(".owners").resolve(PUBLIC_ID), "sayu");
        MediaUpload orphan = upload(PUBLIC_ID, "txt");
        MediaUploadRepository uploads = mock(MediaUploadRepository.class);
        when(uploads.findOrphans(any(LocalDateTime.class), any(Pageable.class))).thenReturn(List.of(orphan));
        MediaOrphanCleanupService service = cleanupService(uploads);

        service.removeOrphanedUploads();

        assertFalse(Files.exists(stored));
        assertFalse(Files.exists(mediaDirectory.resolve(".owners").resolve(PUBLIC_ID)));
        verify(uploads).delete(orphan);
    }

    @Test
    void keepsUploadsThatAreStillReferenced() {
        MediaUploadRepository uploads = mock(MediaUploadRepository.class);
        when(uploads.findOrphans(any(LocalDateTime.class), any(Pageable.class))).thenReturn(List.of());
        MediaOrphanCleanupService service = cleanupService(uploads);

        service.removeOrphanedUploads();

        verify(uploads, never()).delete(any(MediaUpload.class));
    }

    private MediaOrphanCleanupService cleanupService(MediaUploadRepository uploads) {
        MediaOrphanCleanupService service = new MediaOrphanCleanupService(uploads, storageService());
        ReflectionTestUtils.setField(service, "orphanGraceHours", 24L);
        return service;
    }

    private LocalMediaStorageService storageService() {
        LocalMediaStorageService storage = new LocalMediaStorageService(
                mock(UserRepository.class),
                mock(MediaUploadRepository.class)
        );
        ReflectionTestUtils.setField(storage, "mediaDirectory", mediaDirectory.toString());
        return storage;
    }

    private static MediaUpload upload(String publicId, String format) {
        MediaUpload upload = new MediaUpload();
        upload.setPublicId(publicId);
        upload.setFormat(format);
        upload.setSizeBytes(10L);
        return upload;
    }
}
