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
    public UserResponse updateProfile(String username, String fullName, MultipartFile avatarFile) {
        User user = findByUsername(username);

        if (fullName != null) {
            user.setFullName(normalizeFullName(fullName));
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

        return new PresenceResponse(
                user.getId(),
                user.getUsername(),
                user.getOnline()
        );
    }

    @Transactional
    public void resetOnlineStatuses() {
        userRepository.findAll()
                .forEach(user -> user.setOnline(false));
    }

    private String normalizeSearchQuery(String query) {
        return query == null ? "" : query.trim();
    }

    private String normalizeFullName(String fullName) {
        String normalized = fullName.trim();
        return normalized.isBlank() ? null : normalized;
    }
}
