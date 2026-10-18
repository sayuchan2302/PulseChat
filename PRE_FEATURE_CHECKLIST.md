# PulseChat — Checklist trước khi thêm feature mới

> Nguồn: đợt full code review (backend logic, backend security, frontend, tests/config) ngày 2026-10-16/17.
> Quy tắc: **hoàn tất Phase 1 + Phase 2 (Gate) trước khi bắt đầu feature mới.** Nếu feature gấp không thể chờ, tối thiểu phải xong Phase 1.
> Phạm vi: toàn bộ fix + hardening từ đợt review — **không bao gồm roadmap feature mới** (chọn sau khi qua Gate).
> Trạng thái: **Phase 1 + Phase 2 hoàn tất (2026-10-18)** — CI file đã có (⏳ chờ push lần đầu), bỏ email, rotation/replay + media token, filter 401, rate limiting, prod hardening, WS error handler (+fix whitelist message-hides), bump Spring Boot 3.5.16 + jjwt 0.12.7; backend **209/209** xanh. Tiếp theo: push để CI chạy, sau đó có thể bắt đầu feature mới (Phase 3 làm dần).

---

## Tiến độ thực thi (cập nhật: 2026-10-18)

- [x] **1.1 Commit admin + V5** — commit `e694394` (33 files, +853/−10). Verify trước commit: backend `mvnw compile` ✅, frontend `npm run build` ✅.
- [x] **1.2 Fix test đỏ** — commit `283d29e`. Phát hiện **2 nguyên nhân**: (a) assert cứng `4` → giờ đếm động số file `.sql` từ classpath; (b) `V5` dùng multi-column `ALTER TABLE` (PostgreSQL chấp nhận, H2 của test thì không) → đã tách thành 2 câu lệnh + thêm assert cột `ACCOUNT_ROLE`/`ENABLED`. Kết quả: `-Dtest=ProductionSchemaMigrationTest` ✅ (applied 5 migrations).
- [x] **1.3 Fix `AdminRoleBootstrap`** — commit `f19bb91`. Giờ chỉ promote khi **chưa có admin enabled nào** (không hoàn tác ban/demote nữa) và không bao giờ đổi `enabled`. Thêm `existsByAccountRoleAndEnabledTrue` + 6 unit test mới: ✅ `AdminRoleBootstrapTest` 6/6 + migration test 1/1 (BUILD SUCCESS).
- [x] **1.4 Fix 2 bug FE** — commit `679f7e5`. (a) `finishCall`: timer giờ lưu trong ref, clear khi gọi lại/unmount, và chỉ xoá `activeCall` nếu vẫn còn `status === 'ending'` (không "nuốt" cuộc gọi mới trong 1.5s); (b) seen-by: xoá id khỏi `roomSeenByLoadedMessageIdsRef` khi phát hiện đã đổi phòng → lần sau tự load lại. Thêm regression test `useMessageHistory.test.tsx` (2 cases: release marker + retry). Verify: `npm test` ✅ 15/15 (6 files), `npm run lint` ✅ 0 error, `npm run build` ✅.
- [x] **1.5 Verify cuối phase** — Backend `mvnw test` ✅ **171/171, BUILD SUCCESS**; frontend ✅ 15/15 test + lint (0 error) + build.

**Phát sinh trong Phase 1 (đã xử lý):**
- [x] Full suite lộ thêm **28 failures ở `WebSocketAuthChannelInterceptorTest`** — tồn tại từ feature admin: interceptor giờ check account mỗi frame và `setUser(...)`, nhưng test cũ chưa stub `loadUserByUsername` (NPE) và tạo accessor frozen (IllegalStateException). Đã đồng bộ test (stub user enabled, `setLeaveMutable(true)`) + thêm case tài khoản bị disable không gửi được frame — commit `8fbbc6d`.

**Phase 2 — Gate an toàn (hoàn tất 2026-10-18):**

- [x] **2.4 CI** — commit `80d3194`: `.github/workflows/ci.yml` chạy backend (`./mvnw -B test`, Java 17) + frontend (`npm ci` → `test` → `lint` → `build`, Node 24) trên push `main`/PR; kèm fix exec bit `mvnw` (100644 → 100755, runner Linux cần). ⏳ CI chưa chạy thực tế vì chưa push.
- [x] **2.1a Bỏ email khỏi `UserResponse`** — commit `560f36c`: record không còn `email`; admin vẫn có email qua `AdminAccountResponse` (DTO riêng đã tồn tại sẵn); gỡ 4 chỗ FE (`types/index.ts` type `User`, `messageUtils.ts`, `ChatPage.tsx`, `BlockedUsersModal.test.tsx`). Verify: backend 171/171 ✅ + FE 15/15 ✅.
- [x] **2.1b Rotation nguyên tử + replay detection** — commit `951a040`: `consumeToken` dùng `findByTokenHashForUpdate` (`PESSIMISTIC_WRITE` row lock) → 2 request đồng thời cùng refresh token chỉ 1 thắng; token đã revoke bị dùng lại → **revoke toàn bộ session active của user** + log warn, chạy `REQUIRES_NEW` để sống sót rollback của request lỗi; phân biệt rõ token expired vs revoked vs user bị disable; `revokeAllActiveByUserId` thêm `flushAutomatically + clearAutomatically` (đã rà `AdminAccountService` gọi trước `save(user)` → an toàn).
- [x] **2.1c Media cookie không còn là refresh token** — commit `951a040`: cookie `chat_media_session` giờ mang JWT riêng (`token_use=media`, TTL 24h qua `JWT_MEDIA_EXPIRATION`) thay vì raw refresh token; `JwtService` tách `extractUsername` (chỉ access) / `extractMediaUsername` (chỉ media) nên 2 loại token **không thể dùng thay thế nhau**; filter media bỏ truy vấn DB mỗi request (nhanh hơn), vẫn chặn user disable/delete qua `loadUserByUsername`.
- [x] **2.3a Filter 401 thay vì 500 cho user bị xoá** — commit `951a040`: `JwtAuthenticationFilter` bắt `AuthenticationException` ở cả 2 nhánh (bearer + media cookie); thêm regression test (`deletedAccountWithBearerTokenIsRejectedWithUnauthorizedInsteadOfServerError`).
- [x] **Verify batch 1** — backend **181/181, BUILD SUCCESS** (+10 test: `JwtServiceTest` 1→4, `RefreshTokenServiceTest` 1→6, `LocalMediaHttpSecurityTest` 6→8).
- [x] **2.1d Rate limiting auth** — commit `72fbc3d`: `RateLimitService` in-memory fixed-window (`app.rate-limit.*`, mặc định window 15 phút / login 10 / register 10 / refresh 60); login giới hạn **per-IP + per-account** (đăng nhập thành công xoá bucket account), register/refresh per-IP; vi phạm → `ErrorCode.TOO_MANY_REQUESTS` (AUTH_005, HTTP 429) nhất quán qua `ApiExceptionHandler`; refresh bị 429 **không** xoá cookie session. Đơn giản, ghi chú rõ giới hạn single-instance trong javadoc. 9 test mới (`RateLimitServiceTest` 5 + `AuthControllerTest` +3, gồm case 429 không clear cookie).
- [x] **Verify batch 2** — backend **189/189, BUILD SUCCESS** (+8 test: `RateLimitServiceTest` 5 + `AuthControllerTest` 4→7).
- [x] **2.2 Prod hardening** — commit `84a435d`: `ProdProfileGuard` (BeanFactoryPostProcessor chặn khởi động khi DB không phải local mà thiếu profile `prod` — chạy trước cả Hibernate/Flyway); `CorsConfig` validate lúc startup (không cho `*` khi credentials bật; prod không nhận origin localhost — `ProductionSchemaValidationTest` đổi sang origin prod); `JwtService` validate secret (`@PostConstruct`: chặn placeholder + yêu cầu ≥32 byte) + `.env.example` ghi rõ hướng dẫn; `AuthOriginCheckFilter` kiểm tra Origin/Referer cho `/auth/refresh` + `/auth/logout` (an toàn CSRF dù prod dùng SameSite=None; client không trình duyệt không gửi header thì đi qua). `application-prod.yml` giữ nguyên vì đã đúng. Verify: backend **204/204** BUILD SUCCESS (+15 test).
- [x] **2.3b WS error handler + fix whitelist** — commit `468681c`: `@MessageExceptionHandler` cho `AppException` + `MethodArgumentNotValidException` → gửi `RealtimeErrorResponse` tới `/user/queue/errors` (FE đã subscribe + log); **fix bug thật**: `/user/queue/message-hides` thiếu trong whitelist SUBSCRIBE → subscribe của FE bị AccessDenied (ERROR frame); đã thêm kèm test. Verify: backend **209/209** (+5 test: controller 2→5, interceptor +2 case), FE 15/15 ✅, lint ✅, build ✅.
- [x] **2.3c Bump dependencies** — commit `1f8548e`: Spring Boot 3.2.0 → **3.5.16** (3.x mới nhất), jjwt 0.12.3 → **0.12.7** (gom qua property `jjwt.version`); xác nhận bằng `help:evaluate` + `dependency:tree`. Kết quả: backend **209/209 BUILD SUCCESS**, không phải sửa gì thêm; FE không đổi (15/15 + lint + build đã chạy trước đó).

---

## Trạng thái hiện tại (để ghi nhớ)

- [x] ~~33 file admin feature chưa commit, `V5__account_roles_and_status.sql` untracked~~ → đã commit `e694394` (2026-10-18), trước đó verify compile backend + build FE.
- [x] ~~`ProductionSchemaMigrationTest` đỏ~~ → đã fix `283d29e` (đếm migration động từ classpath + V5 tách câu lệnh chạy được trên H2). Phát hiện thêm: `V5` gốc không chạy được trên H2.
- [x] ~~Chưa có CI (`.github/` không tồn tại)~~ → đã thêm `.github/workflows/ci.yml` (commit `80d3194`); sẽ chạy lần đầu khi push lên GitHub.
- [x] Spring Boot 3.2.0 trong `pom.xml:11` (thiếu nhiều bản vá CVE) → đã bump **3.5.16** (3.x mới nhất) + jjwt 0.12.7 — commit `1f8548e`.
- [x] ~~README trỏ tới `PHASE1_SECURITY.md` và `scripts/run-phase1-smoke.ps1` **không tồn tại**~~ → đã sửa trong Phase 4 (item 158).

---

## Phase 1 — Bắt buộc ngay (P0, ~0.5–1 ngày)

### 1.1 Chốt an toàn feature admin đang dở
- [x] Commit trọn gói: admin feature + `backend/src/main/resources/db/migration/V5__account_roles_and_status.sql` **cùng một commit** (tách rời sẽ vỡ `ddl-auto=validate` ở prod) — commit `e694394`.
- [x] Kiểm tra `git status` sạch sau commit, xác nhận V5 đã được track (`git ls-files | findstr V5`) — đã xác nhận.

### 1.2 Fix backend test đỏ
- [x] `backend/src/test/java/com/chatapp/config/ProductionSchemaMigrationTest.java:25` — `assertEquals(4, ...)` → nên assert **động theo số file migration** (đếm `db/migration/*.sql`) thay vì hardcode — commit `283d29e`.
- [x] Chạy `cd backend; .\mvnw.cmd test` — toàn bộ suite phải xanh (đã xanh, hiện tại 209/209).

### 1.3 Fix admin bootstrap (an ninh, đã xác minh)
- [x] `backend/src/main/java/com/chatapp/config/AdminRoleBootstrap.java:30-35` — commit `f19bb91`:
  - Không `setEnabled(true)` mỗi lần khởi động (đang âm thầm gỡ ban).
  - Chỉ promote khi user đang là `USER` và `enabled`; không hạ cấp/đổi trạng thái ngược lại.
  - Cân nhắc gate bằng flag riêng (`app.admin.bootstrap-enabled`) hoặc profile.

### 1.4 Fix 2 bug frontend rõ ràng (đã xác minh)
- [x] `frontend/src/hooks/useCallFeature.ts:347-361` — timer 1.5s trong `finishCall` không được lưu id → có thể xoá state của **cuộc gọi mới** vừa bắt đầu. Lưu id vào ref + clear trong `finishCall`/khi bắt đầu call/unmount — commit `679f7e5`.
- [x] `frontend/src/hooks/useMessageHistory.ts:39-64` — id message được đánh dấu "đã load seen-by" trước khi gọi API; khi đổi phòng giữa chừng (return ở dòng 48) id không bị xoá → seen-by mất vĩnh viễn đến khi reload. Xoá id khi `selectedRoomIdRef.current !== roomId` — commit `679f7e5` (+ regression test).

### 1.5 Xác nhận sau Phase 1
- [x] Backend: `mvnw test` xanh. Frontend: `npm run lint && npm run build` sạch.
- [x] Commit sạch, không còn file untracked liên quan admin.

---

## Phase 2 — Gate an toàn trước feature mới (P1, ~2–4 ngày)

### 2.1 Quyền riêng tư & auth
- [x] `backend/src/main/java/com/chatapp/dto/response/UserResponse.java:17,91` — **bỏ `email`** khỏi DTO dùng chung (đang lộ email mọi user cho mọi user) — commit `560f36c`.
  - ✅ DTO admin riêng đã có sẵn: `AdminAccountResponse` (giữ email) — `AdminPage.tsx` dùng DTO này nên không ảnh hưởng.
  - ✅ Rà FE xong: gỡ `email` khỏi type `User` (`types/index.ts`), `messageUtils.ts`, `ChatPage.tsx`, `BlockedUsersModal.test.tsx`.
- [x] Rate limiting / lockout cho `/auth/login`, `/auth/register`, `/auth/refresh` (in-memory filter tự viết; per-IP + per-account) — commit `72fbc3d`.
- [x] `RefreshTokenService.java:47-61` — rotation nguyên tử: dùng `findByTokenHashForUpdate` (`PESSIMISTIC_WRITE` row lock) — request thứ hai với cùng token sẽ thấy `revokedAt` ≠ null và bị coi là replay — commit `951a040`.
- [x] Phát hiện **replay** refresh token: token đã revoke bị dùng lại → revoke toàn bộ token active của user + log cảnh báo; wrap trong transaction `REQUIRES_NEW` để không bị rollback cùng exception — commit `951a040`.
- [x] `RefreshTokenRepository` — thêm `flushAutomatically = true, clearAutomatically = true` cho `@Modifying` revoke (tránh entity stale) — commit `951a040`.
- [x] `MediaSessionCookieService.java:34` — không dùng raw refresh token làm cookie media; cookie giờ mang JWT riêng `token_use=media` (TTL 24h) — commit `951a040`.

### 2.2 Prod hardening
- [x] `application.yml:9` — xử lý bằng `ProdProfileGuard` (commit `84a435d`): giữ default `:dev` cho DX nhưng **chặn khởi động** khi DB không phải local mà thiếu profile `prod` (chạy trước cả Hibernate/Flyway).
- [x] CSRF/Origin: `SecurityConfig.java:33` (csrf disabled) + prod `SameSite=None` (`application-prod.yml:16-17`) → `AuthOriginCheckFilter` (commit `84a435d`) kiểm tra Origin/Referer cho `/auth/refresh` + `/auth/logout`.
- [x] `CorsConfig.java:31-35` + `WebSocketConfig.java:43-48` — validate lúc startup: từ chối `*` khi credentials bật; prod không nhận origin localhost (WS dùng chung property `cors.allowed-origins` nên được cover) — commit `84a435d`.
- [x] `JwtService.java:65-71` + `backend/.env.example:13` — chặn placeholder secret + enforce ≥32 bytes qua `@PostConstruct validateConfiguration`; `.env.example` ghi hướng dẫn `openssl rand -base64 48` — commit `84a435d`.

### 2.3 Dependencies & WS
- [x] `pom.xml:11` — bump Spring Boot 3.2.0 → **3.5.16** (3.x mới nhất); jjwt 0.12.3 → **0.12.7** (qua property `jjwt.version`). Full test sau khi bump: **209/209 BUILD SUCCESS** — commit `1f8548e`.
- [x] `ChatWebSocketController.java:172-191` — thêm `@MessageExceptionHandler` map `AppException`/validation → ERROR frame cho client; log các `AppException` bị nuốt ở call signaling — commit `468681c`. Ghi chú: call signaling đã có log sẵn; phần bổ sung là error frames chung (`/user/queue/errors`) + fix whitelist `/user/queue/message-hides`.
- [x] `JwtAuthenticationFilter.java:52-67` — bắt `AuthenticationException` → 401 (user bị xoá không còn gây 500); thêm regression test — commit `951a040`.

### 2.4 CI (chặn regression vĩnh viễn)
- [x] Tạo `.github/workflows/ci.yml`: backend `./mvnw -B test` (Java 17 temurin) + frontend `npm ci`/`test`/`lint`/`build` (Node 24) trên push `main`/PR; kèm fix exec bit `mvnw` — commit `80d3194`. ⏳ Chưa chạy thực tế trên GitHub (chưa push).
- [ ] (Tùy chọn) thêm `npm run test:coverage` với ngưỡng tối thiểu.

### Gate Definition of Done (Phase 2)
- [ ] CI xanh trên repo. (⏳ chờ push lần đầu)
- [x] Không còn `email` trong response cho user thường (`UserResponse` không còn field; verify qua test + grep toàn bộ `backend/src`).
- [x] Rate limiting hoạt động (test thử 20 lần login sai liên tiếp). (`RateLimitServiceTest` + `AuthControllerTest`: lần thứ 4 với limit 3 bị chặn → 429; có test cross-IP.)
- [x] Rotation/replay refresh token đã có test (6 case `RefreshTokenServiceTest`: lock lookup, replay family-revoke, expired, disabled, unknown).
- [x] Prod checklist: `SPRING_PROFILES_ACTIVE=prod` fail-fast nếu thiếu (guard chặn DB remote không có prod); cookie/CSRF/CORS/JWT-secret đã validate đủ (commit `84a435d`).

---

## Phase 3 — Refactor ROI cao (P2, làm dần song song, ~3–5 ngày)

### 3.1 Backend hiệu năng
- [x] **N+1 khi hydrate message page**: `MessageResponse.java:49-88` + `MessageRepository.java:45-67,187-188` — đã thêm `@BatchSize(50)` cho `Message` (class + `reactions`/`mentions`/`hiddenByUsers`), `ChatRoom` (class + `members`), `User`, `CallSession` → batch-fetch dạng IN theo page. Test chống hồi quy `MessageHydrationQueryCountTest`: hydrate 20 tin nhắn room kèm reply/reaction/mention chỉ tốn **5 query** (trước ~60). Lưu ý: media là cột inline trên `Message`, không có bảng attachments riêng.
- [x] Tắt `spring.jpa.open-in-view` (`application.yml:18`) sau khi sửa 3.1 — full suite 210/210 pass, không call site nào vỡ lazy.
- [x] Search users — thêm LIMIT 50 (`UserRepository` đổi sang `Pageable`, áp ở `UserService.listOtherUsers` + `FriendshipService.searchUsers`); resolve friendship theo lô 1 query (`findBetweenUserAndOtherUsers`) thay vì N+1.
- [x] Giới hạn danh sách partner private: tách 2 query `findLatestSentActivityByReceiver`/`findLatestReceivedActivityBySender` (group by 1 cột — chạy được cả H2 lẫn Postgres; CASE tham số trong GROUP BY bị H2 từ chối), merge + sort theo độ mới + cap 200 trong `FriendshipService`.
- [x] `ChatRoomController` fan-out: thêm `ChatRoomService.getGroupNotificationViews` batch room/settings/unread/latest theo lô; `AppException` lẫn `RuntimeException` đều fallback payload chung kèm log warn thay vì nổ giữa vòng lặp.
- [x] `MediaAccessService.requireAccess`: bỏ `@Transactional` — filesystem marker check chạy ngoài transaction, 2 count query tự có read-only tx riêng.
- [ ] (Tùy chọn) pg_trgm index cho `LIKE '%…%'` trong `MessageRepository`/`UserRepository`.

### 3.2 Frontend hiệu năng & ổn định
- [x] `MessageItem.tsx` — bọc `React.memo` (`MessageItemComponent` giữ nguyên named + default export); ổn định toàn bộ props: `messageListItems` + 5 render fn (`renderMessageReactions`/`...Actions`/`...CallMessageBody`/`...MessageBody`/`...GroupSeenBy`) + `handleOpenReactionSummary` chuyển sang `useMemo`/`useCallback` (deps dựa trên các handler `useCallback` sẵn có từ hooks); object `messageListProps` gom `useMemo` thay vì tạo inline mỗi render; `getNextOptimisticMessageId` → `useCallback`. → memo có tác dụng thật (gõ input không còn re-render từng `MessageItem`).
- [x] `App.tsx:11-29` — thêm **ErrorBoundary** cấp cao (`AppErrorBoundary`: fallback + reload) bọc toàn bộ `BrowserRouter`; `AuthLoading` hiển thị spinner (CSS `.app-auth-*`, `.app-error-boundary` trong `App.css`).
- [x] `ChatPage.tsx` — debounce ghi IndexedDB 400ms (`CACHE_WRITE_DEBOUNCE_MS`) cho cả conversations cache lẫn messages cache; kèm trần `cacheWriteDelay` (không để quá 400ms kể từ lần ghi trước → stream tin nhắn liên tục không "đói" timer), hủy timer khi effect re-run/unmount. Vẫn ghi cả mảng mỗi lần thay vì ghi tăng dần theo id — ghi tăng dần sẽ bỏ sót nội dung message bị edit/recall/reaction (id không đổi nhưng content đổi), làm cache cũ. `saveMessagesCache` với mảng rỗng là no-op nên nhịp chuyển hội thoại vẫn an toàn.
- [x] `dbService.ts:35-45` — `onupgradeneeded` chỉ xoá store khi `oldVersion < 2` (v1→v2); các version sau **không xoá**; thêm `request.onblocked` reject để không treo promise khi tab khác đang giữ DB.
- [x] `dbService.ts:59-77` — `run()` log `console.warn` (tên store + mode) khi IndexedDB thất bại thay vì nuốt im lặng; fallback giữ nguyên.
- [x] `websocket.ts:130` — reconnect exponential backoff (1s→30s, reset khi connect thành công) + jitter 50–100%; khi `!navigator.onLine` giãn delay tối đa để tạm dừng dò mạng.
- [x] `renderUtils.tsx:126-163` — thêm `isSafeHttpUrl`; `preview.url` chỉ render khi scheme `http(s)`; `imageUrl` cho phép `http(s)` hoặc path nội bộ bắt đầu bằng `/`.
- [x] `useIncomingMessageHandler.ts:101-127` — chỉ reset `unreadCount` khi mark-read thật (`canMarkActiveIncomingAsRead`/tin của chính mình); message vào pending-unread queue giữ nguyên count.
- [x] `InviteJoinPage.tsx:64` — `AuthPage` đọc `redirect_after_login` sau login (chỉ nhận path bắt đầu `/`, xoá key sau khi dùng) → deep-link invite hoạt động.

### 3.3 Frontend hygiene
- [x] Xoá dead code: `VirtualizedMessageList.tsx` (không ai import — đã `git rm`).
- [x] `useGroupAvatar.ts:27` — capture `previewUrl` và `URL.revokeObjectURL` trong `finally`.
- [x] `websocket.ts:143` — console log `Connected to WebSocket` chỉ còn ở DEV (`import.meta.env.DEV`).
- [x] `ChatDialogLayer.tsx` — hook mới `hooks/useFocusTrap.ts`: focus phần tử đầu khi mở, Tab/Shift+Tab wrap trong dialog, restore focus khi đóng, nhường focus nếu có dialog khác xếp trên. Áp cho media viewer, delete conversation, forward picker, invite modal. Kèm 4 unit test (`useFocusTrap.test.tsx`) → FE vitest **19/19**, lint 0 cảnh báo mới, build OK.

---

## Phase 4 — Nợ kỹ thuật dài hạn (P3, không chặn feature)

- [ ] Tách `ChatPage.tsx` (~2568 dòng) thành container + slices (tiếp tục hướng "mini module" đã bắt đầu).
- [ ] Virtualize `MessageList` cho hội thoại dài.
- [ ] Bật `strict` TypeScript từng bước (`frontend/tsconfig.app.json` chưa có `strict`).
- [ ] Bổ sung test cho: `services/api.ts` (401→refresh), `AuthContext`, `services/websocket.ts`, `dbService`, auth backend (login/refresh/logout, disabled account, JWT expired/tampered, 403 `/admin/**`).
- [ ] Migration idempotent (`IF NOT EXISTS`) hoặc quy trình baseline rõ ràng cho DB cũ trước prod.
- [ ] Admin **audit log** (ai đổi role/status của ai, khi nào).
- [ ] Quota upload theo user + dọn file mồ côi (`MediaController.java:28-31`).
- [x] `LocalAvatarStorageService` giờ validate **magic-byte bằng Tika** giống media: bytes phải khớp content-type khai báo (alias `image/jpg`→`image/jpeg`) — HTML/GIF đội lốt PNG/JPEG bị chặn trước khi ghi file; `UploadSecurityHeadersFilter` vẫn gắn `X-Content-Type-Options: nosniff` cho `/uploads/**`. Test mới: `LocalAvatarStorageServiceTest` (4 — chặn mismatch, chặn HTML, nhận PNG thật, nhận alias jpg).
- [x] Gemini: API key chuyển từ query param (`?key=`) sang **header `x-goog-api-key`** (test capture `HttpRequest` xác nhận key không còn trong URL). Query summary `findRecentSummarizableRoomMessages` lọc `clearedAt` **ngay trong JPQL** (subquery `ConversationSetting` theo username+room, cùng pattern query global search) — tin nhắn đã clear không còn lọt vào tóm tắt AI. Test H2 thật `RoomSummaryQueryTest` (2) chứng minh trên cả nhánh có/không clear marker.
- [x] STOMP ra khỏi transaction: thêm `AfterCommitExecutor` (đăng ký `TransactionSynchronization.afterCommit`, fallback chạy ngay khi không có tx) — 3 điểm gửi giờ defer: block → call cancel/end (`UserBlockService`), khoá tài khoản → presence offline (`AdminAccountService`), missed-call sweep → CALL_MISSED (`CallSessionMaintenanceService`). Test `AfterCommitExecutorTest` (2: chạy ngay khi không tx + chỉ chạy sau commit); `UserBlockServiceTest` xác nhận notify vẫn phát đúng payload.
- [x] Race call: chặn ở tầng DB thay vì tin pre-check — `CallSession` thêm `active_caller_key`/`active_receiver_key` (mirror caller/receiver khi RINGING/ACCEPTED, tự đồng bộ qua `@PrePersist/@PreUpdate`) + unique index `uk_call_sessions_active_caller/_receiver` (migration `V6__active_call_keys.sql`, portable cả Postgres lẫn H2 — partial index không chạy được trên H2). Khi insert thua race: controller bắt `DataIntegrityViolationException` (chỉ khi SQLState 23505 + đúng tên index), ghi BUSY trong tx mới (`recordBusyCall`) rồi notify caller như busy thường; lỗi integrity khác vẫn ném nguyên. Test: `CallSessionActiveCallKeyTest` (3, H2 thật), `CallSessionServiceTest` (+2), `ChatWebSocketControllerTest` (+1).
- [x] `ChatRoomService.java` — `leaveGroup` dùng chung guard `MIN_GROUP_MEMBERS=3` với `removeMember`: nhóm < 4 thành viên không thể rời (nhất quán bất biến "nhóm ≥ 3 người"; nhóm nhỏ chỉ có thể xoá bởi owner). Test `leaveGroupBlockedWhenGroupWouldDropBelowMinimumMembers` + cập nhật test cũ sang nhóm 4 người.
- [x] Quyền quản lý phòng: `getInviteLink` + `pinRoomMessage`/`unpinRoomMessage` giờ yêu cầu admin/owner (`validateGroupAdmin`); `updateMemberNickname` chặn sửa người rank cao hơn (moderator không sửa được owner/moderator khác — `CANNOT_EDIT_ADMIN` ROOM_013, moderator vẫn sửa được member). Phát hiện thêm lỗ rò: `ChatRoomResponse` trả `inviteCode` cho **mọi thành viên** (cả qua REST list lẫn WS fan-out) → giờ chỉ lộ cho owner/moderator (`ChatRoomResponse.isGroupAdmin`), che luôn ở payload WS. FE: ẩn nút Pin/Unpin với member thường trong nhóm (`canManagePinnedMessages` + `canPin` prop; `onUnpinMessage` optional).
- [x] `sendMessage`/`sendRoomMessage`: (1) thêm bước authorization fail-fast trong transaction riêng (sender/receiver, block, friendship, media, reply target — mirror pattern `editMessage`) **trước** khi resolve link preview → request không hợp lệ không còn kích hoạt HTTP outbound của server; write tx vẫn re-validate đầy đủ trước insert (test inOrder chứng minh thứ tự). (2) Replay sau race chỉ khi `DataIntegrityViolationException` có SQLState `23505` **và** message trỏ đúng unique index `uk_messages_sender_client` — FK/check/not-null vi phạm khác ném nguyên trạng. Test mới: `linkPreviewIsResolvedOnlyAfterAuthorization`, `sendMessageRejectsBlockedReceiverBeforeResolvingLinkPreview`, `sendMessageReplaysWhenTheSenderClientUniqueIndexLosesTheRace`, `sendMessageRethrowsIntegrityViolationsThatAreNotTheSenderClientIndex`.
- [x] Presence: bỏ broadcast `/topic/presence`; giờ fan-out qua `/user/queue/presence` chỉ tới bản thân + bạn bè (`ACCEPTED`, 2 query theo 2 chiều) + co-participants phòng — `PresenceService` mới (dùng bởi `WebSocketPresenceEventListener` + `AdminAccountService`), whitelist interceptor + subscription FE đổi theo. Test: `PresenceServiceTest` (dedupe, chặn username rỗng) + `PresenceRecipientQueryTest` (chạy thật 2 query mới trên H2).
- [x] `ApiExceptionHandler` không echo nguyên văn reason: `ResponseStatusException` giờ log reason phía server (warn) và trả message generic theo status (`Resource not found`/`Request failed`…); `ErrorResponseFactory.requestId` chỉ nhận `X-Request-ID` khi khớp `[A-Za-z0-9._-]{8,64}` (chặn header injection/log injection), còn lại tự sinh UUID. Test: `ApiExceptionHandlerTest` (2), `ErrorResponseFactoryTest` (3).
- [x] Xoá dead code: `ErrorCode.GROUP_REQUIRES_PARTICIPANTS`, `ChatRoom.getParticipants()` (+ import thừa `Set`/`LinkedHashSet`/`Collectors`), `RoomType.PRIVATE` (constraint `CHECK` trong V1 giữ nguyên — không sửa migration đã áp dụng), component FE `PinnedMessageBar.tsx` (kiểm tra lại: cũng không ai import). `JwtService.generateToken` **không xoá** — kiểm tra lại thì không chết (private helper đang dùng bởi `generateAccessToken`/`generateMediaToken`).
- [x] Sửa README: bỏ 2 tham chiếu chết (`PHASE1_SECURITY.md`, `scripts/run-phase1-smoke.ps1`), thay bằng mô tả đúng về media storage (local storage có kiểm tra quyền từng file, Cloudinary public mặc định tắt).
- [x] `PostgresSchemaMaintenance` giờ bỏ qua hoàn toàn khi profile `prod` active — guard code-level ngay đầu `onApplicationEvent` (cùng convention `ProdProfileGuard`), ngoài lớp bảo vệ sẵn có `app.schema.self-heal-message-type-check: false` trong `application-prod.yml`. Self-heal không thể chạy ngoài Flyway ở prod kể cả khi property bị bật nhầm. Test: `prodProfileSkipsSchemaSelfHealEvenWhenThePropertyIsEnabled` (verify không đụng `JdbcTemplate`/`DataSource`).
- [ ] Cloudinary: khi bật public uploads → pin `public_id`/format/size, quota per-user, chặn HTML/SVG (`CloudinarySignatureService.java:38-56`, mặc định đang tắt).
- [ ] Thêm user vào nhóm không cần consent: `ChatRoomService.java:64-66,168-170` — quyết định product (invite/accept) hoặc tối thiểu check friendship/block + rate limit.
- [ ] Link preview executor 4 thread dễ bị saturate — thêm timeout chặt hơn/circuit breaker hoặc chuyển async hoàn toàn (`LinkPreviewService.java:64-75,113-198`).
- [x] `editMessage` TOCTOU: kiểm tra lại thì **đã đúng sẵn** — transaction ghi (Tx2, dòng 249-260) re-fetch message + `validateMessageCanBeEdited` (sender/recalled/type) + edit + `saveAndFlush` trong **cùng một** transaction; Tx1 (242-246) chỉ là pre-check fail-fast để không gọi link-preview network cho request không hợp lệ. Thêm test hồi quy `editMessageRevalidatesInsideTheWriteTransaction` (message bị recall giữa pre-check và tx ghi → `MESSAGE_EDIT_NOT_ALLOWED`, không save) — khóa bất biến để refactor sau này không phá.
- [x] Lọc `cleared` chuyển hẳn vào JPQL: thêm param `clearedAt` + điều kiện `(:clearedAt is null or (m.timestamp is not null and m.timestamp > :clearedAt))` cho **12 query** (conversation/room page, media, link, search, before/after) — page budget & `hasMore` giờ tính trên đúng tập tin nhắn người dùng thấy; xoá hẳn helper post-filter `filterClearedMessages`. Test H2 mới `ClearedConversationQueryTest` (2 — page limit không bị cleared "ăn" slot, around-anchor) + các test H2 hiện có (LocalMediaAuthorization, MessageHydrationQueryCount) chạy thật query mới.
- [x] Media bị từ chối truy cập (thu hồi/hidden/không phải participant) giờ trả **404 `MEDIA_005` "Media not found"** thay vì 403 gây khó hiểu và lộ sự tồn tại của file (`MediaAccessService.requireAccess`). Cập nhật `MediaAccessServiceTest` + `LocalMediaHttpSecurityTest` theo hành vi mới.
- [ ] Test với PostgreSQL thật (Testcontainers) cho Flyway + `ddl-auto=validate`; đồng bộ style PK `BIGSERIAL` ở `V4__user_blocks.sql:2` → identity như các bảng khác.
- [ ] WS: cache principal theo session thay vì reload `UserDetails` mỗi frame (`WebSocketAuthChannelInterceptor.java:48`); force-disconnect session khi user bị disable (`WebSocketAccountStatusInterceptor.java:20-29` — hiện vô dụng với broadcast).
- [x] Vặt: xoá biến chết `mediaPayload` (`useMessageSending.ts` — media vẫn đi qua `attachment` của queue như trước); validate `fullName` ≤ 100 ký tự khớp cột `full_name` (lỗi `VALIDATION_FAILED`, có test); xoá null-check chết `findSetting` (`Optional` không bao giờ null); vitest: thêm `@testing-library/jest-dom` (dùng `toHaveFocus()` trong test focus trap) + coverage v8 (`npm run test:coverage`; `coverage/` đã vào `.gitignore`) + rule `react/exhaustive-deps: error` (sửa luôn warning cũ ở ChatPage bằng cách hoist `selectedUserId`/`selectedUserMessageRequest` ra ngoài effect); dọn `any`/`!` phía FE: util chung `getApiErrorMessage` (AuthPage, InviteJoinPage, AdminPage, useGroupMemberActions) + bỏ 5 non-null assertion bằng early-return narrowing.
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
