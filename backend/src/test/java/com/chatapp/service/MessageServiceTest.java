package com.chatapp.service;

import com.chatapp.dto.request.MediaAttachmentRequest;
import com.chatapp.dto.request.MessageReactionRequest;
import com.chatapp.dto.request.SendMessageRequest;
import com.chatapp.dto.response.MessagePageResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.ChatRoom;
import com.chatapp.model.Message;
import com.chatapp.model.Message.MessageType;
import com.chatapp.model.MessageReaction;
import com.chatapp.model.User;
import com.chatapp.repository.MessageRepository;
import com.chatapp.repository.MessageReactionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageServiceTest {
    @Mock
    private MessageRepository messageRepository;

    @Mock
    private MessageReactionRepository messageReactionRepository;

    @Mock
    private UserService userService;

    @Mock
    private ChatRoomService chatRoomService;

    @Mock
    private FriendshipService friendshipService;

    @Mock
    private LinkPreviewService linkPreviewService;

    @InjectMocks
    private MessageService messageService;

    @Test
    void getConversationReturnsNewestPageInAscendingOrderWithCursor() {
        User currentUser = user(1L, "sayu");
        User otherUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(otherUser.getId())).thenReturn(otherUser);
        when(friendshipService.areFriends(currentUser, otherUser)).thenReturn(true);
        when(messageRepository.findConversationPage(eq(1L), eq(2L), isNull(), any(Pageable.class)))
                .thenReturn(List.of(
                        privateMessage(3L, "three", currentUser, otherUser),
                        privateMessage(2L, "two", otherUser, currentUser),
                        privateMessage(1L, "one", currentUser, otherUser)
                ));

        MessagePageResponse page = messageService.getConversation("sayu", otherUser.getId(), null, 2);

        assertTrue(page.hasMore());
        assertEquals(2L, page.nextBefore());
        assertEquals(List.of(2L, 3L), page.items().stream().map(message -> message.id()).toList());

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(messageRepository).findConversationPage(eq(1L), eq(2L), isNull(), pageableCaptor.capture());
        assertEquals(3, pageableCaptor.getValue().getPageSize());
    }

    @Test
    void getConversationRequiresAcceptedFriendship() {
        User currentUser = user(1L, "sayu");
        User otherUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(otherUser.getId())).thenReturn(otherUser);
        when(friendshipService.areFriends(currentUser, otherUser)).thenReturn(false);

        AppException exception = assertThrows(
                AppException.class,
                () -> messageService.getConversation("sayu", otherUser.getId(), null, 30)
        );

        assertEquals(ErrorCode.FRIENDSHIP_REQUIRED, exception.getErrorCode());
        verify(messageRepository, never()).findConversationPage(any(), any(), any(), any());
    }

    @Test
    void getRoomMessagesReturnsDefaultPageWithoutCursorWhenNoMoreMessages() {
        ChatRoom room = room(10L, "Team");
        User sender = user(1L, "sayu");
        when(chatRoomService.findGroupRoomForMember("sayu", room.getId())).thenReturn(room);
        when(messageRepository.findRoomMessagePage(eq(room.getId()), eq(8L), any(Pageable.class)))
                .thenReturn(List.of(
                        roomMessage(7L, "older", sender, room),
                        roomMessage(6L, "oldest", sender, room)
                ));

        MessagePageResponse page = messageService.getRoomMessages("sayu", room.getId(), 8L, null);

        assertFalse(page.hasMore());
        assertNull(page.nextBefore());
        assertEquals(List.of(6L, 7L), page.items().stream().map(message -> message.id()).toList());

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(messageRepository).findRoomMessagePage(eq(room.getId()), eq(8L), pageableCaptor.capture());
        assertEquals(31, pageableCaptor.getValue().getPageSize());
    }

    @Test
    void getConversationMediaRequiresAcceptedFriendship() {
        User currentUser = user(1L, "sayu");
        User otherUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(otherUser.getId())).thenReturn(otherUser);
        when(friendshipService.areFriends(currentUser, otherUser)).thenReturn(false);

        AppException exception = assertThrows(
                AppException.class,
                () -> messageService.getConversationMedia("sayu", otherUser.getId(), null, 12)
        );

        assertEquals(ErrorCode.FRIENDSHIP_REQUIRED, exception.getErrorCode());
        verify(messageRepository, never()).findConversationMediaPage(any(), any(), any(), any(), any());
    }

    @Test
    void getConversationMediaReturnsNewestPageWithCursor() {
        User currentUser = user(1L, "sayu");
        User otherUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(otherUser.getId())).thenReturn(otherUser);
        when(friendshipService.areFriends(currentUser, otherUser)).thenReturn(true);
        when(messageRepository.findConversationMediaPage(
                eq(1L),
                eq(2L),
                eq(List.of(MessageType.IMAGE, MessageType.VIDEO)),
                eq(10L),
                any(Pageable.class)
        )).thenReturn(List.of(
                mediaMessage(9L, currentUser, otherUser, MessageType.IMAGE),
                mediaMessage(8L, otherUser, currentUser, MessageType.VIDEO),
                mediaMessage(7L, currentUser, otherUser, MessageType.IMAGE)
        ));

        MessagePageResponse page = messageService.getConversationMedia("sayu", otherUser.getId(), 10L, 2);

        assertTrue(page.hasMore());
        assertEquals(8L, page.nextBefore());
        assertEquals(List.of(9L, 8L), page.items().stream().map(message -> message.id()).toList());

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(messageRepository).findConversationMediaPage(
                eq(1L),
                eq(2L),
                eq(List.of(MessageType.IMAGE, MessageType.VIDEO)),
                eq(10L),
                pageableCaptor.capture()
        );
        assertEquals(3, pageableCaptor.getValue().getPageSize());
    }

    @Test
    void getConversationLinksReturnsNewestPageWithCursor() {
        User currentUser = user(1L, "sayu");
        User otherUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(otherUser.getId())).thenReturn(otherUser);
        when(friendshipService.areFriends(currentUser, otherUser)).thenReturn(true);
        when(messageRepository.findConversationLinkPage(eq(1L), eq(2L), isNull(), any(Pageable.class)))
                .thenReturn(List.of(
                        linkMessage(6L, currentUser, otherUser),
                        linkMessage(5L, otherUser, currentUser)
                ));

        MessagePageResponse page = messageService.getConversationLinks("sayu", otherUser.getId(), null, 2);

        assertFalse(page.hasMore());
        assertNull(page.nextBefore());
        assertEquals(List.of(6L, 5L), page.items().stream().map(message -> message.id()).toList());
    }

    @Test
    void getRoomMediaRequiresMembership() {
        AppException accessDenied = new AppException(ErrorCode.ROOM_ACCESS_DENIED);
        when(chatRoomService.findGroupRoomForMember("sayu", 10L)).thenThrow(accessDenied);

        AppException exception = assertThrows(
                AppException.class,
                () -> messageService.getRoomMedia("sayu", 10L, null, 12)
        );

        assertEquals(ErrorCode.ROOM_ACCESS_DENIED, exception.getErrorCode());
        verify(messageRepository, never()).findRoomMediaPage(any(), any(), any(), any());
    }

    @Test
    void getRoomLinksReturnsNewestPageWithCursor() {
        ChatRoom room = room(10L, "Team");
        User sender = user(1L, "sayu");
        when(chatRoomService.findGroupRoomForMember("sayu", room.getId())).thenReturn(room);
        when(messageRepository.findRoomLinkPage(eq(room.getId()), eq(20L), any(Pageable.class)))
                .thenReturn(List.of(
                        roomLinkMessage(19L, sender, room),
                        roomLinkMessage(18L, sender, room),
                        roomLinkMessage(17L, sender, room)
                ));

        MessagePageResponse page = messageService.getRoomLinks("sayu", room.getId(), 20L, 2);

        assertTrue(page.hasMore());
        assertEquals(18L, page.nextBefore());
        assertEquals(List.of(19L, 18L), page.items().stream().map(message -> message.id()).toList());
    }

    @Test
    void searchConversationRequiresAcceptedFriendship() {
        User currentUser = user(1L, "sayu");
        User otherUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(otherUser.getId())).thenReturn(otherUser);
        when(friendshipService.areFriends(currentUser, otherUser)).thenReturn(false);

        AppException exception = assertThrows(
                AppException.class,
                () -> messageService.searchConversation("sayu", otherUser.getId(), "hello", null, 12)
        );

        assertEquals(ErrorCode.FRIENDSHIP_REQUIRED, exception.getErrorCode());
        verify(messageRepository, never()).findConversationSearchPage(any(), any(), any(), any(), any());
    }

    @Test
    void searchConversationReturnsNewestPageWithCursor() {
        User currentUser = user(1L, "sayu");
        User otherUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(otherUser.getId())).thenReturn(otherUser);
        when(friendshipService.areFriends(currentUser, otherUser)).thenReturn(true);
        when(messageRepository.findConversationSearchPage(
                eq(1L),
                eq(2L),
                eq("%hello%"),
                eq(12L),
                any(Pageable.class)
        )).thenReturn(List.of(
                privateMessage(11L, "hello newer", currentUser, otherUser),
                privateMessage(10L, "hello older", otherUser, currentUser),
                privateMessage(9L, "hello oldest", currentUser, otherUser)
        ));

        MessagePageResponse page = messageService.searchConversation("sayu", otherUser.getId(), " Hello ", 12L, 2);

        assertTrue(page.hasMore());
        assertEquals(10L, page.nextBefore());
        assertEquals(List.of(11L, 10L), page.items().stream().map(message -> message.id()).toList());

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(messageRepository).findConversationSearchPage(
                eq(1L),
                eq(2L),
                eq("%hello%"),
                eq(12L),
                pageableCaptor.capture()
        );
        assertEquals(3, pageableCaptor.getValue().getPageSize());
    }

    @Test
    void searchRoomRequiresMembership() {
        AppException accessDenied = new AppException(ErrorCode.ROOM_ACCESS_DENIED);
        when(chatRoomService.findGroupRoomForMember("sayu", 10L)).thenThrow(accessDenied);

        AppException exception = assertThrows(
                AppException.class,
                () -> messageService.searchRoom("sayu", 10L, "hello", null, 12)
        );

        assertEquals(ErrorCode.ROOM_ACCESS_DENIED, exception.getErrorCode());
        verify(messageRepository, never()).findRoomSearchPage(any(), any(), any(), any());
    }

    @Test
    void getConversationAroundMessageReturnsContextAndOlderCursor() {
        User currentUser = user(1L, "sayu");
        User otherUser = user(2L, "thinh");
        Message anchor = privateMessage(10L, "anchor", currentUser, otherUser);
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(otherUser.getId())).thenReturn(otherUser);
        when(friendshipService.areFriends(currentUser, otherUser)).thenReturn(true);
        when(messageRepository.findConversationMessageById(1L, 2L, anchor.getId())).thenReturn(Optional.of(anchor));
        when(messageRepository.findConversationMessagesBefore(eq(1L), eq(2L), eq(anchor.getId()), any(Pageable.class)))
                .thenReturn(List.of(
                        privateMessage(9L, "before 9", otherUser, currentUser),
                        privateMessage(8L, "before 8", currentUser, otherUser),
                        privateMessage(7L, "before 7", otherUser, currentUser)
                ));
        when(messageRepository.findConversationMessagesAfter(eq(1L), eq(2L), eq(anchor.getId()), any(Pageable.class)))
                .thenReturn(List.of(
                        privateMessage(11L, "after 11", otherUser, currentUser),
                        privateMessage(12L, "after 12", currentUser, otherUser)
                ));

        MessagePageResponse page = messageService.getConversationAroundMessage(
                "sayu",
                otherUser.getId(),
                anchor.getId(),
                5
        );

        assertTrue(page.hasMore());
        assertEquals(8L, page.nextBefore());
        assertEquals(List.of(8L, 9L, 10L, 11L, 12L), page.items().stream().map(message -> message.id()).toList());
    }

    @Test
    void getConversationAroundMessageRequiresMessageInConversation() {
        User currentUser = user(1L, "sayu");
        User otherUser = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(currentUser);
        when(userService.findById(otherUser.getId())).thenReturn(otherUser);
        when(friendshipService.areFriends(currentUser, otherUser)).thenReturn(true);
        when(messageRepository.findConversationMessageById(1L, 2L, 30L)).thenReturn(Optional.empty());

        AppException exception = assertThrows(
                AppException.class,
                () -> messageService.getConversationAroundMessage("sayu", otherUser.getId(), 30L, 30)
        );

        assertEquals(ErrorCode.MESSAGE_NOT_FOUND, exception.getErrorCode());
        verify(messageRepository, never()).findConversationMessagesBefore(any(), any(), any(), any());
        verify(messageRepository, never()).findConversationMessagesAfter(any(), any(), any(), any());
    }

    @Test
    void getRoomAroundMessageReturnsContext() {
        ChatRoom room = room(10L, "Team");
        User sender = user(1L, "sayu");
        Message anchor = roomMessage(15L, "anchor", sender, room);
        when(chatRoomService.findGroupRoomForMember("sayu", room.getId())).thenReturn(room);
        when(messageRepository.findRoomMessageById(room.getId(), anchor.getId())).thenReturn(Optional.of(anchor));
        when(messageRepository.findRoomMessagesBefore(eq(room.getId()), eq(anchor.getId()), any(Pageable.class)))
                .thenReturn(List.of(roomMessage(14L, "before", sender, room)));
        when(messageRepository.findRoomMessagesAfter(eq(room.getId()), eq(anchor.getId()), any(Pageable.class)))
                .thenReturn(List.of(
                        roomMessage(16L, "after", sender, room),
                        roomMessage(17L, "after newer", sender, room)
                ));

        MessagePageResponse page = messageService.getRoomAroundMessage("sayu", room.getId(), anchor.getId(), 4);

        assertFalse(page.hasMore());
        assertNull(page.nextBefore());
        assertEquals(List.of(14L, 15L, 16L, 17L), page.items().stream().map(message -> message.id()).toList());
    }

    @Test
    void sendImageMessageSavesMediaMetadata() {
        User sender = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        MediaAttachmentRequest media = media(
                "https://res.cloudinary.com/chat-app/image/upload/sample.jpg",
                "chat-app/messages/sample",
                "image",
                "jpg",
                1024L
        );
        when(userService.findByUsername("sayu")).thenReturn(sender);
        when(userService.findById(receiver.getId())).thenReturn(receiver);
        when(friendshipService.areFriends(sender, receiver)).thenReturn(true);
        when(messageRepository.saveAndFlush(any(Message.class))).thenAnswer(invocation -> {
            Message message = invocation.getArgument(0);
            message.setId(99L);
            message.setTimestamp(LocalDateTime.of(2026, 8, 3, 11, 0));
            return message;
        });

        messageService.sendMessage(
                "sayu",
                new SendMessageRequest(receiver.getId(), "Look", null, null, MessageType.IMAGE, media)
        );

        ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository).saveAndFlush(messageCaptor.capture());
        Message savedMessage = messageCaptor.getValue();
        assertEquals(MessageType.IMAGE, savedMessage.getType());
        assertEquals("Look", savedMessage.getContent());
        assertEquals(media.url(), savedMessage.getMediaUrl());
        assertEquals(media.publicId(), savedMessage.getMediaPublicId());
        assertEquals("image", savedMessage.getMediaResourceType());
        assertEquals(media.bytes(), savedMessage.getMediaBytes());
    }

    @Test
    void sendTextMessageRejectsBlankContent() {
        User sender = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        when(userService.findByUsername("sayu")).thenReturn(sender);
        when(userService.findById(receiver.getId())).thenReturn(receiver);
        when(friendshipService.areFriends(sender, receiver)).thenReturn(true);

        AppException exception = assertThrows(
                AppException.class,
                () -> messageService.sendMessage(
                        "sayu",
                        new SendMessageRequest(receiver.getId(), " ", null, null, MessageType.TEXT, null)
                )
        );

        assertEquals(ErrorCode.INVALID_MESSAGE_CONTENT, exception.getErrorCode());
        verify(messageRepository, never()).saveAndFlush(any(Message.class));
    }

    @Test
    void sendTextMessageSavesLinkPreviewMetadata() {
        User sender = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        String content = "Read this https://example.com/post";
        LinkPreviewMetadata linkPreview = new LinkPreviewMetadata(
                "https://example.com/post",
                "Example post",
                "A useful example article",
                "https://example.com/cover.png",
                "example.com"
        );
        when(userService.findByUsername("sayu")).thenReturn(sender);
        when(userService.findById(receiver.getId())).thenReturn(receiver);
        when(friendshipService.areFriends(sender, receiver)).thenReturn(true);
        when(linkPreviewService.resolveFirstPreview(content)).thenReturn(linkPreview);
        when(messageRepository.saveAndFlush(any(Message.class))).thenAnswer(invocation -> {
            Message message = invocation.getArgument(0);
            message.setId(100L);
            message.setTimestamp(LocalDateTime.of(2026, 8, 3, 12, 0));
            return message;
        });

        messageService.sendMessage(
                "sayu",
                new SendMessageRequest(receiver.getId(), content, null, null, MessageType.TEXT, null)
        );

        ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository).saveAndFlush(messageCaptor.capture());
        Message savedMessage = messageCaptor.getValue();
        assertEquals(linkPreview.url(), savedMessage.getLinkPreviewUrl());
        assertEquals(linkPreview.title(), savedMessage.getLinkPreviewTitle());
        assertEquals(linkPreview.description(), savedMessage.getLinkPreviewDescription());
        assertEquals(linkPreview.imageUrl(), savedMessage.getLinkPreviewImageUrl());
        assertEquals(linkPreview.domain(), savedMessage.getLinkPreviewDomain());
    }

    @Test
    void sendVideoMessageRejectsOversizedMedia() {
        User sender = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        MediaAttachmentRequest media = media(
                "https://res.cloudinary.com/chat-app/video/upload/sample.mp4",
                "chat-app/messages/sample",
                "video",
                "mp4",
                51L * 1024 * 1024
        );
        when(userService.findByUsername("sayu")).thenReturn(sender);
        when(userService.findById(receiver.getId())).thenReturn(receiver);
        when(friendshipService.areFriends(sender, receiver)).thenReturn(true);

        AppException exception = assertThrows(
                AppException.class,
                () -> messageService.sendMessage(
                        "sayu",
                        new SendMessageRequest(receiver.getId(), "", null, null, MessageType.VIDEO, media)
                )
        );

        assertEquals(ErrorCode.INVALID_MEDIA_MESSAGE, exception.getErrorCode());
        verify(messageRepository, never()).saveAndFlush(any(Message.class));
    }

    @Test
    void sendMessageStoresPrivateReplyTargetFromSameConversation() {
        User sender = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        Message replyTarget = privateMessage(9L, "Earlier", receiver, sender);
        when(userService.findByUsername("sayu")).thenReturn(sender);
        when(userService.findById(receiver.getId())).thenReturn(receiver);
        when(friendshipService.areFriends(sender, receiver)).thenReturn(true);
        when(messageRepository.findById(replyTarget.getId())).thenReturn(Optional.of(replyTarget));
        when(messageRepository.saveAndFlush(any(Message.class))).thenAnswer(invocation -> {
            Message message = invocation.getArgument(0);
            message.setId(101L);
            message.setTimestamp(LocalDateTime.of(2026, 8, 3, 13, 0));
            return message;
        });

        messageService.sendMessage(
                "sayu",
                new SendMessageRequest(
                        receiver.getId(),
                        "Replying",
                        null,
                        replyTarget.getId(),
                        MessageType.TEXT,
                        null
                )
        );

        ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository).saveAndFlush(messageCaptor.capture());
        assertEquals(replyTarget, messageCaptor.getValue().getReplyToMessage());
    }

    @Test
    void reactToMessageUpsertsCurrentUserReaction() {
        User sender = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        Message message = privateMessage(20L, "Hello", sender, receiver);
        when(userService.findByUsername("sayu")).thenReturn(sender);
        when(messageRepository.findById(message.getId())).thenReturn(Optional.of(message));
        when(messageReactionRepository.findByMessageIdAndUserId(message.getId(), sender.getId()))
                .thenReturn(Optional.empty());
        when(messageReactionRepository.saveAndFlush(any(MessageReaction.class))).thenAnswer(invocation -> {
            MessageReaction reaction = invocation.getArgument(0);
            reaction.setId(30L);
            reaction.setCreatedAt(LocalDateTime.of(2026, 8, 3, 14, 0));
            return reaction;
        });

        MessageResponse response = messageService.reactToMessage(
                "sayu",
                message.getId(),
                new MessageReactionRequest("💜")
        );

        assertEquals(1, response.reactions().size());
        assertEquals("💜", response.reactions().get(0).emoji());
    }

    @Test
    void recallMessageRequiresSender() {
        User sender = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        Message message = privateMessage(20L, "Hello", sender, receiver);
        when(userService.findByUsername("thinh")).thenReturn(receiver);
        when(messageRepository.findById(message.getId())).thenReturn(Optional.of(message));

        AppException exception = assertThrows(
                AppException.class,
                () -> messageService.recallMessage("thinh", message.getId())
        );

        assertEquals(ErrorCode.MESSAGE_RECALL_NOT_ALLOWED, exception.getErrorCode());
        verify(messageRepository, never()).saveAndFlush(any(Message.class));
    }

    @Test
    void recallMessageMasksContentInResponse() {
        User sender = user(1L, "sayu");
        User receiver = user(2L, "thinh");
        Message message = privateMessage(20L, "Secret", sender, receiver);
        when(userService.findByUsername("sayu")).thenReturn(sender);
        when(messageRepository.findById(message.getId())).thenReturn(Optional.of(message));
        when(messageRepository.saveAndFlush(any(Message.class))).thenAnswer(invocation -> invocation.getArgument(0));

        MessageResponse response = messageService.recallMessage("sayu", message.getId());

        assertTrue(response.recalled());
        assertEquals("", response.content());
    }

    private static User user(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setFullName(username);
        user.setEmail(username + "@example.com");
        user.setPassword("password");
        return user;
    }

    private static ChatRoom room(Long id, String name) {
        ChatRoom room = new ChatRoom();
        room.setId(id);
        room.setName(name);
        room.setType(ChatRoom.RoomType.GROUP);
        return room;
    }

    private static Message privateMessage(Long id, String content, User sender, User receiver) {
        Message message = baseMessage(id, content, sender);
        message.setReceiver(receiver);
        return message;
    }

    private static Message roomMessage(Long id, String content, User sender, ChatRoom room) {
        Message message = baseMessage(id, content, sender);
        message.setChatRoom(room);
        return message;
    }

    private static Message mediaMessage(Long id, User sender, User receiver, MessageType type) {
        Message message = privateMessage(id, "Shared media", sender, receiver);
        message.setType(type);
        message.setMediaUrl("https://example.com/media-" + id);
        message.setMediaPublicId("chat-app/messages/media-" + id);
        message.setMediaResourceType(type == MessageType.IMAGE ? "image" : "video");
        return message;
    }

    private static Message linkMessage(Long id, User sender, User receiver) {
        Message message = privateMessage(id, "https://example.com/post-" + id, sender, receiver);
        applyLinkPreview(message, id);
        return message;
    }

    private static Message roomLinkMessage(Long id, User sender, ChatRoom room) {
        Message message = roomMessage(id, "https://example.com/post-" + id, sender, room);
        applyLinkPreview(message, id);
        return message;
    }

    private static void applyLinkPreview(Message message, Long id) {
        message.setLinkPreviewUrl("https://example.com/post-" + id);
        message.setLinkPreviewTitle("Post " + id);
        message.setLinkPreviewDescription("A useful link");
        message.setLinkPreviewImageUrl("https://example.com/post-" + id + ".jpg");
        message.setLinkPreviewDomain("example.com");
    }

    private static MediaAttachmentRequest media(
            String url,
            String publicId,
            String resourceType,
            String format,
            Long bytes
    ) {
        return new MediaAttachmentRequest(url, publicId, resourceType, format, bytes, 640, 480, 3.5);
    }

    private static Message baseMessage(Long id, String content, User sender) {
        Message message = new Message();
        message.setId(id);
        message.setContent(content);
        message.setType(MessageType.TEXT);
        message.setSender(sender);
        message.setRead(false);
        message.setTimestamp(LocalDateTime.of(2026, 8, 3, 10, id.intValue()));
        return message;
    }
}
