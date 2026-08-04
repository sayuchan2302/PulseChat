package com.chatapp.repository;

import com.chatapp.model.Message;
import com.chatapp.model.Message.MessageType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MessageRepository extends JpaRepository<Message, Long> {
    interface UnreadCountProjection {
        Long getUserId();

        long getUnreadCount();
    }

    interface RoomUnreadCountProjection {
        Long getRoomId();

        long getUnreadCount();
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
              and (:before is null or m.id < :before)
            order by m.id desc
            """)
    List<Message> findConversationPage(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
            @Param("before") Long before,
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
              and m.mediaUrl is not null
              and m.type in :mediaTypes
              and (:before is null or m.id < :before)
            order by m.id desc
            """)
    List<Message> findConversationMediaPage(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
            @Param("mediaTypes") List<MessageType> mediaTypes,
            @Param("before") Long before,
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
              and m.linkPreviewUrl is not null
              and (:before is null or m.id < :before)
            order by m.id desc
            """)
    List<Message> findConversationLinkPage(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
            @Param("before") Long before,
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
              and (
                  lower(m.content) like :queryPattern
                  or lower(coalesce(m.linkPreviewTitle, '')) like :queryPattern
                  or lower(coalesce(m.linkPreviewDescription, '')) like :queryPattern
                  or lower(coalesce(m.linkPreviewDomain, '')) like :queryPattern
              )
              and (:before is null or m.id < :before)
            order by m.id desc
            """)
    List<Message> findConversationSearchPage(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
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
              and m.id < :anchorId
            order by m.id desc
            """)
    List<Message> findConversationMessagesBefore(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
            @Param("anchorId") Long anchorId,
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
              and m.id > :anchorId
            order by m.id asc
            """)
    List<Message> findConversationMessagesAfter(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId,
            @Param("anchorId") Long anchorId,
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
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            where m.id in (
                select max(latest.id)
                from Message latest
                where latest.chatRoom.id in :roomIds
                group by latest.chatRoom.id
            )
            """)
    List<Message> findLatestMessagesForRooms(@Param("roomIds") List<Long> roomIds);

    @Query("""
            select m.sender.id as userId, count(m) as unreadCount
            from Message m
            where m.receiver.id = :receiverId
              and m.read = false
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
              and (readState.id is null or m.timestamp > readState.lastReadAt)
            group by m.chatRoom.id
            """)
    List<RoomUnreadCountProjection> countUnreadRoomMessages(
            @Param("currentUserId") Long currentUserId,
            @Param("roomIds") List<Long> roomIds
    );

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
              and (:before is null or m.id < :before)
            order by m.id desc
            """)
    List<Message> findRoomMessagePage(
            @Param("roomId") Long roomId,
            @Param("before") Long before,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and m.recalled = false
              and m.mediaUrl is not null
              and m.type in :mediaTypes
              and (:before is null or m.id < :before)
            order by m.id desc
            """)
    List<Message> findRoomMediaPage(
            @Param("roomId") Long roomId,
            @Param("mediaTypes") List<MessageType> mediaTypes,
            @Param("before") Long before,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and m.recalled = false
              and m.linkPreviewUrl is not null
              and (:before is null or m.id < :before)
            order by m.id desc
            """)
    List<Message> findRoomLinkPage(
            @Param("roomId") Long roomId,
            @Param("before") Long before,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and m.recalled = false
              and (
                  lower(m.content) like :queryPattern
                  or lower(coalesce(m.linkPreviewTitle, '')) like :queryPattern
                  or lower(coalesce(m.linkPreviewDescription, '')) like :queryPattern
                  or lower(coalesce(m.linkPreviewDomain, '')) like :queryPattern
              )
              and (:before is null or m.id < :before)
            order by m.id desc
            """)
    List<Message> findRoomSearchPage(
            @Param("roomId") Long roomId,
            @Param("queryPattern") String queryPattern,
            @Param("before") Long before,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and m.id = :messageId
            """)
    Optional<Message> findRoomMessageById(
            @Param("roomId") Long roomId,
            @Param("messageId") Long messageId
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and m.id < :anchorId
            order by m.id desc
            """)
    List<Message> findRoomMessagesBefore(
            @Param("roomId") Long roomId,
            @Param("anchorId") Long anchorId,
            Pageable pageable
    );

    @Query("""
            select m from Message m
            join fetch m.sender
            join fetch m.chatRoom
            left join fetch m.receiver
            where m.chatRoom.id = :roomId
              and m.id > :anchorId
            order by m.id asc
            """)
    List<Message> findRoomMessagesAfter(
            @Param("roomId") Long roomId,
            @Param("anchorId") Long anchorId,
            Pageable pageable
    );
}
