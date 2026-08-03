package com.chatapp.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum ErrorCode {
        USERNAME_ALREADY_EXISTS(HttpStatus.CONFLICT, "AUTH_001", "Username already exists"),
        EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT, "AUTH_002", "Email already exists"),
        INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "AUTH_003", "Invalid username or password"),

        USER_NOT_FOUND(HttpStatus.NOT_FOUND, "USER_001", "User not found"),
        INVALID_AVATAR_FILE(
                        HttpStatus.BAD_REQUEST,
                        "USER_002",
                        "Avatar must be a JPG, PNG, GIF, or WebP image up to 2MB"),
        AVATAR_UPLOAD_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "USER_003", "Unable to upload avatar"),

        FRIENDSHIP_NOT_FOUND(HttpStatus.NOT_FOUND, "FRIENDSHIP_001", "Friend request not found"),
        FRIENDSHIP_ACCESS_DENIED(HttpStatus.FORBIDDEN, "FRIENDSHIP_002", "You cannot update this friend request"),
        SELF_FRIEND_REQUEST_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "FRIENDSHIP_003",
                        "Cannot send a friend request to yourself"),
        FRIENDSHIP_ALREADY_PENDING(HttpStatus.CONFLICT, "FRIENDSHIP_004", "A friend request is already pending"),
        FRIENDSHIP_ALREADY_ACCEPTED(HttpStatus.CONFLICT, "FRIENDSHIP_005", "You are already friends"),
        FRIENDSHIP_NOT_PENDING(HttpStatus.CONFLICT, "FRIENDSHIP_006", "Friend request is not pending"),
        FRIENDSHIP_REQUIRED(HttpStatus.FORBIDDEN, "FRIENDSHIP_007",
                        "You must be friends before starting a private chat"),

        SELF_CONVERSATION_NOT_ALLOWED(
                        HttpStatus.BAD_REQUEST,
                        "MESSAGE_001",
                        "Cannot load a conversation with yourself"),
        SELF_MESSAGE_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "MESSAGE_002", "Cannot send message to yourself"),
        INVALID_MESSAGE_CONTENT(HttpStatus.BAD_REQUEST, "MESSAGE_003", "Message content is invalid"),
        INVALID_MEDIA_MESSAGE(HttpStatus.BAD_REQUEST, "MESSAGE_004", "Media message is invalid"),

        CLOUDINARY_CONFIG_MISSING(
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        "MEDIA_001",
                        "Media upload is not configured"),
        INVALID_MEDIA_FILE(
                        HttpStatus.BAD_REQUEST,
                        "MEDIA_002",
                        "Media file is invalid or exceeds maximum size limit"),
        MEDIA_UPLOAD_FAILED(
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        "MEDIA_003",
                        "Unable to upload media file"),

        ROOM_NOT_FOUND(HttpStatus.NOT_FOUND, "ROOM_001", "Chat room not found"),
        ROOM_ACCESS_DENIED(HttpStatus.FORBIDDEN, "ROOM_002", "You are not a member of this chat room"),
        GROUP_REQUIRES_PARTICIPANTS(
                        HttpStatus.BAD_REQUEST,
                        "ROOM_003",
                        "A group chat requires at least one other participant"),
        GROUP_REQUIRES_MINIMUM_MEMBERS(
                        HttpStatus.BAD_REQUEST,
                        "ROOM_004",
                        "A group chat requires at least 3 members"),

        VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "COMMON_001", "Validation failed"),
        MALFORMED_REQUEST(HttpStatus.BAD_REQUEST, "COMMON_002", "Malformed request body"),
        DATA_INTEGRITY_VIOLATION(HttpStatus.CONFLICT, "COMMON_003", "Data integrity violation"),
        UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "COMMON_004", "Authentication is required"),
        FORBIDDEN(HttpStatus.FORBIDDEN, "COMMON_005", "Access denied"),
        INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "COMMON_999", "Internal server error");

        private final HttpStatus status;
        private final String code;
        private final String defaultMessage;
}
