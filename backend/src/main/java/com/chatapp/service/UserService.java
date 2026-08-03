package com.chatapp.service;

import com.chatapp.dto.response.PresenceResponse;
import com.chatapp.dto.response.UserResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.User;
import com.chatapp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;
    private final LocalAvatarStorageService localAvatarStorageService;

    @Transactional(readOnly = true)
    public List<UserResponse> listOtherUsers(String currentUsername) {
        return listOtherUsers(currentUsername, null);
    }

    @Transactional(readOnly = true)
    public List<UserResponse> listOtherUsers(String currentUsername, String usernameQuery) {
        String normalizedQuery = normalizeSearchQuery(usernameQuery);
        List<User> users = normalizedQuery.isBlank()
                ? userRepository.findAllByUsernameNotOrderByUsernameAsc(currentUsername)
                : userRepository.findAllByUsernameContainingIgnoreCaseAndUsernameNotOrderByUsernameAsc(
                        normalizedQuery,
                        currentUsername
                );

        return users
                .stream()
                .map(UserResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public User findByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public User findById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    @Transactional
    public UserResponse updateProfile(
            String username,
            String fullName,
            String bio,
            MultipartFile avatarFile
    ) {
        User user = findByUsername(username);

        if (fullName != null) {
            user.setFullName(normalizeFullName(fullName));
        }

        if (bio != null) {
            user.setBio(normalizeBio(bio));
        }

        if (avatarFile != null && !avatarFile.isEmpty()) {
            user.setAvatar(localAvatarStorageService.storeAvatar(avatarFile));
        }

        return UserResponse.from(userRepository.save(user));
    }

    @Transactional
    public PresenceResponse updateOnlineStatus(String username, boolean online) {
        User user = findByUsername(username);
        user.setOnline(online);
        if (!online) {
            user.setLastSeenAt(LocalDateTime.now());
        }

        return new PresenceResponse(
                user.getId(),
                user.getUsername(),
                user.getOnline(),
                user.getLastSeenAt()
        );
    }

    @Transactional
    public void resetOnlineStatuses() {
        LocalDateTime resetTime = LocalDateTime.now();
        userRepository.findAll()
                .forEach(user -> {
                    if (Boolean.TRUE.equals(user.getOnline())) {
                        user.setLastSeenAt(resetTime);
                    }
                    user.setOnline(false);
                });
    }

    private String normalizeSearchQuery(String query) {
        return query == null ? "" : query.trim();
    }

    private String normalizeFullName(String fullName) {
        String normalized = fullName.trim();
        return normalized.isBlank() ? null : normalized;
    }

    private String normalizeBio(String bio) {
        String normalized = bio.trim();
        if (normalized.length() > 160) {
            throw new AppException(ErrorCode.VALIDATION_FAILED, "Bio must be 160 characters or fewer");
        }

        return normalized.isBlank() ? null : normalized;
    }
}
