package com.chatapp.security;

import com.chatapp.controller.AdminAccountController;
import com.chatapp.controller.AdminAuditLogController;
import com.chatapp.dto.response.AdminAccountPageResponse;
import com.chatapp.dto.response.AdminAuditLogPageResponse;
import com.chatapp.service.AdminAccountService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = {AdminAccountController.class, AdminAuditLogController.class}, properties = {
        "cors.allowed-origins=http://localhost:5173"})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, MediaSessionCookieService.class,
        RestAuthenticationEntryPoint.class, RestAccessDeniedHandler.class, UploadSecurityHeadersFilter.class})
class AdminAccessSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtService jwt;
    @MockitoBean CustomUserDetailsService users;
    @MockitoBean AdminAccountService adminAccountService;

    @Test
    void anonymousAdminRequestsRequireAuthentication() throws Exception {
        mvc.perform(get("/admin/accounts")).andExpect(status().isUnauthorized());
        mvc.perform(get("/admin/audit-logs")).andExpect(status().isUnauthorized());
        verifyNoInteractions(adminAccountService);
    }

    @Test
    void regularUsersCannotReachAdminEndpoints() throws Exception {
        mvc.perform(get("/admin/accounts").with(user("sayu").roles("USER")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/admin/audit-logs").with(user("sayu").roles("USER")))
                .andExpect(status().isForbidden());
        verifyNoInteractions(adminAccountService);
    }

    @Test
    void adminsCanListAccountsAndAuditLogs() throws Exception {
        when(adminAccountService.search(isNull(), eq(0), eq(25)))
                .thenReturn(new AdminAccountPageResponse(List.of(), 0, 25, 0, 0));
        when(adminAccountService.listAuditLogs(0, 25))
                .thenReturn(new AdminAuditLogPageResponse(List.of(), 0, 25, 0, 0));

        mvc.perform(get("/admin/accounts").with(user("root").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());
        mvc.perform(get("/admin/audit-logs").with(user("root").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());
    }
}
