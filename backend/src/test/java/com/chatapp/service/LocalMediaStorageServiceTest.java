package com.chatapp.service;

import com.chatapp.dto.response.LocalMediaUploadResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipOutputStream;

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

    private LocalMediaStorageService storageService() {
        LocalMediaStorageService service = new LocalMediaStorageService();
        ReflectionTestUtils.setField(service, "mediaDirectory", mediaDirectory.toString());
        ReflectionTestUtils.setField(service, "contextPath", "/api");
        return service;
    }
}
