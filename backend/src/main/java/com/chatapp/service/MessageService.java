package com.chatapp.service;

import com.chatapp.dto.request.MediaAttachmentRequest;
import com.chatapp.dto.request.ForwardMessageRequest;
import com.chatapp.dto.request.EditMessageRequest;
import com.chatapp.dto.request.MessageReactionRequest;
import com.chatapp.dto.request.SendMessageRequest;
import com.chatapp.dto.request.SendRoomMessageRequest;
import com.chatapp.dto.response.ReadReceiptResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.dto.response.MessageHiddenResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.CallSession;
import com.chatapp.model.CallSession.CallStatus;
import com.chatapp.model.CallSession.CallType;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.Message;
import com.chatapp.model.MessageReaction;
import com.chatapp.model.Message.MessageType;
import com.chatapp.model.ConversationSetting;
import com.chatapp.model.User;
import com.chatapp.repository.ConversationSettingRepository;
import com.chatapp.repository.MessageRepository;
import com.chatapp.repository.MessageReactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.sql.SQLException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class MessageService {
    private static final String SENDER_CLIENT_UNIQUE_INDEX = "uk_messages_sender_client";
    private static final String UNIQUE_VIOLATION_SQL_STATE = "23505";

    private final MessageRepository messageRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final UserService userService;
    private final ChatRoomService chatRoomService;
    private final FriendshipService friendshipService;
    private final LinkPreviewService linkPreviewService;
    private final ConversationSettingRepository conversationSettingRepository;
    private final MediaAccessService mediaAccessService;
    private final UserBlockService userBlockService;
    private final org.springframework.transaction.support.TransactionTemplate transactionTemplate;

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    public MessageResponse sendMessage(String currentUsername, SendMessageRequest request) {
        MessageType type = MessagePayloadMapper.normalizeType(request.type());
        String content = MessagePayloadMapper.normalizeContent(request.content());
        MessagePayloadMapper.validate(type, content, request.media());
        authorizePrivateSend(currentUsername, request);
        LinkPreviewMetadata preview = resolveLinkPreview(type, content);
        try {
            return transactionTemplate.execute(status -> sendPrivateInTransaction(currentUsername, request, preview));
        } catch (org.springframework.dao.DataIntegrityViolationException conflict) {
            return replayAfterConcurrentInsert(currentUsername, request.clientId(), request.receiverId(), null, conflict);
        }
    }

    /**
     * Fail-fast authorization so outbound link-preview HTTP requests only happen for senders
     * who may actually write to this conversation; the write transaction re-validates
     * everything before inserting.
     */
    private void authorizePrivateSend(String currentUsername, SendMessageRequest request) {
        transactionTemplate.execute(status -> {
            User sender = userService.findByUsername(currentUsername);
            User receiver = userService.findById(request.receiverId());
            validatePrivateSend(sender, receiver, currentUsername, request);
            resolvePrivateReplyTarget(sender, receiver, request.replyToMessageId());
            return null;
        });
    }

    private void validatePrivateSend(User sender, User receiver, String currentUsername, SendMessageRequest request) {
        if (sender.getId().equals(receiver.getId())) {
            throw new AppException(ErrorCode.SELF_MESSAGE_NOT_ALLOWED);
        }
        userBlockService.ensureNotBlocked(sender, receiver);
        MessageType type = MessagePayloadMapper.normalizeType(request.type());
        boolean areFriends = friendshipService.areFriends(sender, receiver);
        validateNonFriendMessage(areFriends, type, request.media() != null);
        MessagePayloadMapper.validate(type, MessagePayloadMapper.normalizeContent(request.content()), request.media());
        mediaAccessService.validateAttachment(currentUsername, request.media());
    }

    private MessageResponse sendPrivateInTransaction(String currentUsername, SendMessageRequest request,
            LinkPreviewMetadata linkPreview) {
        User sender = userService.findByUsername(currentUsername);
        User receiver = userService.findById(request.receiverId());
        String clientId = normalizeClientId(request.clientId());
        MessageType type = MessagePayloadMapper.normalizeType(request.type());
        String content = MessagePayloadMapper.normalizeContent(request.content());

        validatePrivateSend(sender, receiver, currentUsername, request);
        Message replyToMessage = resolvePrivateReplyTarget(sender, receiver, request.replyToMessageId());

        if (clientId != null) {
            return messageRepository.findBySenderIdAndClientId(sender.getId(), clientId)
                    .map(existing -> replayForConversation(existing, receiver.getId(), null, sender.getId()))
                    .orElseGet(() -> {
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

        return saveMessage(sender, receiver, content, null, type, request.media(), linkPreview, replyToMessage);
    }

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    public MessageResponse sendRoomMessage(String currentUsername, Long roomId, SendRoomMessageRequest request) {
        MessageType type = MessagePayloadMapper.normalizeType(request.type());
        String content = MessagePayloadMapper.normalizeContent(request.content());
        MessagePayloadMapper.validate(type, content, request.media());
        authorizeRoomSend(currentUsername, roomId, request);
        LinkPreviewMetadata preview = resolveLinkPreview(type, content);
        try {
            return transactionTemplate.execute(status -> sendRoomInTransaction(currentUsername, roomId, request, preview));
        } catch (org.springframework.dao.DataIntegrityViolationException conflict) {
            return replayAfterConcurrentInsert(currentUsername, request.clientId(), null, roomId, conflict);
        }
    }

    private MessageResponse sendRoomInTransaction(String currentUsername, Long roomId,
            SendRoomMessageRequest request, LinkPreviewMetadata linkPreview) {
        User sender = userService.findByUsername(currentUsername);
        ChatRoom room = chatRoomService.findGroupRoomForMember(sender, roomId);
        String clientId = normalizeClientId(request.clientId());
        MessageType type = MessagePayloadMapper.normalizeType(request.type());
        String content = MessagePayloadMapper.normalizeContent(request.content());

        validateRoomSend(currentUsername, request);
        Message replyToMessage = resolveRoomReplyTarget(sender, room, request.replyToMessageId());

        if (clientId != null) {
            return messageRepository.findBySenderIdAndClientId(sender.getId(), clientId)
                    .map(existing -> replayForConversation(existing, null, room.getId(), sender.getId()))
                    .orElseGet(() -> {
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

        return saveRoomMessage(sender, room, content, null, type, request.media(), linkPreview, replyToMessage);
    }

    /**
     * Fail-fast authorization for room sends; mirrors editMessage by resolving link previews
     * only after the sender has been checked against the room, media and reply target.
     * The write transaction re-validates everything before inserting.
     */
    private void authorizeRoomSend(String currentUsername, Long roomId, SendRoomMessageRequest request) {
        transactionTemplate.execute(status -> {
            User sender = userService.findByUsername(currentUsername);
            ChatRoom room = chatRoomService.findGroupRoomForMember(sender, roomId);
            validateRoomSend(currentUsername, request);
            resolveRoomReplyTarget(sender, room, request.replyToMessageId());
            return null;
        });
    }

    private void validateRoomSend(String currentUsername, SendRoomMessageRequest request) {
        MessagePayloadMapper.validate(
                MessagePayloadMapper.normalizeType(request.type()),
                MessagePayloadMapper.normalizeContent(request.content()),
                request.media());
        mediaAccessService.validateAttachment(currentUsername, request.media());
    }

    private MessageResponse replayAfterConcurrentInsert(String username, String rawClientId,
            Long receiverId, Long roomId, org.springframework.dao.DataIntegrityViolationException conflict) {
        String clientId = normalizeClientId(rawClientId);
        if (clientId == null || !isSenderClientIdUniqueViolation(conflict)) {
            throw conflict;
        }
        // The failed transaction has already rolled back. Read the winning insert in a fresh transaction.
        return transactionTemplate.execute(status -> {
            User sender = userService.findByUsername(username);
            return messageRepository.findBySenderIdAndClientId(sender.getId(), clientId)
                    .map(existing -> replayForConversation(existing, receiverId, roomId, sender.getId()))
                    .orElseThrow(() -> conflict);
        });
    }

    /**
     * Only a lost race on the (sender_id, client_id) unique index is replayable; every other
     * integrity failure (foreign key, check, not-null, ...) must surface to the caller unchanged.
     */
    private boolean isSenderClientIdUniqueViolation(org.springframework.dao.DataIntegrityViolationException conflict) {
        Throwable cause = conflict.getMostSpecificCause();
        if (!(cause instanceof SQLException sqlException)
                || !UNIQUE_VIOLATION_SQL_STATE.equals(sqlException.getSQLState())) {
            return false;
        }
        String message = sqlException.getMessage();
        return message != null && message.toLowerCase(Locale.ROOT).contains(SENDER_CLIENT_UNIQUE_INDEX);
    }

    private MessageResponse replayForConversation(Message existing, Long receiverId, Long roomId, long currentUserId) {
        Long actualReceiver = existing.getReceiver() == null ? null : existing.getReceiver().getId();
        Long actualRoom = existing.getChatRoom() == null ? null : existing.getChatRoom().getId();
        if (!Objects.equals(actualReceiver, receiverId) || !Objects.equals(actualRoom, roomId)) {
            throw new AppException(ErrorCode.CLIENT_ID_CONFLICT);
        }
        return MessageResponse.from(existing, currentUserId);
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

        return MessageResponse.from(messageRepository.saveAndFlush(message), actor.getId());
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
        return MessageResponse.from(message, currentUser.getId());
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

        return MessageResponse.from(message, currentUser.getId());
    }

    @Transactional
    public MessageResponse recallMessage(String currentUsername, Long messageId) {
        User currentUser = userService.findByUsername(currentUsername);
        Message message = findAccessibleMessage(currentUser, messageId);
        if (!message.getSender().getId().equals(currentUser.getId())) {
            throw new AppException(ErrorCode.MESSAGE_RECALL_NOT_ALLOWED);
        }

        if (Boolean.TRUE.equals(message.getRecalled())) {
            return MessageResponse.from(message, currentUser.getId());
        }

        message.setRecalled(true);
        return MessageResponse.from(messageRepository.saveAndFlush(message), currentUser.getId());
    }

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    public MessageResponse editMessage(String currentUsername, Long messageId, EditMessageRequest request) {
        String content = MessagePayloadMapper.normalizeContent(request.content());
        MessagePayloadMapper.validate(MessageType.TEXT, content, null);

        transactionTemplate.execute(status -> {
            User currentUser = userService.findByUsername(currentUsername);
            validateMessageCanBeEdited(currentUser, findAccessibleMessage(currentUser, messageId));
            return null;
        });

        LinkPreviewMetadata preview = resolveLinkPreview(MessageType.TEXT, content);
        return transactionTemplate.execute(status -> {
            User currentUser = userService.findByUsername(currentUsername);
            Message message = findAccessibleMessage(currentUser, messageId);
            validateMessageCanBeEdited(currentUser, message);

            MessagePayloadMapper.apply(message, content, MessageType.TEXT, null, preview);
            message.setEditedAt(LocalDateTime.now());
            if (message.getChatRoom() != null) {
                message.setMentions(MessageMentionResolver.resolve(message.getChatRoom(), currentUser, content));
            }
            return MessageResponse.from(messageRepository.saveAndFlush(message), currentUser.getId());
        });
    }

    @Transactional
    public MessageHiddenResponse deleteMessageForCurrentUser(String currentUsername, Long messageId) {
        User currentUser = userService.findByUsername(currentUsername);
        Message message = findAccessibleMessageIncludingHidden(currentUser, messageId);
        boolean alreadyHidden = message.getHiddenByUsers().stream()
                .anyMatch(user -> user.getId().equals(currentUser.getId()));
        if (!alreadyHidden) {
            message.getHiddenByUsers().add(currentUser);
            messageRepository.saveAndFlush(message);
        }

        clearPrivatePinnedMessage(currentUser, message);
        return new MessageHiddenResponse(messageId);
    }

    private void clearPrivatePinnedMessage(User currentUser, Message message) {
        if (message.getChatRoom() != null || message.getReceiver() == null) {
            return;
        }

        Long otherUserId = message.getSender().getId().equals(currentUser.getId())
                ? message.getReceiver().getId()
                : message.getSender().getId();
        conversationSettingRepository.findByUserIdAndTargetUserId(currentUser.getId(), otherUserId)
                .filter(setting -> Objects.equals(setting.getPinnedMessageId(), message.getId()))
                .ifPresent(setting -> {
                    setting.setPinnedMessageId(null);
                    conversationSettingRepository.save(setting);
                });
    }

    private void validateMessageCanBeEdited(User currentUser, Message message) {
        if (!message.getSender().getId().equals(currentUser.getId())
                || Boolean.TRUE.equals(message.getRecalled())
                || message.getType() != MessageType.TEXT) {
            throw new AppException(ErrorCode.MESSAGE_EDIT_NOT_ALLOWED);
        }
    }

    @Transactional
    public MessageResponse forwardMessage(String currentUsername, ForwardMessageRequest request) {
        User sender = userService.findByUsername(currentUsername);
        Message source = findAccessibleMessage(sender, request.messageId());

        // Can't forward recalled or call-type messages
        if (Boolean.TRUE.equals(source.getRecalled()) || source.getType() == Message.MessageType.CALL) {
            throw new AppException(ErrorCode.INVALID_MESSAGE_CONTENT);
        }

        // Resolve target: either DM or room (mutually exclusive).
        if (request.targetRoomId() != null) {
            ChatRoom room = chatRoomService.findGroupRoomForMember(sender, request.targetRoomId());
            return saveForwardedRoomMessage(sender, source, room);
        }

        if (request.targetUserId() != null) {
            User target = userService.findById(request.targetUserId());
            if (sender.getId().equals(target.getId())) {
                throw new AppException(ErrorCode.SELF_MESSAGE_NOT_ALLOWED);
            }
            userBlockService.ensureNotBlocked(sender, target);
            validateNonFriendMessage(
                    friendshipService.areFriends(sender, target),
                    source.getType(),
                    source.getMediaUrl() != null);
            return saveForwardedDmMessage(sender, source, target);
        }

        throw new AppException(ErrorCode.VALIDATION_FAILED, "Either targetUserId or targetRoomId must be set");
    }

    private MessageResponse saveForwardedDmMessage(User sender, Message source, User target) {
        Message msg = buildForwardedMessage(sender, source);
        msg.setReceiver(target);
        msg.setRead(false);
        return MessageResponse.from(messageRepository.saveAndFlush(msg), sender.getId());
    }

    private MessageResponse saveForwardedRoomMessage(User sender, Message source, ChatRoom room) {
        Message msg = buildForwardedMessage(sender, source);
        msg.setChatRoom(room);
        msg.setMentions(MessageMentionResolver.resolve(room, sender, msg.getContent()));
        msg.setRead(false);
        return MessageResponse.from(messageRepository.saveAndFlush(msg), sender.getId());
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
        if (isHiddenForUser(message, participants.currentUser().getId())) {
            throw new AppException(ErrorCode.MESSAGE_NOT_FOUND);
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
    public MessageResponse getMessageResponseForUser(String username, Long messageId) {
        User currentUser = userService.findByUsername(username);
        Message message = findAccessibleMessage(currentUser, messageId);
        return MessageResponse.from(message, currentUser.getId());
    }

    @Transactional(readOnly = true)
    public String getUsernameById(Long userId) {
        try {
            return userService.findById(userId).getUsername();
        } catch (Exception e) {
            return null;
        }
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
        MessagePayloadMapper.apply(message, content, type, media, linkPreview);
        message.setClientId(clientId);
        message.setRead(false);

        Message savedMessage = messageRepository.saveAndFlush(message);
        return MessageResponse.from(savedMessage, sender.getId());
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
        MessagePayloadMapper.apply(message, content, type, media, linkPreview);
        message.setClientId(clientId);
        message.setRead(false);
        message.setMentions(MessageMentionResolver.resolve(room, sender, content));

        Message savedMessage = messageRepository.saveAndFlush(message);
        return MessageResponse.from(savedMessage, sender.getId());
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
        if (isHiddenForUser(replyToMessage, sender.getId())) {
            throw new AppException(ErrorCode.INVALID_REPLY_TARGET);
        }

        return replyToMessage;
    }

    private Message resolveRoomReplyTarget(User sender, ChatRoom room, Long replyToMessageId) {
        if (replyToMessageId == null) {
            return null;
        }

        Message replyToMessage = findMessageById(replyToMessageId);
        Long replyRoomId = replyToMessage.getChatRoom() == null ? null : replyToMessage.getChatRoom().getId();
        if (!Objects.equals(replyRoomId, room.getId())) {
            throw new AppException(ErrorCode.INVALID_REPLY_TARGET);
        }
        if (isHiddenForUser(replyToMessage, sender.getId())) {
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
        Message message = findAccessibleMessageIncludingHidden(currentUser, messageId);
        if (isHiddenForUser(message, currentUser.getId())) {
            throw new AppException(ErrorCode.MESSAGE_NOT_FOUND);
        }
        return message;
    }

    private Message findAccessibleMessageIncludingHidden(User currentUser, Long messageId) {
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

    private boolean isHiddenForUser(Message message, Long userId) {
        return message.getHiddenByUsers().stream().anyMatch(user -> user.getId().equals(userId));
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

    private void validateNonFriendMessage(
            boolean areFriends,
            MessageType type,
            boolean hasMedia) {
        if (!areFriends && (type != MessageType.TEXT || hasMedia)) {
            throw new AppException(ErrorCode.NON_FRIEND_TEXT_ONLY);
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
        return new PrivateConversationParticipants(currentUser, otherUser);
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

}
