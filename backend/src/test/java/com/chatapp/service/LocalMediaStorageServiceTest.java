package com.chatapp.service;

import com.chatapp.dto.response.LocalMediaUploadResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

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

    private LocalMediaStorageService storageService() {
        LocalMediaStorageService service = new LocalMediaStorageService();
        ReflectionTestUtils.setField(service, "mediaDirectory", mediaDirectory.toString());
        ReflectionTestUtils.setField(service, "contextPath", "/api");
        return service;
    }
}
