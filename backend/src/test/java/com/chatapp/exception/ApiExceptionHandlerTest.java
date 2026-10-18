package com.chatapp.exception;

import com.chatapp.dto.response.ErrorResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

import java.util.Objects;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ApiExceptionHandlerTest {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void responseStatusReasonIsNotEchoedToClients() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/uploads/media/secret.txt");

        ErrorResponse response = Objects.requireNonNull(handler.handleResponseStatusException(
                        new ResponseStatusException(HttpStatus.NOT_FOUND, "db table users missing"),
                        request)
                .getBody());

        assertEquals(404, response.status());
        assertEquals("Resource not found", response.message());
    }

    @Test
    void unmappedResponseStatusFallsBackToAGenericMessage() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/downloads/file.txt");

        ErrorResponse response = Objects.requireNonNull(handler.handleResponseStatusException(
                        new ResponseStatusException(HttpStatus.BAD_GATEWAY, "upstream 10.0.0.7 refused connection"),
                        request)
                .getBody());

        assertEquals(502, response.status());
        assertEquals("Request failed", response.message());
    }
}
