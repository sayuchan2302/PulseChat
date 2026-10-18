package com.chatapp.service;

import com.chatapp.dto.response.CloudinaryUploadSignatureResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.CloudinaryUpload;
import com.chatapp.model.User;
import com.chatapp.repository.CloudinaryUploadRepository;
import com.chatapp.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CloudinarySignatureServiceTest {
    @Mock
    private UserRepository userRepository;
    @Mock
    private CloudinaryUploadRepository cloudinaryUploadRepository;

    @Test
    void publicUploadsAreDisabledByDefaultEvenWithCredentials() {
        CloudinarySignatureService service = service("demo", "api-key", "secret", "chat/messages");
        ReflectionTestUtils.setField(service, "publicUploadsEnabled", false);

        AppException exception = assertThrows(
                AppException.class,
                () -> service.createUploadSignature("sayu"));

        assertEquals(ErrorCode.CLOUDINARY_PUBLIC_UPLOAD_DISABLED, exception.getErrorCode());
        verifyNoInteractions(userRepository);
        verifyNoInteractions(cloudinaryUploadRepository);
    }

    @Test
    void uploadSignaturePinsPublicIdAndSignsEveryParameter() throws NoSuchAlgorithmException {
        CloudinarySignatureService service = service("demo", "api-key", "secret", "chat/messages");
        User user = user(7L, "sayu");
        when(userRepository.findByUsername("sayu")).thenReturn(Optional.of(user));
        when(cloudinaryUploadRepository.countSince(anyLong(), any(LocalDateTime.class))).thenReturn(0L);

        CloudinaryUploadSignatureResponse response = service.createUploadSignature("sayu");

        assertEquals("demo", response.cloudName());
        assertEquals("api-key", response.apiKey());
        assertEquals("chat/messages", response.folder());
        assertEquals("auto", response.resourceType());
        assertEquals("https://api.cloudinary.com/v1_1/demo/auto/upload", response.uploadUrl());
        assertTrue(response.timestamp() > 0);
        assertEquals(36, response.publicId().length());
        UUID.fromString(response.publicId());
        assertEquals(
                sha1("allowed_formats=" + response.allowedFormats()
                        + "&folder=" + response.folder()
                        + "&public_id=" + response.publicId()
                        + "&timestamp=" + response.timestamp()
                        + "secret"),
                response.signature());

        ArgumentCaptor<CloudinaryUpload> recorded = ArgumentCaptor.forClass(CloudinaryUpload.class);
        verify(cloudinaryUploadRepository).save(recorded.capture());
        assertEquals(user, recorded.getValue().getUser());
        assertEquals(response.publicId(), recorded.getValue().getPublicId());
    }

    @Test
    void allowedFormatsExcludeHtmlAndSvg() {
        CloudinarySignatureService service = service("demo", "api-key", "secret", "chat/messages");
        when(userRepository.findByUsername("sayu")).thenReturn(Optional.of(user(7L, "sayu")));
        when(cloudinaryUploadRepository.countSince(anyLong(), any(LocalDateTime.class))).thenReturn(0L);

        CloudinaryUploadSignatureResponse response = service.createUploadSignature("sayu");

        List<String> formats = List.of(response.allowedFormats().split(","));
        assertTrue(formats.contains("jpg"));
        assertTrue(formats.contains("mp4"));
        assertTrue(formats.contains("pdf"));
        assertFalse(formats.contains("html"));
        assertFalse(formats.contains("svg"));
        assertFalse(formats.contains("js"));
    }

    @Test
    void uploadSignatureRequiresCloudinaryConfiguration() {
        CloudinarySignatureService service = service("", "api-key", "secret", "chat/messages");

        AppException exception = assertThrows(
                AppException.class,
                () -> service.createUploadSignature("sayu"));

        assertEquals(ErrorCode.CLOUDINARY_CONFIG_MISSING, exception.getErrorCode());
        verifyNoInteractions(userRepository);
    }

    @Test
    void uploadSignatureFailsSafeWhenAllowedFormatsAreEmpty() {
        CloudinarySignatureService service = service("demo", "api-key", "secret", "chat/messages");
        ReflectionTestUtils.setField(service, "allowedFormats", "");

        AppException exception = assertThrows(
                AppException.class,
                () -> service.createUploadSignature("sayu"));

        assertEquals(ErrorCode.CLOUDINARY_CONFIG_MISSING, exception.getErrorCode());
    }

    @Test
    void uploadSignatureIsRejectedWhenDailyQuotaIsReached() {
        CloudinarySignatureService service = service("demo", "api-key", "secret", "chat/messages");
        ReflectionTestUtils.setField(service, "dailySignatureQuota", 3L);
        when(userRepository.findByUsername("sayu")).thenReturn(Optional.of(user(7L, "sayu")));
        when(cloudinaryUploadRepository.countSince(anyLong(), any(LocalDateTime.class))).thenReturn(3L);

        AppException exception = assertThrows(
                AppException.class,
                () -> service.createUploadSignature("sayu"));

        assertEquals(ErrorCode.MEDIA_QUOTA_EXCEEDED, exception.getErrorCode());
        verify(cloudinaryUploadRepository, never()).save(any(CloudinaryUpload.class));
    }

    @Test
    void uploadSignatureIsRejectedForUnknownUser() {
        CloudinarySignatureService service = service("demo", "api-key", "secret", "chat/messages");
        when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());

        AppException exception = assertThrows(
                AppException.class,
                () -> service.createUploadSignature("ghost"));

        assertEquals(ErrorCode.UNAUTHORIZED, exception.getErrorCode());
    }

    private CloudinarySignatureService service(
            String cloudName,
            String apiKey,
            String apiSecret,
            String uploadFolder) {
        CloudinarySignatureService service =
                new CloudinarySignatureService(userRepository, cloudinaryUploadRepository);
        ReflectionTestUtils.setField(service, "cloudName", cloudName);
        ReflectionTestUtils.setField(service, "apiKey", apiKey);
        ReflectionTestUtils.setField(service, "apiSecret", apiSecret);
        ReflectionTestUtils.setField(service, "uploadFolder", uploadFolder);
        ReflectionTestUtils.setField(
                service,
                "allowedFormats",
                "jpg,png,webp,gif,mp4,webm,mov,avi,mkv,mp3,ogg,wav,pdf,zip,doc,docx,xls,xlsx,ppt,pptx,txt,csv,json");
        ReflectionTestUtils.setField(service, "publicUploadsEnabled", true);
        ReflectionTestUtils.setField(service, "dailySignatureQuota", 100L);
        return service;
    }

    private User user(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        return user;
    }

    private String sha1(String value) throws NoSuchAlgorithmException {
        MessageDigest digest = MessageDigest.getInstance("SHA-1");
        return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    }
}
