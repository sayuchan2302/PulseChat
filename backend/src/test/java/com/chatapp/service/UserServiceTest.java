package com.chatapp.service;

import com.chatapp.dto.response.UserResponse;
import com.chatapp.model.User;
import com.chatapp.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    @Mock
    private UserRepository userRepository;

    @Mock
    private LocalAvatarStorageService localAvatarStorageService;

    @InjectMocks
    private UserService userService;

    @Test
    void updateProfileStoresTrimmedFullNameAndAvatarUrl() {
        User user = user();
        MockMultipartFile avatar = new MockMultipartFile(
                "avatar",
                "avatar.png",
                "image/png",
                new byte[] {1}
        );
        when(userRepository.findByUsername("sayu")).thenReturn(Optional.of(user));
        when(localAvatarStorageService.storeAvatar(avatar)).thenReturn("/api/uploads/avatars/avatar.png");
        when(userRepository.save(user)).thenReturn(user);

        UserResponse response = userService.updateProfile("sayu", "  Ngoc Thinh  ", "  Building chat  ", avatar);

        assertEquals("Ngoc Thinh", user.getFullName());
        assertEquals("Building chat", user.getBio());
        assertEquals("/api/uploads/avatars/avatar.png", user.getAvatar());
        assertEquals("Ngoc Thinh", response.fullName());
        assertEquals("Building chat", response.bio());
        assertEquals("/api/uploads/avatars/avatar.png", response.avatar());
        verify(localAvatarStorageService).storeAvatar(avatar);
    }

    @Test
    void updateProfileFallsBackToUsernameWhenFullNameIsBlank() {
        User user = user();
        when(userRepository.findByUsername("sayu")).thenReturn(Optional.of(user));
        when(userRepository.save(user)).thenReturn(user);

        UserResponse response = userService.updateProfile("sayu", "   ", "   ", null);

        assertNull(user.getFullName());
        assertNull(user.getBio());
        assertEquals("sayu", response.fullName());
    }

    @Test
    void updateOnlineStatusStoresLastSeenWhenUserGoesOffline() {
        User user = user();
        user.setOnline(true);
        when(userRepository.findByUsername("sayu")).thenReturn(Optional.of(user));

        LocalDateTime before = LocalDateTime.now().minusSeconds(1);
        userService.updateOnlineStatus("sayu", false);

        assertEquals(false, user.getOnline());
        assertNotNull(user.getLastSeenAt());
        assertTrue(user.getLastSeenAt().isAfter(before));
    }

    private User user() {
        User user = new User();
        user.setId(1L);
        user.setUsername("sayu");
        user.setEmail("sayu@example.com");
        user.setPassword("hashed-password");
        user.setOnline(false);
        return user;
    }
}
