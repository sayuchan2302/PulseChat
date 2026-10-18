package com.chatapp.security;

import com.chatapp.controller.LocalMediaController;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.service.LocalMediaStorageService;
import com.chatapp.service.MediaAccessService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = LocalMediaController.class, properties = {
        "cors.allowed-origins=http://localhost:5173"})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, MediaSessionCookieService.class,
        RestAuthenticationEntryPoint.class, RestAccessDeniedHandler.class, UploadSecurityHeadersFilter.class})
class LocalMediaHttpSecurityTest {
    private static final String FILE = "8c70df6a-ef7d-4fea-8bf6-090a38fd765f.txt";
    private static final String PATH = "/uploads/media/" + FILE;
    @Autowired MockMvc mvc;
    @MockitoBean JwtService jwt;
    @MockitoBean CustomUserDetailsService users;
    @MockitoBean MediaAccessService access;
    @MockitoBean LocalMediaStorageService storage;

    @Test
    void anonymousMediaRequestsRequireAuthentication() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        mvc.perform(head(PATH)).andExpect(status().isUnauthorized());
        verifyNoInteractions(access, storage);
    }

    @Test
    void authenticatedNonParticipantCannotDownload() throws Exception {
        doThrow(new AppException(ErrorCode.MEDIA_NOT_FOUND)).when(access).requireAccess("mallory", FILE);
        mvc.perform(get(PATH).with(user("mallory"))).andExpect(status().isNotFound());
        verifyNoInteractions(storage);
    }

    @Test
    void browserMediaCookieAuthenticatesAndChecksMembershipWithoutMakingContentCacheable() throws Exception {
        when(jwt.extractMediaUsername("active-session")).thenReturn("alice");
        when(users.loadUserByUsername("alice")).thenReturn(User.withUsername("alice").password("unused").roles("USER").build());
        when(storage.loadMedia(FILE)).thenReturn(new ByteArrayResource("private".getBytes()));
        mvc.perform(get(PATH).cookie(new Cookie("chat_media_session", "active-session")))
                .andExpect(status().isOk())
                .andExpect(content().string("private"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Content-Disposition", "attachment"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
        verify(access).requireAccess("alice", FILE);
    }

    @Test
    void revokedMediaCookieCannotAuthenticate() throws Exception {
        when(jwt.extractMediaUsername("revoked")).thenThrow(new IllegalArgumentException("Unexpected JWT token use"));
        mvc.perform(get(PATH).cookie(new Cookie("chat_media_session", "revoked")))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(access, storage);
    }

    @Test
    void mediaCookieCannotAuthenticateOtherApiEndpoints() throws Exception {
        mvc.perform(get("/users/me").cookie(new Cookie("chat_media_session", "active-session")))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(jwt);
    }

    @Test
    void mediaTokenCannotAuthenticateApiRequestsAsBearerToken() throws Exception {
        when(jwt.extractUsername("media-token")).thenThrow(new IllegalArgumentException("Unexpected JWT token use"));
        mvc.perform(get("/users/me").header("Authorization", "Bearer media-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deletedAccountWithBearerTokenIsRejectedWithUnauthorizedInsteadOfServerError() throws Exception {
        when(jwt.extractUsername("ghost-token")).thenReturn("ghost");
        when(users.loadUserByUsername("ghost")).thenThrow(new UsernameNotFoundException("account deleted"));
        mvc.perform(get("/users/me").header("Authorization", "Bearer ghost-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void authorizedMediaSupportsRangeRequestsForPlayback() throws Exception {
        when(storage.loadMedia(FILE)).thenReturn(new ByteArrayResource("private".getBytes()));
        mvc.perform(get(PATH).with(user("alice")).header("Range", "bytes=0-2"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 0-2/7"))
                .andExpect(content().string("pri"));
        verify(access).requireAccess("alice", FILE);
    }
}
