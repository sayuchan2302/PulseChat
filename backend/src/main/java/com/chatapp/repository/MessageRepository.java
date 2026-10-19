package com.chatapp.repository;

import com.chatapp.model.Message;
import com.chatapp.model.Message.MessageType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface MessageRepository extends JpaRepository<Message, Long> {
    // Optional filters use coalesce(<comparison>, true) instead of "(:param is null or ...)".
    // PostgreSQL cannot infer the type of an untyped NULL parameter inside "? is null"
    // (SQLState 42P18); the comparison keeps the parameter typed and coalesce preserves the
    // "no filter" behavior when the parameter is null.
    @Query("""
            select count(m) from Message m
            left join m.receiver receiver
            where m.mediaPublicId = :publicId
              and m.mediaUrl like concat('%/uploads/media/', :filename)
              and m.recalled = false
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.username = :username)
              and ((m.chatRoom is null and (m.sender.username = :username or receiver.username = :username))
                   or exists (select member from ChatRoomMember member
                              where member.chatRoom = m.chatRoom and member.user.username = :username))
            """)
    long countAccessibleLocalMedia(@Param("username") String username,
                                  @Param("publicId") String publicId,
                                  @Param("filename") String filename);

    interface UnreadCountProjection {
        Long getUserId();

        long getUnreadCount();
    }

    interface RoomUnreadCountProjection {
        Long getRoomId();

        long getUnreadCount();
    }

    interface PartnerActivityProjection {
        Long getPartnerId();

        Long getLatestMessageId();
    }

    @Query("""
            select m from Message m
            join fetch m.sender
            left join fetch m.receiver
            where m.chatRoom is null
              and (
                  (m.sender.id = :currentUserId and m.receiver.id = :otherUserId)
                  or (m.sender.id = :otherUserId and m.receiver.id = :currentUserId)
              )
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and coalesce(:clearedAt < m.timestamp, true)
              and coalesce(:before > m.id, true)
            order by m.id desc
            """)
    List<Message> findConversationPage(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
            @Param("before") Long before,
            @Param("clearedAt") LocalDateTime clearedAt,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            left join fetch m.receiver
            where m.chatRoom is null
              and (
                  (m.sender.id = :currentUserId and m.receiver.id = :otherUserId)
                  or (m.sender.id = :otherUserId and m.receiver.id = :currentUserId)
              )
              and m.recalled = false
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and m.mediaUrl is not null
              and m.type in :mediaTypes
              and coalesce(:clearedAt < m.timestamp, true)
              and coalesce(:before > m.id, true)
            order by m.id desc
            """)
    List<Message> findConversationMediaPage(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
            @Param("mediaTypes") List<MessageType> mediaTypes,
            @Param("before") Long before,
            @Param("clearedAt") LocalDateTime clearedAt,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            left join fetch m.receiver
            where m.chatRoom is null
              and (
                  (m.sender.id = :currentUserId and m.receiver.id = :otherUserId)
                  or (m.sender.id = :otherUserId and m.receiver.id = :currentUserId)
              )
              and m.recalled = false
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and m.linkPreviewUrl is not null
              and coalesce(:clearedAt < m.timestamp, true)
              and coalesce(:before > m.id, true)
            order by m.id desc
            """)
    List<Message> findConversationLinkPage(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
            @Param("before") Long before,
            @Param("clearedAt") LocalDateTime clearedAt,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            left join fetch m.receiver
            where m.chatRoom is null
              and (
                  (m.sender.id = :currentUserId and m.receiver.id = :otherUserId)
                  or (m.sender.id = :otherUserId and m.receiver.id = :currentUserId)
              )
              and m.recalled = false
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and (
                  lower(m.content) like :queryPattern
                  or lower(coalesce(m.linkPreviewTitle, '')) like :queryPattern
                  or lower(coalesce(m.linkPreviewDescription, '')) like :queryPattern
                  or lower(coalesce(m.linkPreviewDomain, '')) like :queryPattern
              )
              and coalesce(:clearedAt < m.timestamp, true)
              and coalesce(:before > m.id, true)
            order by m.id desc
            """)
    List<Message> findConversationSearchPage(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
            @Param("queryPattern") String queryPattern,
            @Param("before") Long before,
            @Param("clearedAt") LocalDateTime clearedAt,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            left join fetch m.receiver
            left join fetch m.chatRoom
            where (
                (m.chatRoom is null and (m.sender.id = :currentUserId or m.receiver.id = :currentUserId))
                or (m.chatRoom is not null and exists (
                    select member from ChatRoomMember member
                    where member.chatRoom = m.chatRoom and member.user.id = :currentUserId
                ))
            )
              and m.recalled = false
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and not exists (
                  select setting from ConversationSetting setting
                  where setting.user.id = :currentUserId
                    and setting.clearedAt is not null
                    and (
                        (m.chatRoom is null and (
                            (m.sender.id = :currentUserId and setting.targetUser.id = m.receiver.id)
                            or (m.receiver.id = :currentUserId and setting.targetUser.id = m.sender.id)
                        ) and (m.timestamp is null or m.timestamp <= setting.clearedAt))
                        or (m.chatRoom is not null and setting.chatRoom.id = m.chatRoom.id
                            and (m.timestamp is null or m.timestamp <= setting.clearedAt))
                    )
              )
              and (
                  lower(m.content) like :queryPattern
                  or lower(coalesce(m.linkPreviewTitle, '')) like :queryPattern
                  or lower(coalesce(m.linkPreviewDescription, '')) like :queryPattern
                  or lower(coalesce(m.linkPreviewDomain, '')) like :queryPattern
              )
              and coalesce(:before > m.id, true)
            order by m.id desc
            """)
    List<Message> findGlobalSearchPage(
            @Param("currentUserId") Long currentUserId,
            @Param("queryPattern") String queryPattern,
            @Param("before") Long before,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            left join fetch m.receiver
            where m.chatRoom is null
              and m.id = :messageId
              and (
                  (m.sender.id = :currentUserId and m.receiver.id = :otherUserId)
                  or (m.sender.id = :otherUserId and m.receiver.id = :currentUserId)
              )
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
            """)
    Optional<Message> findConversationMessageById(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
            @Param("messageId") Long messageId
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            left join fetch m.receiver
            where m.chatRoom is null
              and (
                  (m.sender.id = :currentUserId and m.receiver.id = :otherUserId)
                  or (m.sender.id = :otherUserId and m.receiver.id = :currentUserId)
              )
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and m.id < :anchorId
              and coalesce(:clearedAt < m.timestamp, true)
            order by m.id desc
            """)
    List<Message> findConversationMessagesBefore(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
            @Param("anchorId") Long anchorId,
            @Param("clearedAt") LocalDateTime clearedAt,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            left join fetch m.receiver
            where m.chatRoom is null
              and (
                  (m.sender.id = :currentUserId and m.receiver.id = :otherUserId)
                  or (m.sender.id = :otherUserId and m.receiver.id = :currentUserId)
              )
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and m.id > :anchorId
              and coalesce(:clearedAt < m.timestamp, true)
            order by m.id asc
            """)
    List<Message> findConversationMessagesAfter(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
            @Param("anchorId") Long anchorId,
            @Param("clearedAt") LocalDateTime clearedAt,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            left join fetch m.receiver
            where m.id in (
                select max(latest.id)
                from Message latest
                where latest.chatRoom is null
                  and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                                  where hiddenMessage = latest and hidden.id = :currentUserId)
                  and (
                      (latest.sender.id = :currentUserId and latest.receiver.id in :friendIds)
                      or (latest.receiver.id = :currentUserId and latest.sender.id in :friendIds)
                  )
                group by case
                    when latest.sender.id = :currentUserId then latest.receiver.id
                    else latest.sender.id
                end
            )
            """)
    List<Message> findLatestMessagesForPrivateConversations(
            @Param("currentUserId") Long currentUserId,
            @Param("friendIds") List<Long> friendIds
    );

    @Query("""
            select m.receiver.id as partnerId, max(m.id) as latestMessageId
            from Message m
            where m.chatRoom is null
              and m.sender.id = :userId
            group by m.receiver.id
            """)
    List<PartnerActivityProjection> findLatestSentActivityByReceiver(@Param("userId") Long userId);

    @Query("""
            select m.sender.id as partnerId, max(m.id) as latestMessageId
            from Message m
            where m.chatRoom is null
              and m.receiver.id = :userId
            group by m.sender.id
            """)
    List<PartnerActivityProjection> findLatestReceivedActivityBySender(@Param("userId") Long userId);

    @Query("""
            select distinct m.receiver.id
            from Message m
            where m.chatRoom is null
              and m.sender.id = :senderId
              and m.receiver.id in :receiverIds
            """)
    List<Long> findPrivateConversationRecipientIdsSentByUser(
            @Param("senderId") Long senderId,
            @Param("receiverIds") List<Long> receiverIds
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            where m.id in (
                select max(latest.id)
                from Message latest
                where latest.chatRoom.id in :roomIds
                  and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                                  where hiddenMessage = latest and hidden.id = :currentUserId)
                group by latest.chatRoom.id
            )
            """)
    List<Message> findLatestMessagesForRooms(@Param("roomIds") List<Long> roomIds,
                                             @Param("currentUserId") Long currentUserId);

    @Query("""
            select m.sender.id as userId, count(m) as unreadCount
            from Message m
            where m.receiver.id = :receiverId
              and m.read = false
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :receiverId)
            group by m.sender.id
            """)
    List<UnreadCountProjection> countUnreadMessagesGroupedBySender(@Param("receiverId") Long receiverId);

    @Query("""
            select m.chatRoom.id as roomId, count(m) as unreadCount
            from Message m
            left join ChatRoomReadState readState
              on readState.chatRoom = m.chatRoom
             and readState.user.id = :currentUserId
            where m.chatRoom.id in :roomIds
              and m.sender.id <> :currentUserId
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and (readState.id is null or m.timestamp > readState.lastReadAt)
            group by m.chatRoom.id
            """)
    List<RoomUnreadCountProjection> countUnreadRoomMessages(
            @Param("currentUserId") Long currentUserId,
            @Param("roomIds") List<Long> roomIds
    );

    @Query("""
            select member.user.id as userId, count(m) as unreadCount
            from ChatRoomMember member
            left join ChatRoomReadState readState
              on readState.chatRoom.id = member.chatRoom.id
             and readState.user.id = member.user.id
            left join Message m
              on m.chatRoom.id = member.chatRoom.id
             and m.sender.id <> member.user.id
             and (readState.id is null or m.timestamp > readState.lastReadAt)
             and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                             where hiddenMessage = m and hidden.id = member.user.id)
            where member.chatRoom.id = :roomId
              and member.user.id in :userIds
            group by member.user.id
            """)
    List<UnreadCountProjection> countUnreadRoomMessagesByUser(
            @Param("roomId") Long roomId,
            @Param("userIds") List<Long> userIds
    );

    Optional<Message> findTopByChatRoomIdOrderByIdDesc(Long chatRoomId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update Message m
            set m.read = true
            where m.sender.id = :senderId
              and m.receiver.id = :receiverId
              and m.read = false
            """)
    int markConversationAsRead(
            @Param("senderId") Long senderId,
            @Param("receiverId") Long receiverId
    );

    Optional<Message> findBySenderIdAndClientId(Long senderId, String clientId);

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and coalesce(:clearedAt < m.timestamp, true)
              and coalesce(:before > m.id, true)
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
            order by m.id desc
            """)
    List<Message> findRoomMessagePage(
            @Param("roomId") Long roomId,
            @Param("currentUserId") Long currentUserId,
            @Param("before") Long before,
            @Param("clearedAt") LocalDateTime clearedAt,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            where m.chatRoom.id = :roomId
              and m.recalled = false
              and m.type = :messageType
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.username = :username)
              and not exists (select setting from ConversationSetting setting
                              where setting.user.username = :username
                                and setting.chatRoom.id = :roomId
                                and setting.clearedAt is not null
                                and (m.timestamp is null or m.timestamp <= setting.clearedAt))
            order by m.id desc
            """)
    List<Message> findRecentSummarizableRoomMessages(
            @Param("roomId") Long roomId,
            @Param("messageType") MessageType messageType,
            @Param("username") String username,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and m.recalled = false
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and m.mediaUrl is not null
              and m.type in :mediaTypes
              and coalesce(:clearedAt < m.timestamp, true)
              and coalesce(:before > m.id, true)
            order by m.id desc
            """)
    List<Message> findRoomMediaPage(
            @Param("roomId") Long roomId,
            @Param("mediaTypes") List<MessageType> mediaTypes,
            @Param("currentUserId") Long currentUserId,
            @Param("before") Long before,
            @Param("clearedAt") LocalDateTime clearedAt,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and m.recalled = false
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and m.linkPreviewUrl is not null
              and coalesce(:clearedAt < m.timestamp, true)
              and coalesce(:before > m.id, true)
            order by m.id desc
            """)
    List<Message> findRoomLinkPage(
            @Param("roomId") Long roomId,
            @Param("currentUserId") Long currentUserId,
            @Param("before") Long before,
            @Param("clearedAt") LocalDateTime clearedAt,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and m.recalled = false
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and (
                  lower(m.content) like :queryPattern
                  or lower(coalesce(m.linkPreviewTitle, '')) like :queryPattern
                  or lower(coalesce(m.linkPreviewDescription, '')) like :queryPattern
                  or lower(coalesce(m.linkPreviewDomain, '')) like :queryPattern
              )
              and coalesce(:clearedAt < m.timestamp, true)
              and coalesce(:before > m.id, true)
            order by m.id desc
            """)
    List<Message> findRoomSearchPage(
            @Param("roomId") Long roomId,
            @Param("queryPattern") String queryPattern,
            @Param("currentUserId") Long currentUserId,
            @Param("before") Long before,
            @Param("clearedAt") LocalDateTime clearedAt,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and m.id = :messageId
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
            """)
    Optional<Message> findRoomMessageById(
            @Param("roomId") Long roomId,
            @Param("messageId") Long messageId,
            @Param("currentUserId") Long currentUserId
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and m.id < :anchorId
              and coalesce(:clearedAt < m.timestamp, true)
            order by m.id desc
            """)
    List<Message> findRoomMessagesBefore(
            @Param("roomId") Long roomId,
            @Param("anchorId") Long anchorId,
            @Param("currentUserId") Long currentUserId,
            @Param("clearedAt") LocalDateTime clearedAt,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and not exists (select hidden from Message hiddenMessage join hiddenMessage.hiddenByUsers hidden
                              where hiddenMessage = m and hidden.id = :currentUserId)
              and m.id > :anchorId
              and coalesce(:clearedAt < m.timestamp, true)
            order by m.id asc
            """)
    List<Message> findRoomMessagesAfter(
            @Param("roomId") Long roomId,
            @Param("anchorId") Long anchorId,
            @Param("currentUserId") Long currentUserId,
            @Param("clearedAt") LocalDateTime clearedAt,
            Pageable pageable
    );
}
