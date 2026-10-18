package com.chatapp.service;

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

class LocalAvatarStorageServiceTest {
    @TempDir
    Path avatarDirectory;

    @Test
    void rejectsContentThatDoesNotMatchTheDeclaredType() {
        LocalAvatarStorageService service = avatarService();
        MockMultipartFile file = new MockMultipartFile(
                "avatar",
                "avatar.png",
                "image/png",
                "GIF89a\u0001\u0000\u0001\u0000".getBytes()
        );

        AppException exception = assertThrows(AppException.class, () -> service.storeAvatar(file));

        assertEquals(ErrorCode.INVALID_AVATAR_FILE, exception.getErrorCode());
    }

    @Test
    void rejectsHtmlDeclaredAsAnImage() {
        LocalAvatarStorageService service = avatarService();
        MockMultipartFile file = new MockMultipartFile(
                "avatar",
                "avatar.jpg",
                "image/jpeg",
                "<html><script>alert(1)</script></html>".getBytes()
        );

        AppException exception = assertThrows(AppException.class, () -> service.storeAvatar(file));

        assertEquals(ErrorCode.INVALID_AVATAR_FILE, exception.getErrorCode());
    }

    @Test
    void acceptsPngContentThatMatchesItsDeclaredType() {
        LocalAvatarStorageService service = avatarService();
        byte[] pngSignature = new byte[]{
                (byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a
        };
        MockMultipartFile file = new MockMultipartFile("avatar", "avatar.png", "image/png", pngSignature);

        String url = service.storeAvatar(file);

        assertTrue(url.startsWith("/api/uploads/avatars/"));
        assertTrue(url.endsWith(".png"));
        assertTrue(Files.exists(avatarDirectory.resolve(url.substring(url.lastIndexOf('/') + 1))));
    }

    @Test
    void acceptsJpegBytesDeclaredAsTheJpgAlias() {
        LocalAvatarStorageService service = avatarService();
        byte[] jpegHeader = new byte[]{
                (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 'J', 'F', 'I', 'F',
                0, 1, 1, 0, 0, 1, 0, 1, 0, 0
        };
        MockMultipartFile file = new MockMultipartFile("avatar", "avatar.jpg", "image/jpg", jpegHeader);

        String url = service.storeAvatar(file);

        assertTrue(url.endsWith(".jpg"));
    }

    private LocalAvatarStorageService avatarService() {
        LocalAvatarStorageService service = new LocalAvatarStorageService();
        ReflectionTestUtils.setField(service, "avatarDirectory", avatarDirectory.toString());
        ReflectionTestUtils.setField(service, "contextPath", "/api");
        return service;
    }
}
