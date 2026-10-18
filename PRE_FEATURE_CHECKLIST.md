# PulseChat — Checklist trước khi thêm feature mới

> Nguồn: đợt full code review (backend logic, backend security, frontend, tests/config) ngày 2026-10-16/17.
> Quy tắc: **hoàn tất Phase 1 + Phase 2 (Gate) trước khi bắt đầu feature mới.** Nếu feature gấp không thể chờ, tối thiểu phải xong Phase 1.
> Phạm vi: toàn bộ fix + hardening từ đợt review — **không bao gồm roadmap feature mới** (chọn sau khi qua Gate).
> Trạng thái: **Phase 1 hoàn tất (2026-10-18)** — admin feature + V5 đã commit, backend suite 171/171 xanh, frontend xanh. Việc tiếp theo: Phase 2 (CI, bảo mật...) — xem "Tiến độ thực thi".

---

## Tiến độ thực thi (cập nhật: 2026-10-18)

- [x] **1.1 Commit admin + V5** — commit `e694394` (33 files, +853/−10). Verify trước commit: backend `mvnw compile` ✅, frontend `npm run build` ✅.
- [x] **1.2 Fix test đỏ** — commit `283d29e`. Phát hiện **2 nguyên nhân**: (a) assert cứng `4` → giờ đếm động số file `.sql` từ classpath; (b) `V5` dùng multi-column `ALTER TABLE` (PostgreSQL chấp nhận, H2 của test thì không) → đã tách thành 2 câu lệnh + thêm assert cột `ACCOUNT_ROLE`/`ENABLED`. Kết quả: `-Dtest=ProductionSchemaMigrationTest` ✅ (applied 5 migrations).
- [x] **1.3 Fix `AdminRoleBootstrap`** — commit `f19bb91`. Giờ chỉ promote khi **chưa có admin enabled nào** (không hoàn tác ban/demote nữa) và không bao giờ đổi `enabled`. Thêm `existsByAccountRoleAndEnabledTrue` + 6 unit test mới: ✅ `AdminRoleBootstrapTest` 6/6 + migration test 1/1 (BUILD SUCCESS).
- [x] **1.4 Fix 2 bug FE** — commit `679f7e5`. (a) `finishCall`: timer giờ lưu trong ref, clear khi gọi lại/unmount, và chỉ xoá `activeCall` nếu vẫn còn `status === 'ending'` (không "nuốt" cuộc gọi mới trong 1.5s); (b) seen-by: xoá id khỏi `roomSeenByLoadedMessageIdsRef` khi phát hiện đã đổi phòng → lần sau tự load lại. Thêm regression test `useMessageHistory.test.tsx` (2 cases: release marker + retry). Verify: `npm test` ✅ 15/15 (6 files), `npm run lint` ✅ 0 error, `npm run build` ✅.
- [x] **1.5 Verify cuối phase** — Backend `mvnw test` ✅ **171/171, BUILD SUCCESS**; frontend ✅ 15/15 test + lint (0 error) + build.

**Phát sinh trong Phase 1 (đã xử lý):**
- [x] Full suite lộ thêm **28 failures ở `WebSocketAuthChannelInterceptorTest`** — tồn tại từ feature admin: interceptor giờ check account mỗi frame và `setUser(...)`, nhưng test cũ chưa stub `loadUserByUsername` (NPE) và tạo accessor frozen (IllegalStateException). Đã đồng bộ test (stub user enabled, `setLeaveMutable(true)`) + thêm case tài khoản bị disable không gửi được frame — commit `8fbbc6d`.

---

## Trạng thái hiện tại (để ghi nhớ)

- [x] ~~33 file admin feature chưa commit, `V5__account_roles_and_status.sql` untracked~~ → đã commit `e694394` (2026-10-18), trước đó verify compile backend + build FE.
- [x] ~~`ProductionSchemaMigrationTest` đỏ~~ → đã fix `283d29e` (đếm migration động từ classpath + V5 tách câu lệnh chạy được trên H2). Phát hiện thêm: `V5` gốc không chạy được trên H2.
- [ ] Chưa có CI (`.github/` không tồn tại) → thuộc Phase 2.
- [ ] Spring Boot 3.2.0 trong `pom.xml:11` (thiếu nhiều bản vá CVE) → thuộc Phase 2.
- [ ] README trỏ tới `PHASE1_SECURITY.md` và `scripts/run-phase1-smoke.ps1` **không tồn tại** → thuộc Phase 4.

---

## Phase 1 — Bắt buộc ngay (P0, ~0.5–1 ngày)

### 1.1 Chốt an toàn feature admin đang dở
- [ ] Commit trọn gói: admin feature + `backend/src/main/resources/db/migration/V5__account_roles_and_status.sql` **cùng một commit** (tách rời sẽ vỡ `ddl-auto=validate` ở prod).
- [ ] Kiểm tra `git status` sạch sau commit, xác nhận V5 đã được track (`git ls-files | findstr V5`).

### 1.2 Fix backend test đỏ
- [ ] `backend/src/test/java/com/chatapp/config/ProductionSchemaMigrationTest.java:25` — `assertEquals(4, ...)` → nên assert **động theo số file migration** (đếm `db/migration/*.sql`) thay vì hardcode.
- [ ] Chạy `cd backend; .\mvnw.cmd test` — toàn bộ suite phải xanh.

### 1.3 Fix admin bootstrap (an ninh, đã xác minh)
- [ ] `backend/src/main/java/com/chatapp/config/AdminRoleBootstrap.java:30-35`:
  - Không `setEnabled(true)` mỗi lần khởi động (đang âm thầm gỡ ban).
  - Chỉ promote khi user đang là `USER` và `enabled`; không hạ cấp/đổi trạng thái ngược lại.
  - Cân nhắc gate bằng flag riêng (`app.admin.bootstrap-enabled`) hoặc profile.

### 1.4 Fix 2 bug frontend rõ ràng (đã xác minh)
- [ ] `frontend/src/hooks/useCallFeature.ts:347-361` — timer 1.5s trong `finishCall` không được lưu id → có thể xoá state của **cuộc gọi mới** vừa bắt đầu. Lưu id vào ref + clear trong `finishCall`/khi bắt đầu call/unmount.
- [ ] `frontend/src/hooks/useMessageHistory.ts:39-64` — id message được đánh dấu "đã load seen-by" trước khi gọi API; khi đổi phòng giữa chừng (return ở dòng 48) id không bị xoá → seen-by mất vĩnh viễn đến khi reload. Xoá id khi `selectedRoomIdRef.current !== roomId`.

### 1.5 Xác nhận sau Phase 1
- [ ] Backend: `mvnw test` xanh. Frontend: `npm run lint && npm run build` sạch.
- [ ] Commit sạch, không còn file untracked liên quan admin.

---

## Phase 2 — Gate an toàn trước feature mới (P1, ~2–4 ngày)

### 2.1 Quyền riêng tư & auth
- [ ] `backend/src/main/java/com/chatapp/dto/response/UserResponse.java:17,91` — **bỏ `email`** khỏi DTO dùng chung (đang lộ email mọi user cho mọi user).
  - Tạo DTO admin riêng (vd `AdminUserResponse`) để `AdminPage.tsx` vẫn có email.
  - Rà `frontend/src/types/index.ts` + các chỗ dùng `email` phía FE.
- [ ] Rate limiting / lockout cho `/auth/login`, `/auth/register`, `/auth/refresh` (Bucket4j hoặc filter tự viết; per-IP + per-account).
- [ ] `RefreshTokenService.java:47-61` — rotation nguyên tử: conditional update (`WHERE revoked=false` + kiểm tra row count) hoặc `SELECT ... FOR UPDATE`.
- [ ] Phát hiện **replay** refresh token: khi token đã revoke bị dùng lại → revoke toàn bộ token của user đó + log cảnh báo.
- [ ] `RefreshTokenRepository` — thêm `clearAutomatically = true` cho `@Modifying` revoke (tránh entity stale).
- [ ] `MediaSessionCookieService.java:34` — không dùng raw refresh token làm cookie media; tạo token media ngắn hạn riêng.

### 2.2 Prod hardening
- [ ] `application.yml:9` — bỏ default `:dev` (fail-fast nếu thiếu `SPRING_PROFILES_ACTIVE`), hoặc đưa giá trị an toàn (cookie secure, không `ddl-auto: update`) vào base config.
- [ ] CSRF/Origin: `SecurityConfig.java:33` (csrf disabled) + prod `SameSite=None` (`application-prod.yml:16-17`) → thêm check Origin/Referer cho `/auth/refresh` + `/auth/logout` (hoặc CSRF token cho 2 endpoint này).
- [ ] `CorsConfig.java:31-35` + `WebSocketConfig.java:43-48` — validate lúc startup: từ chối `*`/pattern rộng khi credentials bật; prod không nhận origin localhost.
- [ ] `JwtService.java:65-71` + `backend/.env.example:13` — chặn placeholder secret, enforce Base64 ≥ 32 bytes, log rõ lỗi cấu hình.

### 2.3 Dependencies & WS
- [ ] `pom.xml:11` — bump Spring Boot 3.2.0 → bản mới nhất 3.2.x/3.3.x; jjwt ≥ 0.12.5 (đã fix DoS khi parse token). Chạy lại full test sau khi bump.
- [ ] `ChatWebSocketController.java:172-191` — thêm `@MessageExceptionHandler` map `AppException`/validation → ERROR frame cho client; log các `AppException` bị nuốt ở call signaling.
- [ ] `JwtAuthenticationFilter.java:52-67` — bắt `AuthenticationException` → 401 (hiện user bị xoá gây 500).

### 2.4 CI (chặn regression vĩnh viễn)
- [ ] Tạo `.github/workflows/ci.yml`: `backend/mvnw test` + `frontend: npm test`, `npm run lint`, `npm run build` trên mỗi PR/push.
- [ ] (Tùy chọn) thêm `npm run test:coverage` với ngưỡng tối thiểu.

### Gate Definition of Done (Phase 2)
- [ ] CI xanh trên repo.
- [ ] Không còn `email` trong response cho user thường (kiểm tra bằng test hoặc curl).
- [ ] Rate limiting hoạt động (test thử 20 lần login sai liên tiếp).
- [ ] Rotation/replay refresh token đã có test.
- [ ] Prod checklist: `SPRING_PROFILES_ACTIVE=prod` fail-fast nếu thiếu; cookie/CSRF/CORS đúng.

---

## Phase 3 — Refactor ROI cao (P2, làm dần song song, ~3–5 ngày)

### 3.1 Backend hiệu năng
- [ ] **N+1 khi hydrate message page**: `MessageResponse.java:49-88` + `MessageRepository.java:45-67,187-188` — batch-load attachments/reactions/hiddenBy/reply/mentions theo page (IN query hoặc `@EntityGraph`).
- [ ] Tắt `spring.jpa.open-in-view` (chưa set ở đâu) sau khi sửa 3.1 — tránh che N+1 và giữ session quá lâu.
- [ ] `UserRepository.searchUsers:33-35` — thêm LIMIT/phân trang; resolve friendship theo lô (hiện N+1 per user).
- [ ] `MessageRepository.java:271-280` — giới hạn `findPrivateConversationPartnerIds`.
- [ ] `ChatRoomController.java:313-334` — fan-out participant N+1 → batch query; bắt lỗi non-`AppException` đàng hoàng.
- [ ] `MediaAccessService.java:21-29` — chuyển filesystem check ra ngoài transaction.
- [ ] (Tùy chọn) pg_trgm index cho `LIKE '%…%'` trong `MessageRepository`/`UserRepository`.

### 3.2 Frontend hiệu năng & ổn định
- [ ] `MessageItem.tsx:34` — bọc `React.memo`; ổn định props/handler (`ChatPage.tsx:2267` đang tạo object inline mỗi render; `getNextOptimisticMessageId` đưa vào `useCallback`).
- [ ] `App.tsx:11-29` — thêm **ErrorBoundary** cấp cao (reload + fallback UI); `AuthLoading` hiển thị spinner thay vì `null`.
- [ ] `ChatPage.tsx:552-568` — debounce ghi IndexedDB (300–500ms) + ghi tăng dần thay vì serialize cả mảng mỗi state change.
- [ ] `dbService.ts:35-45` — `onupgradeneeded` chỉ xoá store khi `oldVersion` cũ (v1→v2); các version sau **không xoá**, đặc biệt `pendingQueue`.
- [ ] `dbService.ts:59-77` — báo lỗi DB lên UI/log trung tâm thay vì nuốt vào fallback.
- [ ] `websocket.ts:130` — reconnect exponential backoff + jitter, tạm dừng khi `!navigator.onLine`.
- [ ] `renderUtils.tsx:126-163` — validate scheme `http(s)` cho `preview.url` + `preview.imageUrl` trước khi render.
- [ ] `useIncomingMessageHandler.ts:101-127` — không reset `unreadCount` khi message vào pending-unread queue.
- [ ] `InviteJoinPage.tsx:64` — đọc `redirect_after_login` sau login (hoặc dùng `?next=`) để deep-link invite hoạt động.

### 3.3 Frontend hygiene
- [ ] Xoá/gỡ dead code: `VirtualizedMessageList.tsx` (không ai import) hoặc sửa đo lường + đưa vào dùng thật.
- [ ] `useGroupAvatar.ts:27` — `URL.revokeObjectURL` cho previewUrl.
- [ ] `websocket.ts:143` — bỏ/gate console log production.
- [ ] `ChatDialogLayer.tsx:121-150` — focus trap + restore cho các modal.

---

## Phase 4 — Nợ kỹ thuật dài hạn (P3, không chặn feature)

- [ ] Tách `ChatPage.tsx` (~2568 dòng) thành container + slices (tiếp tục hướng "mini module" đã bắt đầu).
- [ ] Virtualize `MessageList` cho hội thoại dài.
- [ ] Bật `strict` TypeScript từng bước (`frontend/tsconfig.app.json` chưa có `strict`).
- [ ] Bổ sung test cho: `services/api.ts` (401→refresh), `AuthContext`, `services/websocket.ts`, `dbService`, auth backend (login/refresh/logout, disabled account, JWT expired/tampered, 403 `/admin/**`).
- [ ] Migration idempotent (`IF NOT EXISTS`) hoặc quy trình baseline rõ ràng cho DB cũ trước prod.
- [ ] Admin **audit log** (ai đổi role/status của ai, khi nào).
- [ ] Quota upload theo user + dọn file mồ côi (`MediaController.java:28-31`).
- [ ] `LocalAvatarStorageService.java:38-58` — magic-byte (Tika) validation như media; giữ `nosniff` chặt.
- [ ] `GeminiGroupSummaryService.java:93` — API key qua header; `MessageRepository.java:372-387` — lọc `clearedAt` trong query summary.
- [ ] STOMP notifications ra khỏi transaction (`UserBlockService.java:96`, `AdminAccountService.java:85-89`, `CallSessionMaintenanceService.java:49-59`) → after-commit event.
- [ ] Race call: partial unique index cho active call (`CallSessionService.java:64-79`).
- [ ] `ChatRoomService.java:287-289` — `leaveGroup` dùng chung guard `MIN_GROUP_MEMBERS=3` với `removeMember`.
- [ ] Quyền quản lý phòng: `getInviteLink` (311-326) + `pinRoomMessage` cần check admin/owner; `updateMemberNickname` không cho sửa người rank cao hơn.
- [ ] `MessageService.java:56-60` — chỉ replay khi đúng vi phạm unique `uk_messages_sender_client`; `MessageService.java:55,106` — link preview sau bước authorization.
- [ ] Presence: `/topic/presence` chỉ cho friends/co-participants (`WebSocketAuthChannelInterceptor.java:29`).
- [ ] `ApiExceptionHandler.java:41-60` — không echo nguyên văn reason/request-id.
- [ ] Xoá dead code: `ErrorCode.GROUP_REQUIRES_PARTICIPANTS`, `JwtService.generateToken`, `ChatRoom.getParticipants()`, `RoomType.PRIVATE`.
- [ ] Sửa README: xoá/khôi phục tham chiếu `PHASE1_SECURITY.md` + `scripts/run-phase1-smoke.ps1`.
- [ ] `PostgresSchemaMaintenance` — chỉ chạy non-prod (đang tự self-heal schema ngoài Flyway ở default profile).
- [ ] Cloudinary: khi bật public uploads → pin `public_id`/format/size, quota per-user, chặn HTML/SVG (`CloudinarySignatureService.java:38-56`, mặc định đang tắt).
- [ ] Thêm user vào nhóm không cần consent: `ChatRoomService.java:64-66,168-170` — quyết định product (invite/accept) hoặc tối thiểu check friendship/block + rate limit.
- [ ] Link preview executor 4 thread dễ bị saturate — thêm timeout chặt hơn/circuit breaker hoặc chuyển async hoàn toàn (`LinkPreviewService.java:64-75,113-198`).
- [ ] `editMessage` TOCTOU: gộp check quyền + edit vào cùng một transaction (`MessageService.java:242-246`).
- [ ] Lọc `cleared` trong query thay vì post-filter để pagination đúng (`MessageQueryService.java:300-307`).
- [ ] Media đã thu hồi: trả "gone" (404) thay vì 403 gây khó hiểu (`MediaAccessService.java:26`).
- [ ] Test với PostgreSQL thật (Testcontainers) cho Flyway + `ddl-auto=validate`; đồng bộ style PK `BIGSERIAL` ở `V4__user_blocks.sql:2` → identity như các bảng khác.
- [ ] WS: cache principal theo session thay vì reload `UserDetails` mỗi frame (`WebSocketAuthChannelInterceptor.java:48`); force-disconnect session khi user bị disable (`WebSocketAccountStatusInterceptor.java:20-29` — hiện vô dụng với broadcast).
- [ ] Vặt: xoá biến chết `mediaPayload` (`useMessageSending.ts:79`); validate độ dài `fullName` theo cột DB (`UserService.java:113-116`); xoá null-check chết `findSetting` (`ChatRoomService.java:545-549`); thêm setup vitest (jest-dom, coverage) + rules oxlint (`react-hooks/exhaustive-deps`); thay vài `any`/non-null assertion phía FE.
- [ ] Rotate JWT secret + mật khẩu DB trong `backend/.env` nếu thư mục từng bị chia sẻ ngoài git (file đã gitignore, không nằm trong history).

---

## Checklist khi bắt đầu feature mới (sau Gate)

- [ ] Phase 1 + Phase 2 đã xong, CI xanh.
- [ ] Feature spec đã rõ acceptance criteria.
- [ ] Nếu feature chạm DB → viết migration Flyway mới (số tiếp theo), cập nhật entity khớp 100%.
- [ ] Nếu feature chạm auth/media/WS → rà checklist bảo mật tương ứng + thêm test (tham chiếu bộ test media/STOMP sẵn có).
- [ ] Thêm test cho logic mới (unit tối thiểu; integration nếu chạm DB/security).
- [ ] Cập nhật README/.env.example nếu có config mới.
- [ ] PR nhỏ, một chủ đề/một commit rõ ràng.

---

## Lệnh kiểm tra nhanh

```powershell
# Backend
cd backend; .\mvnw.cmd test

# Frontend
cd frontend; npm run lint; npm run build; npm test
```
