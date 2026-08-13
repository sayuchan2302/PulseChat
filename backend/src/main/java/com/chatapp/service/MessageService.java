package com.chatapp.service;

import com.chatapp.dto.request.MediaAttachmentRequest;
import com.chatapp.dto.request.ForwardMessageRequest;
import com.chatapp.dto.request.MessageReactionRequest;
import com.chatapp.dto.request.SendMessageRequest;
import com.chatapp.dto.request.SendRoomMessageRequest;
import com.chatapp.dto.response.MessagePageResponse;
import com.chatapp.dto.response.MessageSeenByResponse;
import com.chatapp.dto.response.ReadReceiptResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.dto.response.UnreadCountResponse;
import com.chatapp.dto.response.UserResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.CallSession;
import com.chatapp.model.CallSession.CallStatus;
import com.chatapp.model.CallSession.CallType;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.ChatRoomMember;
import com.chatapp.model.ChatRoomReadState;
import com.chatapp.model.Message;
import com.chatapp.model.MessageReaction;
import com.chatapp.model.Message.MessageType;
import com.chatapp.model.ConversationSetting;
import com.chatapp.model.User;
import com.chatapp.repository.ChatRoomReadStateRepository;
import com.chatapp.repository.ConversationSettingRepository;
import com.chatapp.repository.MessageRepository;
import com.chatapp.repository.MessageReactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MessageService {
    private static final int DEFAULT_PAGE_SIZE = 30;
    private static final int MAX_PAGE_SIZE = 100;
    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;
    private static final long MAX_VIDEO_BYTES = 50L * 1024 * 1024;
    private static final long MAX_FILE_BYTES = 50L * 1024 * 1024;
    private static final String IMAGE_RESOURCE_TYPE = "image";
    private static final String VIDEO_RESOURCE_TYPE = "video";
    private static final List<MessageType> MEDIA_MESSAGE_TYPES = List.of(
            MessageType.IMAGE,
            MessageType.VIDEO,
            MessageType.AUDIO,
            MessageType.FILE);
    private static final Pattern MENTION_PATTERN = Pattern.compile("@([a-zA-Z0-9_.\\-]+)");

    private final MessageRepository messageRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final ChatRoomReadStateRepository chatRoomReadStateRepository;
    private final UserService userService;
    private final ChatRoomService chatRoomService;
    private final FriendshipService friendshipService;
    private final LinkPreviewService linkPreviewService;
    private final ConversationSettingRepository conversationSettingRepository;

    @Transactional(readOnly = true)
    public MessagePageResponse getConversation(
            String currentUsername,
            Long otherUserId,
            Long before,
            Integer size) {
        PrivateConversationParticipants participants = findPrivateConversationParticipants(currentUsername,
                otherUserId);

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findConversationPage(
                participants.currentUser().getId(),
                participants.otherUser().getId(),
                before,
                PageRequest.of(0, pageSize + 1));

        return toMessagePage(messages, pageSize);
    }

    @Transactional(readOnly = true)
    public List<UnreadCountResponse> getUnreadCounts(String currentUsername) {
        User currentUser = userService.findByUsername(currentUsername);

        return messageRepository.countUnreadMessagesGroupedBySender(currentUser.getId())
                .stream()
                .map(count -> new UnreadCountResponse(count.getUserId(), count.getUnreadCount()))
                .toList();
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getRoomMessages(String currentUsername, Long roomId, Long before, Integer size) {
        chatRoomService.findGroupRoomForMember(currentUsername, roomId);

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findRoomMessagePage(
                roomId,
                before,
                PageRequest.of(0, pageSize + 1));

        return toMessagePage(messages, pageSize);
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getConversationMedia(
            String currentUsername,
            Long otherUserId,
            Long before,
            Integer size) {
        PrivateConversationParticipants participants = findPrivateConversationParticipants(currentUsername,
                otherUserId);

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findConversationMediaPage(
                participants.currentUser().getId(),
                participants.otherUser().getId(),
                MEDIA_MESSAGE_TYPES,
                before,
                PageRequest.of(0, pageSize + 1));

        return toGalleryMessagePage(messages, pageSize);
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getConversationLinks(
            String currentUsername,
            Long otherUserId,
            Long before,
            Integer size) {
        PrivateConversationParticipants participants = findPrivateConversationParticipants(currentUsername,
                otherUserId);

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findConversationLinkPage(
                participants.currentUser().getId(),
                participants.otherUser().getId(),
                before,
                PageRequest.of(0, pageSize + 1));

        return toGalleryMessagePage(messages, pageSize);
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getRoomMedia(String currentUsername, Long roomId, Long before, Integer size) {
        chatRoomService.findGroupRoomForMember(currentUsername, roomId);

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findRoomMediaPage(
                roomId,
                MEDIA_MESSAGE_TYPES,
                before,
                PageRequest.of(0, pageSize + 1));

        return toGalleryMessagePage(messages, pageSize);
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getRoomLinks(String currentUsername, Long roomId, Long before, Integer size) {
        chatRoomService.findGroupRoomForMember(currentUsername, roomId);

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findRoomLinkPage(
                roomId,
                before,
                PageRequest.of(0, pageSize + 1));

        return toGalleryMessagePage(messages, pageSize);
    }

    @Transactional(readOnly = true)
    public MessagePageResponse searchConversation(
            String currentUsername,
            Long otherUserId,
            String query,
            Long before,
            Integer size) {
        PrivateConversationParticipants participants = findPrivateConversationParticipants(currentUsername,
                otherUserId);
        String queryPattern = normalizeSearchPattern(query);
        if (queryPattern == null) {
            return emptyMessagePage();
        }

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findConversationSearchPage(
                participants.currentUser().getId(),
                participants.otherUser().getId(),
                queryPattern,
                before,
                PageRequest.of(0, pageSize + 1));

        return toGalleryMessagePage(messages, pageSize);
    }

    @Transactional(readOnly = true)
    public MessagePageResponse searchRoom(
            String currentUsername,
            Long roomId,
            String query,
            Long before,
            Integer size) {
        chatRoomService.findGroupRoomForMember(currentUsername, roomId);
        String queryPattern = normalizeSearchPattern(query);
        if (queryPattern == null) {
            return emptyMessagePage();
        }

        int pageSize = normalizePageSize(size);
        List<Message> messages = messageRepository.findRoomSearchPage(
                roomId,
                queryPattern,
                before,
                PageRequest.of(0, pageSize + 1));

        return toGalleryMessagePage(messages, pageSize);
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getConversationAroundMessage(
            String currentUsername,
            Long otherUserId,
            Long messageId,
            Integer size) {
        PrivateConversationParticipants participants = findPrivateConversationParticipants(currentUsername,
                otherUserId);
        Message anchorMessage = messageRepository.findConversationMessageById(
                participants.currentUser().getId(),
                participants.otherUser().getId(),
                messageId)
                .orElseThrow(() -> new AppException(ErrorCode.MESSAGE_NOT_FOUND));

        int pageSize = normalizePageSize(size);
        return loadMessagesAroundAnchor(
                anchorMessage,
                pageSize,
                (anchorId, pageable) -> messageRepository.findConversationMessagesBefore(
                        participants.currentUser().getId(),
                        participants.otherUser().getId(),
                        anchorId,
                        pageable),
                (anchorId, pageable) -> messageRepository.findConversationMessagesAfter(
                        participants.currentUser().getId(),
                        participants.otherUser().getId(),
                        anchorId,
                        pageable));
    }

    @Transactional(readOnly = true)
    public MessagePageResponse getRoomAroundMessage(
            String currentUsername,
            Long roomId,
            Long messageId,
            Integer size) {
        chatRoomService.findGroupRoomForMember(currentUsername, roomId);
        Message anchorMessage = messageRepository.findRoomMessageById(roomId, messageId)
                .orElseThrow(() -> new AppException(ErrorCode.MESSAGE_NOT_FOUND));

        int pageSize = normalizePageSize(size);
        return loadMessagesAroundAnchor(
                anchorMessage,
                pageSize,
                (anchorId, pageable) -> messageRepository.findRoomMessagesBefore(roomId, anchorId, pageable),
                (anchorId, pageable) -> messageRepository.findRoomMessagesAfter(roomId, anchorId, pageable));
    }

    @Transactional
    public MessageResponse sendMessage(String currentUsername, SendMessageRequest request) {
        User sender = userService.findByUsername(currentUsername);
        User receiver = userService.findById(request.receiverId());
        String clientId = normalizeClientId(request.clientId());
        MessageType type = normalizeMessageType(request.type());
        String content = normalizeContent(request.content());

        if (sender.getId().equals(receiver.getId())) {
            throw new AppException(ErrorCode.SELF_MESSAGE_NOT_ALLOWED);
        }

        validateFriends(sender, receiver);
        validateMessagePayload(type, content, request.media());
        Message replyToMessage = resolvePrivateReplyTarget(sender, receiver, request.replyToMessageId());

        if (clientId != null) {
            return messageRepository.findBySenderIdAndClientId(sender.getId(), clientId)
                    .map(MessageResponse::from)
                    .orElseGet(() -> {
                        LinkPreviewMetadata linkPreview = resolveLinkPreview(type, content);
                        return saveMessage(
                                sender,
                                receiver,
                                content,
                                clientId,
                                type,
                                request.media(),
                                linkPreview,
                                replyToMessage);
                    });
        }

        LinkPreviewMetadata linkPreview = resolveLinkPreview(type, content);
        return saveMessage(sender, receiver, content, null, type, request.media(), linkPreview, replyToMessage);
    }

    @Transactional
    public MessageResponse sendRoomMessage(
            String currentUsername,
            Long roomId,
            SendRoomMessageRequest request) {
        User sender = userService.findByUsername(currentUsername);
        ChatRoom room = chatRoomService.findGroupRoomForMember(sender, roomId);
        String clientId = normalizeClientId(request.clientId());
        MessageType type = normalizeMessageType(request.type());
        String content = normalizeContent(request.content());

        validateMessagePayload(type, content, request.media());
        Message replyToMessage = resolveRoomReplyTarget(room, request.replyToMessageId());

        if (clientId != null) {
            return messageRepository.findBySenderIdAndClientId(sender.getId(), clientId)
                    .map(MessageResponse::from)
                    .orElseGet(() -> {
                        LinkPreviewMetadata linkPreview = resolveLinkPreview(type, content);
                        return saveRoomMessage(
                                sender,
                                room,
                                content,
                                clientId,
                                type,
                                request.media(),
                                linkPreview,
                                replyToMessage);
                    });
        }

        LinkPreviewMetadata linkPreview = resolveLinkPreview(type, content);
        return saveRoomMessage(sender, room, content, null, type, request.media(), linkPreview, replyToMessage);
    }

    @Transactional
    public MessageResponse saveCallHistoryMessage(CallSession callSession, User actor) {
        User receiver = callSession.getCaller().getId().equals(actor.getId())
                ? callSession.getReceiver()
                : callSession.getCaller();

        Message message = new Message();
        message.setSender(actor);
        message.setReceiver(receiver);
        message.setCallSession(callSession);
        message.setType(MessageType.CALL);
        message.setContent(formatCallHistoryContent(callSession));
        message.setRead(false);

        return MessageResponse.from(messageRepository.saveAndFlush(message));
    }

    @Transactional
    public MessageResponse reactToMessage(String currentUsername, Long messageId, MessageReactionRequest request) {
        User currentUser = userService.findByUsername(currentUsername);
        Message message = findAccessibleMessage(currentUser, messageId);
        String emoji = normalizeReactionEmoji(request.emoji());

        MessageReaction reaction = messageReactionRepository
                .findByMessageIdAndUserId(message.getId(), currentUser.getId())
                .orElseGet(() -> {
                    MessageReaction newReaction = new MessageReaction();
                    newReaction.setMessage(message);
                    newReaction.setUser(currentUser);
                    message.getReactions().add(newReaction);
                    return newReaction;
                });

        reaction.setEmoji(emoji);
        messageReactionRepository.saveAndFlush(reaction);
        return MessageResponse.from(message);
    }

    @Transactional
    public MessageResponse removeReaction(String currentUsername, Long messageId) {
        User currentUser = userService.findByUsername(currentUsername);
        Message message = findAccessibleMessage(currentUser, messageId);

        messageReactionRepository
                .findByMessageIdAndUserId(message.getId(), currentUser.getId())
                .ifPresent(reaction -> {
                    message.getReactions().remove(reaction);
                    messageReactionRepository.delete(reaction);
                    messageReactionRepository.flush();
                });

        return MessageResponse.from(message);
    }

    @Transactional
    public MessageResponse recallMessage(String currentUsername, Long messageId) {
        User currentUser = userService.findByUsername(currentUsername);
        Message message = findAccessibleMessage(currentUser, messageId);
        if (!message.getSender().getId().equals(currentUser.getId())) {
            throw new AppException(ErrorCode.MESSAGE_RECALL_NOT_ALLOWED);
        }

        if (Boolean.TRUE.equals(message.getRecalled())) {
            return MessageResponse.from(message);
        }

        message.setRecalled(true);
        return MessageResponse.from(messageRepository.saveAndFlush(message));
    }

    @Transactional
    public MessageResponse forwardMessage(String currentUsername, ForwardMessageRequest request) {
        User sender = userService.findByUsername(currentUsername);
        Message source = findAccessibleMessage(sender, request.messageId());

        // Can't forward recalled or call-type messages
        if (Boolean.TRUE.equals(source.getRecalled()) || source.getType() == Message.MessageType.CALL) {
            throw new AppException(ErrorCode.INVALID_MESSAGE_CONTENT);
        }

        // Resolve target – either DM or room (mutually exclusive)
        if (request.targetRoomId() != null) {
            ChatRoom room = chatRoomService.findGroupRoomForMember(sender, request.targetRoomId());
            return saveForwardedRoomMessage(sender, source, room);
        }

        if (request.targetUserId() != null) {
            User target = userService.findById(request.targetUserId());
            if (sender.getId().equals(target.getId())) {
                throw new AppException(ErrorCode.SELF_MESSAGE_NOT_ALLOWED);
            }
            validateFriends(sender, target);
            return saveForwardedDmMessage(sender, source, target);
        }

        throw new AppException(ErrorCode.VALIDATION_FAILED, "Either targetUserId or targetRoomId must be set");
    }

    private MessageResponse saveForwardedDmMessage(User sender, Message source, User target) {
        Message msg = buildForwardedMessage(sender, source);
        msg.setReceiver(target);
        msg.setRead(false);
        return MessageResponse.from(messageRepository.saveAndFlush(msg));
    }

    private MessageResponse saveForwardedRoomMessage(User sender, Message source, ChatRoom room) {
        Message msg = buildForwardedMessage(sender, source);
        msg.setChatRoom(room);
        msg.setMentions(resolveMentions(room, sender, msg.getContent()));
        msg.setRead(false);
        return MessageResponse.from(messageRepository.saveAndFlush(msg));
    }

    private Message buildForwardedMessage(User sender, Message source) {
        Message msg = new Message();
        msg.setSender(sender);
        msg.setForwardedFrom(source);
        msg.setType(source.getType());
        msg.setContent(source.getContent() == null ? "" : source.getContent());
        msg.setMediaUrl(source.getMediaUrl());
        msg.setMediaPublicId(source.getMediaPublicId());
        msg.setMediaResourceType(source.getMediaResourceType());
        msg.setMediaFormat(source.getMediaFormat());
        msg.setMediaBytes(source.getMediaBytes());
        msg.setMediaWidth(source.getMediaWidth());
        msg.setMediaHeight(source.getMediaHeight());
        msg.setMediaDuration(source.getMediaDuration());
        msg.setLinkPreviewUrl(source.getLinkPreviewUrl());
        msg.setLinkPreviewTitle(source.getLinkPreviewTitle());
        msg.setLinkPreviewDescription(source.getLinkPreviewDescription());
        msg.setLinkPreviewImageUrl(source.getLinkPreviewImageUrl());
        msg.setLinkPreviewDomain(source.getLinkPreviewDomain());
        return msg;
    }

    @Transactional
    public void pinDmMessage(String currentUsername, Long otherUserId, Long messageId) {

        PrivateConversationParticipants participants = findPrivateConversationParticipants(currentUsername,
                otherUserId);
        Message message = findMessageById(messageId);

        if (!isPrivateMessageParticipant(participants.currentUser(), message)
                || message.getChatRoom() != null) {
            throw new AppException(ErrorCode.MESSAGE_ACCESS_DENIED);
        }

        upsertConversationPinnedMessage(participants.currentUser().getId(), participants.otherUser().getId(),
                messageId);
        upsertConversationPinnedMessage(participants.otherUser().getId(), participants.currentUser().getId(),
                messageId);
    }

    @Transactional
    public void unpinDmMessage(String currentUsername, Long otherUserId) {
        PrivateConversationParticipants participants = findPrivateConversationParticipants(currentUsername,
                otherUserId);
        upsertConversationPinnedMessage(participants.currentUser().getId(), participants.otherUser().getId(), null);
        upsertConversationPinnedMessage(participants.otherUser().getId(), participants.currentUser().getId(), null);
    }

    private void upsertConversationPinnedMessage(Long userId, Long targetUserId, Long pinnedMessageId) {
        ConversationSetting setting = conversationSettingRepository
                .findByUserIdAndTargetUserId(userId, targetUserId)
                .orElseGet(() -> {
                    User user = userService.findById(userId);
                    User target = userService.findById(targetUserId);
                    ConversationSetting s = new ConversationSetting();
                    s.setUser(user);
                    s.setTargetUser(target);
                    return s;
                });
        setting.setPinnedMessageId(pinnedMessageId);
        conversationSettingRepository.save(setting);
    }

    @Transactional(readOnly = true)
    public List<String> getMessageParticipantUsernames(String currentUsername, Long messageId) {
        User currentUser = userService.findByUsername(currentUsername);
        Message message = findAccessibleMessage(currentUser, messageId);
        return getParticipantUsernames(currentUsername, message);
    }

    @Transactional(readOnly = true)
    public String getUsernameById(Long userId) {
        try {
            return userService.findById(userId).getUsername();
        } catch (Exception e) {
            return null;
        }
    }

    @Transactional(readOnly = true)
    public MessageSeenByResponse getRoomMessageSeenBy(String currentUsername, Long roomId, Long messageId) {
        User currentUser = userService.findByUsername(currentUsername);
        ChatRoom room = chatRoomService.findGroupRoomForMember(currentUser, roomId);
        Message message = messageRepository.findRoomMessageById(room.getId(), messageId)
                .orElseThrow(() -> new AppException(ErrorCode.MESSAGE_NOT_FOUND));

        if (message.getTimestamp() == null) {
            return new MessageSeenByResponse(message.getId(), room.getId(), List.of());
        }

        Map<Long, ChatRoomMember> membersByUserId = room.getMembers()
                .stream()
                .collect(Collectors.toMap(member -> member.getUser().getId(), member -> member));

        List<UserResponse> seenBy = chatRoomReadStateRepository
                .findByChatRoomIdAndLastReadAtGreaterThanEqualOrderByLastReadAtDesc(
                        room.getId(),
                        message.getTimestamp())
                .stream()
                .filter(readState -> !readState.getUser().getId().equals(message.getSender().getId()))
                .map(readState -> membersByUserId.get(readState.getUser().getId()))
                .filter(Objects::nonNull)
                .map(UserResponse::from)
                .toList();

        return new MessageSeenByResponse(message.getId(), room.getId(), seenBy);
    }

    private MessageResponse saveMessage(
            User sender,
            User receiver,
            String content,
            String clientId,
            MessageType type,
            MediaAttachmentRequest media,
            LinkPreviewMetadata linkPreview,
            Message replyToMessage) {
        Message message = new Message();
        message.setSender(sender);
        message.setReceiver(receiver);
        message.setReplyToMessage(replyToMessage);
        applyMessagePayload(message, content, type, media, linkPreview);
        message.setClientId(clientId);
        message.setRead(false);

        Message savedMessage = messageRepository.saveAndFlush(message);
        return MessageResponse.from(savedMessage);
    }

    private MessageResponse saveRoomMessage(
            User sender,
            ChatRoom room,
            String content,
            String clientId,
            MessageType type,
            MediaAttachmentRequest media,
            LinkPreviewMetadata linkPreview,
            Message replyToMessage) {
        Message message = new Message();
        message.setSender(sender);
        message.setChatRoom(room);
        message.setReplyToMessage(replyToMessage);
        applyMessagePayload(message, content, type, media, linkPreview);
        message.setClientId(clientId);
        message.setRead(false);
        message.setMentions(resolveMentions(room, sender, content));

        Message savedMessage = messageRepository.saveAndFlush(message);
        return MessageResponse.from(savedMessage);
    }

    private Set<User> resolveMentions(ChatRoom room, User sender, String content) {
        if (room == null || content == null || !content.contains("@") || room.getMembers() == null) {
            return Collections.emptySet();
        }

        Set<User> eligibleMembers = room.getMembers().stream()
                .map(ChatRoomMember::getUser)
                .filter(u -> u != null && !u.getId().equals(sender.getId()))
                .collect(Collectors.toSet());

        if (eligibleMembers.isEmpty()) {
            return Collections.emptySet();
        }

        Matcher matcher = MENTION_PATTERN.matcher(content);
        Set<String> matchedTokens = new HashSet<>();
        while (matcher.find()) {
            matchedTokens.add(matcher.group(1).toLowerCase());
        }

        if (matchedTokens.contains("all")) {
            return eligibleMembers;
        }

        return eligibleMembers.stream()
                .filter(u -> u.getUsername() != null && matchedTokens.contains(u.getUsername().toLowerCase()))
                .collect(Collectors.toSet());
    }

    private Message resolvePrivateReplyTarget(User sender, User receiver, Long replyToMessageId) {
        if (replyToMessageId == null) {
            return null;
        }

        Message replyToMessage = findMessageById(replyToMessageId);
        if (replyToMessage.getChatRoom() != null || replyToMessage.getReceiver() == null) {
            throw new AppException(ErrorCode.INVALID_REPLY_TARGET);
        }

        boolean sameConversation = isSameUserPair(replyToMessage.getSender(), replyToMessage.getReceiver(), sender,
                receiver);
        if (!sameConversation) {
            throw new AppException(ErrorCode.INVALID_REPLY_TARGET);
        }

        return replyToMessage;
    }

    private Message resolveRoomReplyTarget(ChatRoom room, Long replyToMessageId) {
        if (replyToMessageId == null) {
            return null;
        }

        Message replyToMessage = findMessageById(replyToMessageId);
        Long replyRoomId = replyToMessage.getChatRoom() == null ? null : replyToMessage.getChatRoom().getId();
        if (!Objects.equals(replyRoomId, room.getId())) {
            throw new AppException(ErrorCode.INVALID_REPLY_TARGET);
        }

        return replyToMessage;
    }

    private boolean isSameUserPair(User firstSender, User firstReceiver, User secondSender, User secondReceiver) {
        return (firstSender.getId().equals(secondSender.getId())
                && firstReceiver.getId().equals(secondReceiver.getId()))
                || (firstSender.getId().equals(secondReceiver.getId())
                        && firstReceiver.getId().equals(secondSender.getId()));
    }

    private String normalizeClientId(String clientId) {
        if (!StringUtils.hasText(clientId)) {
            return null;
        }

        return clientId.trim();
    }

    private String normalizeContent(String content) {
        return content == null ? "" : content.trim();
    }

    private MessageType normalizeMessageType(MessageType type) {
        return type == null ? MessageType.TEXT : type;
    }

    private void validateMessagePayload(MessageType type, String content, MediaAttachmentRequest media) {
        if (type == MessageType.TEXT) {
            if (!StringUtils.hasText(content)) {
                throw new AppException(ErrorCode.INVALID_MESSAGE_CONTENT);
            }

            return;
        }

        if (type == MessageType.CALL) {
            throw new AppException(ErrorCode.INVALID_MESSAGE_CONTENT);
        }

        validateMediaPayload(type, media);
    }

    private void validateMediaPayload(MessageType type, MediaAttachmentRequest media) {
        if (media == null
                || !StringUtils.hasText(media.url())
                || !StringUtils.hasText(media.publicId())
                || !StringUtils.hasText(media.resourceType())) {
            throw new AppException(ErrorCode.INVALID_MEDIA_MESSAGE);
        }

        if (type == MessageType.IMAGE && !IMAGE_RESOURCE_TYPE.equalsIgnoreCase(media.resourceType())) {
            throw new AppException(ErrorCode.INVALID_MEDIA_MESSAGE);
        }

        if (type == MessageType.VIDEO && !VIDEO_RESOURCE_TYPE.equalsIgnoreCase(media.resourceType())) {
            throw new AppException(ErrorCode.INVALID_MEDIA_MESSAGE);
        }

        if (media.bytes() == null) {
            return;
        }

        long maxBytes = type == MessageType.IMAGE ? MAX_IMAGE_BYTES
                : type == MessageType.VIDEO ? MAX_VIDEO_BYTES
                        : MAX_FILE_BYTES;
        if (media.bytes() > maxBytes) {
            throw new AppException(ErrorCode.INVALID_MEDIA_MESSAGE);
        }
    }

    private void applyMessagePayload(
            Message message,
            String content,
            MessageType type,
            MediaAttachmentRequest media,
            LinkPreviewMetadata linkPreview) {
        message.setType(type);
        message.setContent(content);

        if (type == MessageType.TEXT) {
            applyLinkPreview(message, linkPreview);
            return;
        }

        if (type == MessageType.CALL) {
            return;
        }

        if (media == null) {
            return;
        }

        message.setMediaUrl(media.url().trim());
        message.setMediaPublicId(media.publicId().trim());
        message.setMediaResourceType(media.resourceType().trim().toLowerCase());
        message.setMediaFormat(normalizeOptionalMediaValue(media.format()));
        message.setMediaBytes(media.bytes());
        message.setMediaWidth(media.width());
        message.setMediaHeight(media.height());
        message.setMediaDuration(media.duration());
    }

    private LinkPreviewMetadata resolveLinkPreview(MessageType type, String content) {
        if (type != MessageType.TEXT || !StringUtils.hasText(content)) {
            return null;
        }

        return linkPreviewService.resolveFirstPreview(content);
    }

    private String formatCallHistoryContent(CallSession callSession) {
        String typeLabel = callSession.getType() == CallType.VIDEO ? "Video" : "Audio";
        CallStatus status = callSession.getStatus();

        return switch (status) {
            case ENDED -> {
                Long durationSeconds = callDurationSeconds(callSession);
                yield durationSeconds == null || durationSeconds == 0
                        ? typeLabel + " call ended"
                        : typeLabel + " call ended · " + formatCallDuration(durationSeconds);
            }
            case MISSED -> "Missed " + typeLabel.toLowerCase() + " call";
            case REJECTED -> typeLabel + " call declined";
            case CANCELED -> typeLabel + " call canceled";
            case BUSY -> typeLabel + " call not answered · Busy";
            case RINGING, ACCEPTED -> typeLabel + " call";
        };
    }

    private Long callDurationSeconds(CallSession callSession) {
        if (callSession.getStartedAt() == null || callSession.getEndedAt() == null) {
            return null;
        }

        return Math.max(Duration.between(callSession.getStartedAt(), callSession.getEndedAt()).getSeconds(), 0);
    }

    private String formatCallDuration(long totalSeconds) {
        long hours = totalSeconds / 3600;
        long minutes = (totalSeconds % 3600) / 60;
        long seconds = totalSeconds % 60;

        if (hours > 0) {
            return "%dh %02dm".formatted(hours, minutes);
        }

        if (minutes > 0) {
            return "%dm %02ds".formatted(minutes, seconds);
        }

        return "%ds".formatted(seconds);
    }

    private void applyLinkPreview(Message message, LinkPreviewMetadata linkPreview) {
        if (linkPreview == null) {
            return;
        }

        message.setLinkPreviewUrl(linkPreview.url());
        message.setLinkPreviewTitle(linkPreview.title());
        message.setLinkPreviewDescription(linkPreview.description());
        message.setLinkPreviewImageUrl(linkPreview.imageUrl());
        message.setLinkPreviewDomain(linkPreview.domain());
    }

    private String normalizeOptionalMediaValue(String value) {
        return StringUtils.hasText(value) ? value.trim().toLowerCase() : null;
    }

    private String normalizeReactionEmoji(String emoji) {
        if (!StringUtils.hasText(emoji)) {
            throw new AppException(ErrorCode.INVALID_MESSAGE_REACTION);
        }

        String normalizedEmoji = emoji.trim();
        if (normalizedEmoji.codePointCount(0, normalizedEmoji.length()) > 8) {
            throw new AppException(ErrorCode.INVALID_MESSAGE_REACTION);
        }

        return normalizedEmoji;
    }

    private Message findMessageById(Long messageId) {
        return messageRepository.findById(messageId)
                .orElseThrow(() -> new AppException(ErrorCode.MESSAGE_NOT_FOUND));
    }

    private Message findAccessibleMessage(User currentUser, Long messageId) {
        Message message = findMessageById(messageId);
        if (message.getChatRoom() != null) {
            chatRoomService.findGroupRoomForMember(currentUser, message.getChatRoom().getId());
            return message;
        }

        if (isPrivateMessageParticipant(currentUser, message)) {
            return message;
        }

        throw new AppException(ErrorCode.MESSAGE_ACCESS_DENIED);
    }

    private boolean isPrivateMessageParticipant(User currentUser, Message message) {
        Long currentUserId = currentUser.getId();
        Long receiverId = message.getReceiver() == null ? null : message.getReceiver().getId();
        return message.getSender().getId().equals(currentUserId) || Objects.equals(receiverId, currentUserId);
    }

    private List<String> getParticipantUsernames(String currentUsername, Message message) {
        if (message.getChatRoom() != null) {
            return chatRoomService.getGroupParticipantUsernames(currentUsername, message.getChatRoom().getId());
        }

        return List.of(message.getSender().getUsername(), message.getReceiver().getUsername())
                .stream()
                .distinct()
                .toList();
    }

    private void validateFriends(User firstUser, User secondUser) {
        if (!friendshipService.areFriends(firstUser, secondUser)) {
            throw new AppException(ErrorCode.FRIENDSHIP_REQUIRED);
        }
    }

    private PrivateConversationParticipants findPrivateConversationParticipants(
            String currentUsername,
            Long otherUserId) {
        User currentUser = userService.findByUsername(currentUsername);
        User otherUser = userService.findById(otherUserId);

        if (currentUser.getId().equals(otherUser.getId())) {
            throw new AppException(ErrorCode.SELF_CONVERSATION_NOT_ALLOWED);
        }

        validateFriends(currentUser, otherUser);
        return new PrivateConversationParticipants(currentUser, otherUser);
    }

    private int normalizePageSize(Integer size) {
        if (size == null) {
            return DEFAULT_PAGE_SIZE;
        }

        return Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
    }

    private String normalizeSearchPattern(String query) {
        if (!StringUtils.hasText(query)) {
            return null;
        }

        return "%" + query.trim().toLowerCase() + "%";
    }

    private MessagePageResponse emptyMessagePage() {
        return new MessagePageResponse(List.of(), false, null);
    }

    private MessagePageResponse toMessagePage(List<Message> newestFirstMessages, int pageSize) {
        boolean hasMore = newestFirstMessages.size() > pageSize;
        List<Message> pageMessages = hasMore
                ? newestFirstMessages.subList(0, pageSize)
                : newestFirstMessages;

        List<MessageResponse> items = pageMessages.stream()
                .sorted(Comparator.comparing(Message::getId))
                .map(MessageResponse::from)
                .toList();
        Long nextBefore = hasMore && !items.isEmpty() ? items.get(0).id() : null;

        return new MessagePageResponse(items, hasMore, nextBefore);
    }

    private MessagePageResponse toGalleryMessagePage(List<Message> newestFirstMessages, int pageSize) {
        boolean hasMore = newestFirstMessages.size() > pageSize;
        List<Message> pageMessages = hasMore
                ? newestFirstMessages.subList(0, pageSize)
                : newestFirstMessages;

        List<MessageResponse> items = pageMessages.stream()
                .map(MessageResponse::from)
                .toList();
        Long nextBefore = hasMore && !items.isEmpty() ? items.get(items.size() - 1).id() : null;

        return new MessagePageResponse(items, hasMore, nextBefore);
    }

    private MessagePageResponse loadMessagesAroundAnchor(
            Message anchorMessage,
            int pageSize,
            MessageAroundLoader beforeLoader,
            MessageAroundLoader afterLoader) {
        int beforeSize = Math.max((pageSize - 1) / 2, 0);
        int afterSize = Math.max(pageSize - beforeSize - 1, 0);
        List<Message> beforeMessages = beforeSize == 0
                ? List.of()
                : beforeLoader.load(anchorMessage.getId(), PageRequest.of(0, beforeSize + 1));
        boolean hasMoreBeforeMessages = beforeMessages.size() > beforeSize;
        List<Message> visibleBeforeMessages = hasMoreBeforeMessages
                ? beforeMessages.subList(0, beforeSize)
                : beforeMessages;
        List<Message> afterMessages = afterSize == 0
                ? List.of()
                : afterLoader.load(anchorMessage.getId(), PageRequest.of(0, afterSize));

        return toAroundMessagePage(visibleBeforeMessages, anchorMessage, afterMessages, hasMoreBeforeMessages);
    }

    private MessagePageResponse toAroundMessagePage(
            List<Message> newestFirstBeforeMessages,
            Message anchorMessage,
            List<Message> oldestFirstAfterMessages,
            boolean hasMoreBeforeMessages) {
        List<MessageResponse> items = java.util.stream.Stream
                .concat(
                        java.util.stream.Stream.concat(
                                newestFirstBeforeMessages.stream(),
                                java.util.stream.Stream.of(anchorMessage)),
                        oldestFirstAfterMessages.stream())
                .sorted(Comparator.comparing(Message::getId))
                .map(MessageResponse::from)
                .toList();
        Long nextBefore = hasMoreBeforeMessages && !items.isEmpty() ? items.get(0).id() : null;

        return new MessagePageResponse(items, hasMoreBeforeMessages, nextBefore);
    }

    @Transactional
    public ReadReceiptResponse markConversationAsRead(String currentUsername, Long senderId) {
        User reader = userService.findByUsername(currentUsername);
        User sender = userService.findById(senderId);

        if (reader.getId().equals(sender.getId())) {
            throw new AppException(ErrorCode.SELF_CONVERSATION_NOT_ALLOWED);
        }

        int readCount = messageRepository.markConversationAsRead(sender.getId(), reader.getId());
        return new ReadReceiptResponse(reader.getId(), sender.getId(), readCount);
    }

    private record PrivateConversationParticipants(User currentUser, User otherUser) {
    }

    @FunctionalInterface
    private interface MessageAroundLoader {
        List<Message> load(Long anchorId, Pageable pageable);
    }
}
