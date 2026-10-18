package com.chatapp.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class AuthOriginCheckFilterTest {
    private final MockHttpServletResponse response = new MockHttpServletResponse();
    private final MockFilterChain chain = new MockFilterChain();
    private final AuthOriginCheckFilter filter = new AuthOriginCheckFilter(corsSource());

    @Test
    void refreshWithAllowedOriginPassesThrough() throws Exception {
        MockHttpServletRequest request = refreshRequest();
        request.addHeader("Origin", "http://localhost:5173");

        filter.doFilter(request, response, chain);

        assertNotNull(chain.getRequest());
        assertEquals(200, response.getStatus());
    }

    @Test
    void refreshWithForeignOriginIsForbidden() throws Exception {
        MockHttpServletRequest request = refreshRequest();
        request.addHeader("Origin", "https://evil.example");

        filter.doFilter(request, response, chain);

        assertNull(chain.getRequest());
        assertEquals(403, response.getStatus());
    }

    @Test
    void refererOriginIsCheckedWhenTheOriginHeaderIsMissing() throws Exception {
        MockHttpServletRequest allowed = refreshRequest();
        allowed.addHeader("Referer", "http://localhost:5173/settings");
        filter.doFilter(allowed, response, chain);
        assertNotNull(chain.getRequest());

        MockHttpServletResponse blockedResponse = new MockHttpServletResponse();
        MockFilterChain blockedChain = new MockFilterChain();
        MockHttpServletRequest blocked = refreshRequest();
        blocked.addHeader("Referer", "https://evil.example/page");
        filter.doFilter(blocked, blockedResponse, blockedChain);
        assertNull(blockedChain.getRequest());
        assertEquals(403, blockedResponse.getStatus());
    }

    @Test
    void requestsWithoutOriginHeadersAreAllowedForNonBrowserClients() throws Exception {
        filter.doFilter(refreshRequest(), response, chain);

        assertNotNull(chain.getRequest());
    }

    @Test
    void unrelatedAuthEndpointsAreNotFiltered() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
        request.setContextPath("/api");
        request.addHeader("Origin", "https://evil.example");

        filter.doFilter(request, response, chain);

        assertNotNull(chain.getRequest());
    }

    private static MockHttpServletRequest refreshRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/refresh");
        request.setContextPath("/api");
        return request;
    }

    private static CorsConfigurationSource corsSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(List.of("http://localhost:5173"));
        configuration.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
