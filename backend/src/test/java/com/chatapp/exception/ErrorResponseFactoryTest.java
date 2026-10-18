package com.chatapp.exception;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ErrorResponseFactoryTest {

    @Test
    void echoesWellFormedClientRequestIds() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Request-ID", "client-trace_1234");

        assertEquals("client-trace_1234", ErrorResponseFactory.requestId(request));
    }

    @Test
    void replacesHeaderInjectionAttemptsWithGeneratedIds() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Request-ID", "bad id with spaces\nand newline");

        String requestId = ErrorResponseFactory.requestId(request);

        assertNotEquals("bad id with spaces\nand newline", requestId);
        assertTrue(requestId.matches("[0-9a-f-]{36}"));
    }

    @Test
    void generatesIdsWhenHeaderIsMissingOrTooShort() {
        MockHttpServletRequest missing = new MockHttpServletRequest();
        assertTrue(ErrorResponseFactory.requestId(missing).matches("[0-9a-f-]{36}"));

        MockHttpServletRequest shortId = new MockHttpServletRequest();
        shortId.addHeader("X-Request-ID", "abc");
        assertTrue(ErrorResponseFactory.requestId(shortId).matches("[0-9a-f-]{36}"));
    }
}
