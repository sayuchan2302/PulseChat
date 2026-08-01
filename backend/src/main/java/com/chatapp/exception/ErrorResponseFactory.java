package com.chatapp.exception;

import com.chatapp.dto.response.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatusCode;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.UUID;

public final class ErrorResponseFactory {
    private static final String REQUEST_ID_HEADER = "X-Request-ID";

    private ErrorResponseFactory() {
    }

    public static ErrorResponse create(
            HttpStatusCode status,
            String code,
            String message,
            HttpServletRequest request
    ) {
        return create(status, code, message, request, requestId(request), List.of());
    }

    public static ErrorResponse create(
            HttpStatusCode status,
            String code,
            String message,
            HttpServletRequest request,
            String requestId
    ) {
        return create(status, code, message, request, requestId, List.of());
    }

    public static ErrorResponse create(
            HttpStatusCode status,
            String code,
            String message,
            HttpServletRequest request,
            String requestId,
            List<ErrorResponse.FieldError> fieldErrors
    ) {
        return ErrorResponse.of(
                status,
                code,
                message,
                request.getRequestURI(),
                requestId,
                fieldErrors
        );
    }

    public static String requestId(HttpServletRequest request) {
        String requestId = request.getHeader(REQUEST_ID_HEADER);
        if (StringUtils.hasText(requestId)) {
            return requestId;
        }

        return UUID.randomUUID().toString();
    }
}
