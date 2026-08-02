package com.chatapp.dto.response;

public record ReadReceiptResponse(
        Long readerId,
        Long senderId,
        long readCount
) {
}
