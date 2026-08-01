package com.chatapp.dto.response;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

import java.time.Instant;
import java.util.List;

public record ErrorResponse(
        Instant timestamp,
        String requestId,
        int status,
        String error,
        String code,
        String message,
        String path,
        List<FieldError> fieldErrors
) {
    public static ErrorResponse of(
            HttpStatusCode statusCode,
            String code,
            String message,
            String path,
            String requestId
    ) {
        return of(statusCode, code, message, path, requestId, List.of());
    }

    public static ErrorResponse of(
            HttpStatusCode statusCode,
            String code,
            String message,
            String path,
            String requestId,
            List<FieldError> fieldErrors
    ) {
        return new ErrorResponse(
                Instant.now(),
                requestId,
                statusCode.value(),
                reasonPhrase(statusCode),
                code,
                message,
                path,
                List.copyOf(fieldErrors)
        );
    }

    private static String reasonPhrase(HttpStatusCode statusCode) {
        if (statusCode instanceof HttpStatus status) {
            return status.getReasonPhrase();
        }

        return "HTTP " + statusCode.value();
    }

    public record FieldError(String field, String message) {
    }
}
