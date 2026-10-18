package com.chatapp.service;

import com.chatapp.dto.response.LocalMediaUploadResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.MediaUpload;
import com.chatapp.model.User;
import com.chatapp.repository.MediaUploadRepository;
import com.chatapp.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LocalMediaStorageServiceTest {
    @TempDir
    Path mediaDirectory;

    @Test
    void usesServerSelectedExtensionInsteadOfClientFilename() {
        LocalMediaStorageService service = storageService();
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "payload.html",
                "text/plain",
                "message".getBytes()
        );

        LocalMediaUploadResponse response = service.storeMedia(file);

        assertTrue(response.url().endsWith(".txt"));
        assertEquals("txt", response.format());
        assertTrue(Files.exists(mediaDirectory.resolve(response.publicId() + ".txt")));
    }

    @Test
    void rejectsUnsupportedContentTypes() {
        LocalMediaStorageService service = storageService();
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "payload.svg",
                "image/svg+xml",
                "<svg/>".getBytes()
        );

        AppException exception = assertThrows(AppException.class, () -> service.storeMedia(file));

        assertEquals(ErrorCode.INVALID_MEDIA_FILE, exception.getErrorCode());
    }

    @Test
    void rejectsContentThatDoesNotMatchTheDeclaredType() {
        LocalMediaStorageService service = storageService();
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "payload.jpg",
                "image/jpeg",
                "<html><script>alert(1)</script></html>".getBytes()
        );

        AppException exception = assertThrows(AppException.class, () -> service.storeMedia(file));

        assertEquals(ErrorCode.INVALID_MEDIA_FILE, exception.getErrorCode());
    }

    @Test
    void acceptsAnImageWhenItsContentMatchesItsDeclaredType() {
        LocalMediaStorageService service = storageService();
        byte[] pngSignature = new byte[]{
                (byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a
        };
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "image.png",
                "image/png",
                pngSignature
        );

        LocalMediaUploadResponse response = service.storeMedia(file);

        assertEquals("png", response.format());
        assertTrue(Files.exists(mediaDirectory.resolve(response.publicId() + ".png")));
    }

    @Test
    void acceptsAnOfficeDocumentContainerWhenTikaDetectsItsZipSignature() throws Exception {
        LocalMediaStorageService service = storageService();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            // OOXML documents are ZIP containers; their MIME type depends on the filename.
        }
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "document.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                bytes.toByteArray()
        );

        LocalMediaUploadResponse response = service.storeMedia(file);

        assertEquals("docx", response.format());
        assertTrue(Files.exists(mediaDirectory.resolve(response.publicId() + ".docx")));
    }

    @Test
    void storeMediaRejectsUsersOverTheDailyQuota() {
        LocalMediaStorageService service = storageService();
        when(users.findByUsername("sayu")).thenReturn(Optional.of(user(7L)));
        when(uploads.sumSizeBytesSince(eq(7L), any(LocalDateTime.class))).thenReturn(1024L * 1024);
        MockMultipartFile file = new MockMultipartFile("file", "note.txt", "text/plain", "hello".getBytes());

        AppException exception = assertThrows(AppException.class, () -> service.storeMedia(file, "sayu"));

        assertEquals(ErrorCode.MEDIA_QUOTA_EXCEEDED, exception.getErrorCode());
    }

    @Test
    void storeMediaRecordsTheUploadForQuotaTracking() throws Exception {
        LocalMediaStorageService service = storageService();
        User owner = user(7L);
        when(users.findByUsername("sayu")).thenReturn(Optional.of(owner));
        when(uploads.sumSizeBytesSince(eq(7L), any(LocalDateTime.class))).thenReturn(0L);
        MockMultipartFile file = new MockMultipartFile("file", "note.txt", "text/plain", "hello".getBytes());

        LocalMediaUploadResponse response = service.storeMedia(file, "sayu");

        ArgumentCaptor<MediaUpload> captor = ArgumentCaptor.forClass(MediaUpload.class);
        verify(uploads).save(captor.capture());
        assertEquals(response.publicId(), captor.getValue().getPublicId());
        assertEquals("txt", captor.getValue().getFormat());
        assertEquals(5L, captor.getValue().getSizeBytes());
        assertEquals(owner, captor.getValue().getUser());
        assertEquals("sayu", Files.readString(mediaDirectory.resolve(".owners").resolve(response.publicId())));
    }

    private final UserRepository users = mock(UserRepository.class);
    private final MediaUploadRepository uploads = mock(MediaUploadRepository.class);

    private LocalMediaStorageService storageService() {
        LocalMediaStorageService service = new LocalMediaStorageService(users, uploads);
        ReflectionTestUtils.setField(service, "mediaDirectory", mediaDirectory.toString());
        ReflectionTestUtils.setField(service, "contextPath", "/api");
        ReflectionTestUtils.setField(service, "dailyQuotaBytes", 1024L * 1024);
        return service;
    }

    private static User user(Long id) {
        User user = new User();
        user.setId(id);
        return user;
    }
}
