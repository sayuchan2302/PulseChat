package com.chatapp.service;

import com.chatapp.dto.request.AddRoomMembersRequest;
import com.chatapp.dto.request.CreateChatRoomRequest;
import com.chatapp.dto.request.TransferRoomOwnerRequest;
import com.chatapp.dto.request.UpdateChatRoomRequest;
import com.chatapp.dto.request.UpdateRoomMemberNicknameRequest;
import com.chatapp.dto.response.ChatRoomResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.ChatRoomMember;
import com.chatapp.model.ChatRoomReadState;
import com.chatapp.model.ConversationSetting;
import com.chatapp.model.Message;
import com.chatapp.model.User;
import com.chatapp.repository.ChatRoomReadStateRepository;
import com.chatapp.repository.ChatRoomRepository;
import com.chatapp.repository.ConversationSettingRepository;
import com.chatapp.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChatRoomService {
    private static final int MIN_GROUP_MEMBERS = 3;
    private static final int MIN_INVITED_PARTICIPANTS = MIN_GROUP_MEMBERS - 1;

    private final ChatRoomRepository chatRoomRepository;
    private final ChatRoomReadStateRepository chatRoomReadStateRepository;
    private final MessageRepository messageRepository;
    private final ConversationSettingRepository conversationSettingRepository;
    private final UserService userService;

    @Transactional
    public ChatRoomResponse createGroup(String currentUsername, CreateChatRoomRequest request) {
        User creator = userService.findByUsername(currentUsername);
        Set<Long> participantIds = new LinkedHashSet<>(request.participantIds());
        participantIds.remove(creator.getId());

        if (participantIds.size() < MIN_INVITED_PARTICIPANTS) {
            throw new AppException(ErrorCode.GROUP_REQUIRES_MINIMUM_MEMBERS);
        }

        ChatRoom room = new ChatRoom();
        room.setName(request.name().trim());
        room.setType(ChatRoom.RoomType.GROUP);
        room.setOwner(creator);
        room.setInviteCode(generateUniqueInviteCode());
        room.setInviteCodeEnabled(true);
        room.addMember(creator, ChatRoomMember.Role.OWNER);
        participantIds.stream()
                .map(userService::findById)
                .forEach(user -> room.addMember(user, ChatRoomMember.Role.MEMBER));

        return ChatRoomResponse.from(chatRoomRepository.saveAndFlush(room));
    }

    @Transactional(readOnly = true)
    public List<ChatRoomResponse> listGroups(String currentUsername) {
        User currentUser = userService.findByUsername(currentUsername);

        List<ChatRoom> rooms = chatRoomRepository
                .findDistinctByMembersUserIdAndTypeOrderByCreatedAtDesc(
                        currentUser.getId(),
                        ChatRoom.RoomType.GROUP);
        List<Long> roomIds = rooms.stream().map(ChatRoom::getId).toList();
        Map<Long, Message> latestMessagesByRoomId = findLatestMessagesByRoomId(roomIds);
        Map<Long, Long> unreadCountsByRoomId = countUnreadMessagesByRoomId(currentUser.getId(), roomIds);
        Map<Long, ConversationSetting> settingsByRoomId = findSettingsByRoomId(currentUser.getId(), roomIds);

        return rooms
                .stream()
                .filter(room -> isVisibleToCurrentUser(
                        latestMessagesByRoomId.get(room.getId()),
                        settingsByRoomId.get(room.getId())))
                .map(room -> ChatRoomResponse.from(
                        room,
                        latestMessagesByRoomId.get(room.getId()),
                        unreadCountsByRoomId.getOrDefault(room.getId(), 0L),
                        settingsByRoomId.get(room.getId())))
                .sorted(this::compareByConversationActivity)
                .toList();
    }

    @Transactional(readOnly = true)
    public ChatRoomResponse getGroup(String currentUsername, Long roomId) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);
        return toGroupResponseForUser(currentUser, room);
    }

    @Transactional
    public ChatRoomResponse markGroupAsRead(String currentUsername, Long roomId) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);
        ChatRoomReadState readState = chatRoomReadStateRepository
                .findByChatRoomIdAndUserId(room.getId(), currentUser.getId())
                .orElseGet(() -> {
                    ChatRoomReadState state = new ChatRoomReadState();
                    state.setChatRoom(room);
                    state.setUser(currentUser);
                    return state;
                });

        readState.setLastReadAt(LocalDateTime.now());
        chatRoomReadStateRepository.saveAndFlush(readState);

        Message latestMessage = findLatestMessagesByRoomId(List.of(room.getId())).get(room.getId());
        return ChatRoomResponse.from(room, latestMessage, 0, findSetting(currentUser.getId(), room.getId()));
    }

    @Transactional
    public ChatRoomResponse updateGroup(
            String currentUsername,
            Long roomId,
            UpdateChatRoomRequest request) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);
        validateGroupAdmin(room, currentUser);

        if (request.name() != null && !request.name().trim().isBlank()) {
            room.setName(request.name().trim());
        }

        if (request.avatar() != null) {
            room.setAvatar(request.avatar().trim().isBlank() ? null : request.avatar().trim());
        }

        return toGroupResponseForUser(currentUser, chatRoomRepository.saveAndFlush(room));
    }

    @Transactional
    public ChatRoomResponse addMembers(
            String currentUsername,
            Long roomId,
            AddRoomMembersRequest request) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);
        validateGroupAdmin(room, currentUser);

        Set<Long> existingParticipantIds = room.getMembers()
                .stream()
                .map(member -> member.getUser().getId())
                .collect(Collectors.toSet());
        Set<Long> newParticipantIds = new LinkedHashSet<>(request.participantIds());
        newParticipantIds.removeAll(existingParticipantIds);

        if (newParticipantIds.isEmpty()) {
            throw new AppException(ErrorCode.ROOM_MEMBER_ALREADY_EXISTS);
        }

        newParticipantIds.stream()
                .map(userService::findById)
                .forEach(user -> room.addMember(user, ChatRoomMember.Role.MEMBER));

        return toGroupResponseForUser(currentUser, chatRoomRepository.saveAndFlush(room));
    }

    @Transactional
    public ChatRoomResponse removeMember(String currentUsername, Long roomId, Long memberId) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);
        ChatRoomMember currentMember = room.findMemberByUserId(currentUser.getId())
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_ACCESS_DENIED));

        ChatRoomMember targetMember = room.findMemberByUserId(memberId)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_MEMBER_NOT_FOUND));

        User effectiveOwner = findEffectiveOwner(room);
        if (effectiveOwner.getId().equals(memberId)) {
            throw new AppException(ErrorCode.ROOM_OWNER_CANNOT_BE_REMOVED);
        }

        boolean isOwner = effectiveOwner.getId().equals(currentUser.getId());
        boolean isModerator = currentMember.getRole() == ChatRoomMember.Role.MODERATOR;

        if (!isOwner && !isModerator) {
            throw new AppException(ErrorCode.ROOM_ADMIN_REQUIRED);
        }

        if (isModerator && !isOwner) {
            if (targetMember.getRole() == ChatRoomMember.Role.OWNER
                    || targetMember.getRole() == ChatRoomMember.Role.MODERATOR) {
                throw new AppException(ErrorCode.CANNOT_REMOVE_ADMIN);
            }
        }

        if (room.getMembers().size() <= MIN_GROUP_MEMBERS) {
            throw new AppException(ErrorCode.GROUP_REQUIRES_MINIMUM_MEMBERS);
        }

        room.removeMemberByUserId(memberId);
        return toGroupResponseForUser(currentUser, chatRoomRepository.saveAndFlush(room));
    }

    @Transactional
    public ChatRoomResponse updateMemberRole(
            String currentUsername,
            Long roomId,
            Long memberId,
            com.chatapp.dto.request.UpdateMemberRoleRequest request) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);
        validateGroupOwner(room, currentUser);

        if (currentUser.getId().equals(memberId)) {
            throw new AppException(ErrorCode.VALIDATION_FAILED, "Cannot change your own role");
        }

        ChatRoomMember targetMember = room.findMemberByUserId(memberId)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_MEMBER_NOT_FOUND));

        if (request.role() == ChatRoomMember.Role.OWNER) {
            throw new AppException(ErrorCode.VALIDATION_FAILED, "Use transfer ownership to assign owner");
        }

        targetMember.setRole(request.role());
        return toGroupResponseForUser(currentUser, chatRoomRepository.saveAndFlush(room));
    }

    @Transactional
    public ChatRoomResponse updateMemberNickname(
            String currentUsername,
            Long roomId,
            Long memberId,
            UpdateRoomMemberNicknameRequest request) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);

        // Allow user to change their own nickname or Admin/Owner to change others'
        // nicknames
        if (!currentUser.getId().equals(memberId)) {
            validateGroupAdmin(room, currentUser);
        }

        ChatRoomMember member = room.findMemberByUserId(memberId)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_MEMBER_NOT_FOUND));
        member.setNickname(normalizeNickname(request.nickname()));

        return toGroupResponseForUser(currentUser, chatRoomRepository.saveAndFlush(room));
    }

    @Transactional
    public ChatRoomResponse transferOwner(
            String currentUsername,
            Long roomId,
            TransferRoomOwnerRequest request) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);
        validateGroupOwner(room, currentUser);

        ChatRoomMember nextOwnerMember = room.findMemberByUserId(request.ownerId())
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_MEMBER_NOT_FOUND));
        if (nextOwnerMember.getUser().getId().equals(currentUser.getId())) {
            return toGroupResponseForUser(currentUser, room);
        }

        // Demote current owner to MODERATOR, promote new owner to OWNER
        room.findMemberByUserId(currentUser.getId()).ifPresent(m -> m.setRole(ChatRoomMember.Role.MODERATOR));
        nextOwnerMember.setRole(ChatRoomMember.Role.OWNER);
        room.setOwner(nextOwnerMember.getUser());

        return toGroupResponseForUser(currentUser, chatRoomRepository.saveAndFlush(room));
    }

    @Transactional
    public ChatRoomResponse leaveGroup(String currentUsername, Long roomId) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);

        if (room.getMembers().size() <= 1) {
            throw new AppException(ErrorCode.ROOM_LAST_MEMBER_CANNOT_LEAVE);
        }

        User currentOwner = findEffectiveOwner(room);
        room.removeMemberByUserId(currentUser.getId());
        if (currentOwner != null && currentOwner.getId().equals(currentUser.getId())) {
            // Find a moderator or oldest member to promote to OWNER
            ChatRoomMember nextOwner = room.getMembers()
                    .stream()
                    .filter(m -> m.getRole() == ChatRoomMember.Role.MODERATOR)
                    .findFirst()
                    .orElseGet(() -> room.getMembers().get(0));
            nextOwner.setRole(ChatRoomMember.Role.OWNER);
            room.setOwner(nextOwner.getUser());
        }

        ChatRoom savedRoom = chatRoomRepository.saveAndFlush(room);
        Message latestMessage = findLatestMessagesByRoomId(List.of(savedRoom.getId())).get(savedRoom.getId());
        return ChatRoomResponse.from(savedRoom, latestMessage, 0, findSetting(currentUser.getId(), savedRoom.getId()));
    }

    @Transactional
    public com.chatapp.dto.response.GroupInviteResponse getInviteLink(String currentUsername, Long roomId) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);

        if (room.getInviteCode() == null || room.getInviteCode().isBlank()) {
            room.setInviteCode(generateUniqueInviteCode());
            room.setInviteCodeEnabled(true);
            chatRoomRepository.saveAndFlush(room);
        }

        return new com.chatapp.dto.response.GroupInviteResponse(
                room.getId(),
                room.getInviteCode(),
                "/invite/" + room.getInviteCode(),
                Boolean.TRUE.equals(room.getInviteCodeEnabled()));
    }

    @Transactional
    public com.chatapp.dto.response.GroupInviteResponse revokeInviteLink(String currentUsername, Long roomId) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);
        validateGroupAdmin(room, currentUser);

        room.setInviteCode(generateUniqueInviteCode());
        room.setInviteCodeEnabled(true);
        chatRoomRepository.saveAndFlush(room);

        return new com.chatapp.dto.response.GroupInviteResponse(
                room.getId(),
                room.getInviteCode(),
                "/invite/" + room.getInviteCode(),
                true);
    }

    @Transactional(readOnly = true)
    public com.chatapp.dto.response.GroupPreviewResponse previewGroupByInvite(String inviteCode) {
        ChatRoom room = chatRoomRepository.findByInviteCode(inviteCode)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_INVITE_INVALID));

        if (!Boolean.TRUE.equals(room.getInviteCodeEnabled())) {
            throw new AppException(ErrorCode.ROOM_INVITE_INVALID);
        }

        User owner = findEffectiveOwner(room);
        return new com.chatapp.dto.response.GroupPreviewResponse(
                room.getId(),
                room.getName(),
                room.getAvatar(),
                room.getMembers().size(),
                owner == null ? null : owner.getUsername(),
                owner == null ? null : owner.getFullName());
    }

    @Transactional
    public ChatRoomResponse joinGroupByInvite(String currentUsername, String inviteCode) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = chatRoomRepository.findByInviteCode(inviteCode)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_INVITE_INVALID));

        if (!Boolean.TRUE.equals(room.getInviteCodeEnabled())) {
            throw new AppException(ErrorCode.ROOM_INVITE_INVALID);
        }

        if (!room.hasMember(currentUser.getId())) {
            room.addMember(currentUser, ChatRoomMember.Role.MEMBER);
            chatRoomRepository.saveAndFlush(room);
        }

        return toGroupResponseForUser(currentUser, room);
    }

    @Transactional
    public void deleteGroup(String currentUsername, Long roomId) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);
        validateGroupOwner(room, currentUser);

        chatRoomRepository.delete(room);
    }

    @Transactional
    public ChatRoomResponse pinRoomMessage(String currentUsername, Long roomId, Long messageId) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);

        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new AppException(ErrorCode.MESSAGE_NOT_FOUND));

        if (message.getChatRoom() == null || !message.getChatRoom().getId().equals(roomId)) {
            throw new AppException(ErrorCode.MESSAGE_NOT_FOUND);
        }

        room.setPinnedMessage(message);
        return toGroupResponseForUser(currentUser, chatRoomRepository.saveAndFlush(room));
    }

    @Transactional
    public ChatRoomResponse unpinRoomMessage(String currentUsername, Long roomId) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = findGroupRoomForMember(currentUser, roomId);
        room.setPinnedMessage(null);
        return toGroupResponseForUser(currentUser, chatRoomRepository.saveAndFlush(room));
    }

    @Transactional(readOnly = true)
    public ChatRoom findGroupRoomForMember(String currentUsername, Long roomId) {
        return findGroupRoomForMember(userService.findByUsername(currentUsername), roomId);
    }

    @Transactional(readOnly = true)
    public ChatRoom findGroupRoomForMember(User member, Long roomId) {
        ChatRoom room = chatRoomRepository.findByIdAndType(roomId, ChatRoom.RoomType.GROUP)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));

        if (!room.hasMember(member.getId())) {
            throw new AppException(ErrorCode.ROOM_ACCESS_DENIED);
        }

        return room;
    }

    @Transactional(readOnly = true)
    public List<String> getGroupParticipantUsernames(String currentUsername, Long roomId) {
        return findGroupRoomForMember(currentUsername, roomId)
                .getMembers()
                .stream()
                .map(member -> member.getUser().getUsername())
                .toList();
    }

    private ChatRoomResponse toGroupResponseForUser(User currentUser, ChatRoom room) {
        Message latestMessage = findLatestMessagesByRoomId(List.of(room.getId())).get(room.getId());
        long unreadCount = countUnreadMessagesByRoomId(currentUser.getId(), List.of(room.getId()))
                .getOrDefault(room.getId(), 0L);

        return ChatRoomResponse.from(
                room,
                latestMessage,
                unreadCount,
                findSetting(currentUser.getId(), room.getId()));
    }

    private void validateGroupOwner(ChatRoom room, User currentUser) {
        User owner = findEffectiveOwner(room);
        if (owner == null || !owner.getId().equals(currentUser.getId())) {
            throw new AppException(ErrorCode.ROOM_OWNER_REQUIRED);
        }

        if (room.getOwner() == null) {
            room.setOwner(owner);
        }
    }

    private void validateGroupAdmin(ChatRoom room, User currentUser) {
        User owner = findEffectiveOwner(room);
        if (owner != null && owner.getId().equals(currentUser.getId())) {
            return;
        }

        ChatRoomMember member = room.findMemberByUserId(currentUser.getId())
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_ACCESS_DENIED));

        if (member.getRole() != ChatRoomMember.Role.MODERATOR && member.getRole() != ChatRoomMember.Role.OWNER) {
            throw new AppException(ErrorCode.ROOM_ADMIN_REQUIRED);
        }
    }

    private User findEffectiveOwner(ChatRoom room) {
        return room.getOwner() == null ? findFirstParticipantById(room) : room.getOwner();
    }

    private User findFirstParticipantById(ChatRoom room) {
        return room.getMembers()
                .stream()
                .map(ChatRoomMember::getUser)
                .min(Comparator.comparing(User::getId))
                .orElse(null);
    }

    private String generateUniqueInviteCode() {
        return java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    private String normalizeNickname(String nickname) {
        if (nickname == null || nickname.isBlank()) {
            return null;
        }

        return nickname.trim();
    }

    private Map<Long, Message> findLatestMessagesByRoomId(List<Long> roomIds) {
        if (roomIds.isEmpty()) {
            return Map.of();
        }

        return messageRepository.findLatestMessagesForRooms(roomIds)
                .stream()
                .collect(Collectors.toMap(
                        message -> message.getChatRoom().getId(),
                        Function.identity()));
    }

    private Map<Long, Long> countUnreadMessagesByRoomId(Long currentUserId, List<Long> roomIds) {
        if (roomIds.isEmpty()) {
            return Map.of();
        }

        return messageRepository.countUnreadRoomMessages(currentUserId, roomIds)
                .stream()
                .collect(Collectors.toMap(
                        MessageRepository.RoomUnreadCountProjection::getRoomId,
                        MessageRepository.RoomUnreadCountProjection::getUnreadCount));
    }

    private Map<Long, ConversationSetting> findSettingsByRoomId(Long currentUserId, List<Long> roomIds) {
        if (roomIds.isEmpty()) {
            return Map.of();
        }

        List<ConversationSetting> settings = conversationSettingRepository.findByUserIdAndChatRoomIdIn(currentUserId,
                roomIds);
        if (settings == null || settings.isEmpty()) {
            return Map.of();
        }

        return settings.stream()
                .collect(Collectors.toMap(setting -> setting.getChatRoom().getId(), Function.identity()));
    }

    private ConversationSetting findSetting(Long currentUserId, Long roomId) {
        java.util.Optional<ConversationSetting> setting = conversationSettingRepository
                .findByUserIdAndChatRoomId(currentUserId, roomId);
        return setting == null ? null : setting.orElse(null);
    }

    private int compareByConversationActivity(ChatRoomResponse firstRoom, ChatRoomResponse secondRoom) {
        if (!firstRoom.pinned().equals(secondRoom.pinned())) {
            return Boolean.TRUE.equals(firstRoom.pinned()) ? -1 : 1;
        }

        LocalDateTime firstActivityAt = firstRoom.lastMessageAt() == null
                ? firstRoom.createdAt()
                : firstRoom.lastMessageAt();
        LocalDateTime secondActivityAt = secondRoom.lastMessageAt() == null
                ? secondRoom.createdAt()
                : secondRoom.lastMessageAt();

        return secondActivityAt.compareTo(firstActivityAt);
    }

    private boolean isVisibleToCurrentUser(Message latestMessage, ConversationSetting setting) {
        if (latestMessage == null || setting == null || setting.getClearedAt() == null) {
            return true;
        }

        return latestMessage.getTimestamp() != null && latestMessage.getTimestamp().isAfter(setting.getClearedAt());
    }
}
