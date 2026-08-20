package com.chatapp.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class UploadSecurityHeadersFilterTest {
    private final UploadSecurityHeadersFilter filter = new UploadSecurityHeadersFilter();

    @Test
    void marksRawMediaAsAttachmentAndDisablesMimeSniffing() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/uploads/media/file.txt");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals("nosniff", response.getHeader("X-Content-Type-Options"));
        assertEquals("attachment", response.getHeader("Content-Disposition"));
    }

    @Test
    void keepsSupportedInlineMediaAvailableForPreview() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/uploads/media/file.webp");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals("nosniff", response.getHeader("X-Content-Type-Options"));
        assertNull(response.getHeader("Content-Disposition"));
    }
}
