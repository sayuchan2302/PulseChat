package com.chatapp.service;

import com.chatapp.dto.response.MessagePageResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.model.Message;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.util.Comparator;
import java.util.List;
import java.util.function.BiFunction;
import java.util.stream.Stream;

/** Builds message page responses from repository results. */
final class MessagePageAssembler {
    private MessagePageAssembler() {
    }

    static MessagePageResponse emptyPage() {
        return new MessagePageResponse(List.of(), false, null);
    }

    static MessagePageResponse fromNewestFirst(List<Message> newestFirstMessages, int pageSize) {
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

    static MessagePageResponse galleryFromNewestFirst(List<Message> newestFirstMessages, int pageSize) {
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

    static MessagePageResponse aroundAnchor(
            Message anchorMessage,
            int pageSize,
            BiFunction<Long, Pageable, List<Message>> beforeLoader,
            BiFunction<Long, Pageable, List<Message>> afterLoader) {
        int beforeSize = Math.max((pageSize - 1) / 2, 0);
        int afterSize = Math.max(pageSize - beforeSize - 1, 0);
        List<Message> beforeMessages = beforeSize == 0
                ? List.of()
                : beforeLoader.apply(anchorMessage.getId(), PageRequest.of(0, beforeSize + 1));
        boolean hasMoreBeforeMessages = beforeMessages.size() > beforeSize;
        List<Message> visibleBeforeMessages = hasMoreBeforeMessages
                ? beforeMessages.subList(0, beforeSize)
                : beforeMessages;
        List<Message> afterMessages = afterSize == 0
                ? List.of()
                : afterLoader.apply(anchorMessage.getId(), PageRequest.of(0, afterSize));

        List<MessageResponse> items = Stream.concat(
                        Stream.concat(visibleBeforeMessages.stream(), Stream.of(anchorMessage)),
                        afterMessages.stream())
                .sorted(Comparator.comparing(Message::getId))
                .map(MessageResponse::from)
                .toList();
        Long nextBefore = hasMoreBeforeMessages && !items.isEmpty() ? items.get(0).id() : null;

        return new MessagePageResponse(items, hasMoreBeforeMessages, nextBefore);
    }
}
