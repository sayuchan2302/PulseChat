# PulseChat — Kế hoạch kiểm thử ổn định (Stability Test Plan)

> **Mục tiêu**: xác nhận toàn bộ fix/hardening đã hoàn tất trong `PRE_FEATURE_CHECKLIST.md` (Phase 1–4 + item 160/161/169) vẫn hoạt động đúng và không hồi quy — chạy đủ trước khi bắt đầu feature mới.
> **Nguyên tắc**: chạy từ rẻ → đắt (T0 → T5). Tầng nào FAIL thì **dừng**, fix + commit + chạy lại từ tầng đó trước khi lên tầng tiếp theo.
> **Baseline**: commit `d404c41` — CI xanh, backend 300/300, FE 42/42 (xem [Nhật ký chạy](#nhật-ký-chạy) cuối file).

## Tổng quan các tầng

| Tầng | Nội dung | Hình thức | Thời gian | Điều kiện |
|---|---|---|---|---|
| **T0** | Bộ test tự động (BE + FE + coverage + lint + build) | tự động, ~3 lệnh | ~3 phút | không |
| **T1** | Schema & migration (H2 trong T0 + Postgres thật local) | tự động + 1 lệnh thủ công | ~5 phút | Postgres 18 local ✅ đang chạy |
| **T2** | Smoke API live trên stack thật (auth → chat → media → call) | script/thủ công | ~30 phút | Postgres + backend + FE dev |
| **T3** | UI manual checklist (từ các item FE Phase 3/4) | thủ công trên browser | ~20 phút | T2 đang chạy |
| **T4** | Bảo mật đối kháng (adversarial) | thủ công | ~15 phút | T2 đang chạy |
| **T5** | Hiệu năng & hồi quy query | bán tự động | ~10 phút | dữ liệu seed của T2 |

Điều kiện môi trường hiện tại: PostgreSQL 18 chạy tại `localhost:5432` (service `postgresql-x64-18`) + `backend/.env` đầy đủ creds; Docker **chưa có** → mục 166 (Testcontainers) và 118 (pg_trgm) vẫn treo, không thuộc phạm vi plan này.

---

## T0 — Bộ test tự động (Gate chính, chạy đầu tiên)

```powershell
# Backend — kỳ vọng "Tests run: 300, Failures: 0, Errors: 0" + BUILD SUCCESS
cd backend; .\mvnw.cmd -B test

# Frontend — kỳ vọng 42 test / 12 file
cd frontend; npm.cmd test
npm.cmd run test:coverage   # ngưỡng: statements 40 / branches 25 / functions 34 / lines 45
npm.cmd run lint; npm.cmd run build
```

**Gotchas (đã gặp, đừng mất thời gian lại)**:

- `.\mvnw.cmd` có thể in "Exited with code 1" như artifact — tin vào dòng `BUILD SUCCESS`.
- Dùng `npm.cmd` (không dùng `npm` vì `npm.ps1` bị chặn trên máy này).
- FE test import tường minh `describe/it/expect/vi` từ `vitest` và gọi `cleanup` của RTL.
- CI GitHub Actions chạy đúng bộ này trên mỗi push `main` — đối chiếu run mới nhất qua `https://api.github.com/repos/sayuchan2302/PulseChat/actions/runs`.

**Nếu số test giảm so với baseline (BE 300 / FE 42)** → có test bị xoá nhầm, phải điều tra trước khi tiếp tục.

### Map khu vực chức năng → test chủ chốt (khi fail, tìm ở đây)

| Khu vực | Test chính |
|---|---|
| Auth & session (rotation/replay/rate limit) | `AuthServiceTest`, `AuthControllerTest`, `JwtServiceTest`, `RefreshTokenServiceTest`, `RateLimitServiceTest` |
| Admin (bootstrap/audit/quyền) | `AdminRoleBootstrapTest`, `AdminAccountServiceTest`, `AdminAccessSecurityTest` |
| Friendship & block | `FriendshipServiceTest`, `UserBlockServiceTest`, `UserBlockQueryTest` |
| Phòng nhóm (consent, quyền, invite code) | `ChatRoomServiceTest`, `RoomNotificationQueryTest`, `ChatRoomResponseTest` |
| Tin nhắn (search/clear/hydrate) | `MessageServiceTest`, `MessageHydrationQueryCountTest`, `ClearedConversationQueryTest`, `RoomSummaryQueryTest`, `MessageResponseTest` |
| Media (local/avatar/quota/orphan/Cloudinary) | `LocalMediaStorageServiceTest`, `LocalAvatarStorageServiceTest`, `MediaAccessServiceTest`, `LocalMediaHttpSecurityTest`, `LocalMediaAuthorizationTest`, `MediaOrphanCleanupServiceTest`, `MediaUploadRepositoryTest`, `CloudinarySignatureServiceTest`, `UploadSecurityHeadersFilterTest` |
| Call (race/BUSY/missed) | `CallSessionServiceTest`, `CallSessionActiveCallKeyTest`, `ChatWebSocketControllerTest` |
| WS & presence | `WebSocketAuthChannelInterceptorTest`, `WebSocketSessionRegistryTest`, `PresenceServiceTest`, `PresenceRecipientQueryTest` |
| Link preview & AI | `LinkPreviewServiceTest`, `GeminiGroupSummaryServiceTest`, `PublicOnlyDnsResolverTest` |
| Hạ tầng/DB/API | `ProductionSchemaMigrationTest`, `ProductionSchemaValidationTest`, `PostgresSchemaMaintenanceTest`, `ProdProfileGuardTest`, `CorsConfigTest`, `AfterCommitExecutorTest`, `ApiExceptionHandlerTest`, `ErrorResponseFactoryTest` |
| **FE** — api/auth/ws/storage | `api.test.ts`, `AuthContext.test.tsx`, `websocket.test.ts`, `dbService.test.ts` |
| **FE** — hooks & components | `useMediaUpload.test.tsx`, `useMessageHistory.test.tsx`, `useMessageActions.test.tsx`, `useFocusTrap.test.tsx`, `useCallDeviceSwitching.test.tsx`, `useCallScreenSharing.test.tsx`, `GlobalMessageSearchModal.test.tsx`, `BlockedUsersModal.test.tsx` |

---

## T1 — Schema & migration

### T1-A (tự động — nằm sẵn trong T0)

- `ProductionSchemaMigrationTest`: đếm **động** số file migration và chạy Flyway V1→V9 trên DB rỗng (H2 chế độ PostgreSQL) — bắt lỗi SQL không portable.
- `ProductionSchemaValidationTest`: profile `prod` + Flyway (`baseline-on-migrate`, `ddl-auto=validate`) — bắt lệch giữa entity và schema.

### T1-B (Postgres thật local — làm được ngay, không cần Docker)

Mục đích: đóng **một phần** item 166 (Flyway + validate trên PostgreSQL thật) trước khi có Testcontainers.

```powershell
# 1) Tạo DB rỗng dành riêng cho kiểm thử migration (không đụng DB dev)
psql -U postgres -c "CREATE DATABASE chat_app_migration_test"

# 2) Chạy backend trỏ vào DB rỗng đó, bật Flyway + validate (override trên profile dev), cổng phụ
cd backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.arguments=--spring.datasource.url=jdbc:postgresql://localhost:5432/chat_app_migration_test --spring.flyway.enabled=true --spring.jpa.hibernate.ddl-auto=validate --server.port=18080"
```

Kỳ vọng: log Flyway `Successfully applied 9 migrations` (V1…V9), Hibernate validate **không lỗi**, app start OK → `Ctrl+C`.

```powershell
# 3) Kiểm tra lịch sử migration
psql -U postgres -d chat_app_migration_test -c "select installed_rank, version, description, success from flyway_schema_history order by installed_rank"
```

Kỳ vọng: đủ 9 dòng, tất cả `success = t`. Sau khi xong có thể `DROP DATABASE chat_app_migration_test`.
Ghi chú: style PK `BIGSERIAL` ở `V4__user_blocks.sql` (phần còn lại của 166) cần cân nhắc checksum Flyway trước khi sửa — chỉ xử lý khi có quyết định riêng; Testcontainers bản đầy đủ đợi Docker.

---

## T2 — Smoke API live trên stack thật

**Chuẩn bị**:

```powershell
# Terminal 1 — backend (dev: ddl-auto=update, dùng DB dev từ backend/.env)
cd backend; .\mvnw.cmd spring-boot:run

# Terminal 2 — frontend
cd frontend; npm.cmd run dev   # http://localhost:5173
```

Dùng 3 tài khoản test riêng: `smoke_a`, `smoke_b`, `smoke_c` (prefix `smoke_` để dễ dọn). Nên chạy trên DB dev/hobby, không chạy trên dữ liệu thật quan trọng.

### S1 — Auth & session
- Register 3 tài khoản → login → `GET me` trả đúng thông tin (không có `email` trong payload user thường).
- Refresh (cookie) cấp access token mới → logout thu hồi session, refresh sau đó bị từ chối.
- Đăng nhập sai 11 lần liên tiếp → lần vượt ngưỡng nhận **429** (`AUTH_005`); đăng nhập đúng xoá bucket account.

### S2 — Friendship & block
- `smoke_a` gửi lời mời → `smoke_b` accept; `smoke_c` không kết bạn (giữ làm "người lạ" cho các test consent).
- `smoke_a` block `smoke_b` → gửi tin nhắn mới bị chặn `USER_004`; call bị huỷ; unblock → gửi lại được.

### S3 — Chat riêng (message flows)
- Gửi / nhận tin qua WS realtime (2 browser), gửi tin có URL → link preview xuất hiện.
- Edit, recall, reply, react, forward, xoá hội thoại phía mình (`clear`), search toàn cục.
- Sau `clear`: search và tóm tắt AI **không** được trả về tin trước mốc clear.
- Seen-by / read receipt cập nhật đúng; gõ liên tục không làm mất typing indicator.

### S4 — Nhóm (consent + quyền)
- Tạo nhóm với < 3 người → lỗi `GROUP_REQUIRES_MINIMUM_MEMBERS`.
- Tạo nhóm có `smoke_c` (không phải bạn) → **403 `ROOM_014`** "You can only add friends to a group".
- Sau khi kết bạn với `smoke_c`, block rồi thử thêm vào nhóm → **`USER_004`**.
- Thêm/xoá member, đổi tên nhóm, avatar nhóm, updated nickname (member sửa được, moderator sửa admin → `ROOM_013`).
- Rời nhóm khi còn 3 người → bị chặn; nhóm 4 người rời OK.
- Invite link: owner lấy được code; **member thường không thấy `inviteCode`** trong room response (cả REST lẫn payload WS) — kiểm tra Network tab.
- Pin/unpin: member thường không có nút; gọi API trực tiếp → 403.

### S5 — Media
- Upload ảnh JPEG thật → hiển thị; click mở lightbox.
- Upload file HTML đổi đuôi `.png` → bị chặn (magic byte).
- Avatar: upload PNG hợp lệ OK; GIF/HTML đội lốt → chặn.
- Truy cập URL media khi không phải participant → **404 `MEDIA_005`** "Media not found".
- (Tùy chọn) đặt quota nhỏ `app.uploads.daily-quota-bytes` → upload vượt quota trả 413 `MEDIA_006`.

### S6 — Calls
- Gọi 1-1 giữa 2 browser: ring → accept → audio; kết thúc sạch.
- `smoke_c` gọi chồng lấn cùng lúc → **BUSY** (đường thua race trong DB, không phải pre-check).
- Missed call: gọi rồi không bắt → người gọi thấy CALL_MISSED sau sweep.

### S7 — Presence & WebSocket
- Online/offline chỉ hiện với bạn bè + co-participant phòng (không còn broadcast toàn cục).
- Admin disable `smoke_b` → socket của `smoke_b` bị đóng (1008) trong ~1 giây, presence offline.
- Gửi frame sai (target recalled/invalid) → nhận **error frame** ở `/user/queue/errors`.

### S8 — Admin & audit
- User thường gọi `/admin/accounts` → 403; admin → 200.
- Đổi role/disable tài khoản thật → xuất hiện bản ghi mới trong `/admin/audit-logs`; thao tác no-op (không đổi gì) → **không** sinh log.

---

## T3 — UI manual checklist (các item FE Phase 3/4)

- **ErrorBoundary**: fallback hiển thị + nút reload khi lỗi render (kiểm tra markup; có thể test bằng cách tạm throw trong dev).
- **Focus trap**: mở media viewer/forward picker/invite modal → Tab/Shift+Tab wrap trong dialog, đóng → focus quay lại nút mở.
- **Offline cache**: chat vài hội thoại → reload F5 → hội thoại/message hiện tức thì từ IndexedDB; logout → cache sạch.
- **Virtualization**: cuộn hội thoại dài; jump-to-message (reply/quote click) và unread divider vẫn đúng vị trí.
- **Deep-link invite**: copy link mời → mở ở tab ẩn danh → bị yêu cầu login → sau login nhảy đúng vào trang invite.
- **WS reconnect**: tắt mạng 10s rồi bật → socket tự kết nối lại (backoff, không spam); tin nhắn gửi trong lúc mất mạng vẫn gửi được sau khi reconnect (queue).
- **Error message từ server**: tạo nhóm với non-friend → banner hiển thị đúng "You can only add friends to a group" (qua `getApiErrorMessage`).
- **Media URL an toàn**: link preview/media URL `javascript:...` không render thành link (renderUtils).
- **React.memo**: React DevTools Profiler — gõ text trong ô soạn tin, các `MessageItem` không re-render lại.

---

## T4 — Bảo mật đối kháng (map theo từng item checklist)

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Lấy response user/search → kiểm tra JSON | Không có field `email` (item 2.1a) |
| 2 | Login → refresh 1 lần OK → dùng lại token refresh **cũ** | 401 + toàn bộ session active của user bị revoke (replay detection — 2.1b) |
| 3 | Dùng access JWT làm cookie `chat_media_session`, và ngược lại | Cả hai bị 401 — 2 loại token không thay thế nhau được (2.1c) |
| 4 | Xoá user trong DB → gọi API với token cũ | **401**, không 500 (2.3a) |
| 5 | `POST /auth/refresh` với `Origin: https://evil.example` | Bị chặn bởi `AuthOriginCheckFilter` (2.2) |
| 6 | Login sai 11 lần liên tiếp | 429 nhất quán, không rò chi tiết tài khoản tồn tại hay không (2.1d) |
| 7 | Đặt `RATE_LIMIT_ROOM_MEMBER_ADDS_MAX=3` → mời người thứ 4 trong window | **429** `AUTH_005` (item 161) |
| 8 | `createGroup` / `addMembers` với non-friend, và với người bị block | `ROOM_014` / `USER_004` (item 161) |
| 9 | Member thường lấy room list (REST + frame WS) | Không lộ `inviteCode` (item 153) |
| 10 | Truy cập media không thuộc hội thoại / tin đã recall | 404 `MEDIA_005`, không 403 lộ tồn tại file (item 165) |
| 11 | Request header `X-Request-ID: <script>alert(1)</script>` | Response trả requestId là UUID tự sinh (không echo) (item 156) |
| 12 | Bật tạm `CLOUDINARY_PUBLIC_UPLOADS_ENABLED=true` với creds rỗng → gọi `/media/upload-signature` | Lỗi cấu hình `CLOUDINARY_CONFIG_MISSING`, **không** ký list rỗng; sau khi tắt lại như cũ (item 160) |
| 13 | WS: CONNECT với account đã bị disable | Từ chối + đóng kết nối; account bị disable giữa chừng → bị force-disconnect (item 167) |

---

## T5 — Hiệu năng & hồi quy

- **Query count** (tự động trong T0): `MessageHydrationQueryCountTest` — hydrate 20 message kèm reply/reaction/mention chỉ ~5 query; các query test H2 (`ClearedConversationQueryTest`, `RoomSummaryQueryTest`, `PresenceRecipientQueryTest`, `RoomNotificationQueryTest`) chạy JPQL thật.
- **Live (tùy chọn)**: seed 1 hội thoại ~200 tin (script PowerShell gọi API hoặc UI) → mở hội thoại, xem SQL log của backend: số query **không** tăng theo số tin nhắn (batch fetch).
- **FE**: cuộn danh sách dài mượt (content-visibility), mở/đóng modal không lag, gõ input không re-render list (đã gộp vào T3).
- **Coverage**: `npm.cmd run test:coverage` vẫn ≥ ngưỡng 40/25/34/45 (hiện 44.8/28.89/38.14/50.64).

---

## Điều kiện đạt (Exit criteria)

1. **T0 + T1-A**: 100% PASS (đã PASS tại `d404c41` — xem nhật ký).
2. **T1-B**: thêm điểm cộng nếu chạy — Flyway + validate sạch trên Postgres thật local.
3. **T2–T4**: mọi scenario PASS, hoặc issue phát hiện được fix + commit + ghi chú vào `PRE_FEATURE_CHECKLIST.md`.
4. Không còn lỗi P0/P1 mở; các ghi chú nhỏ ghi lại vào checklist.
5. Kết quả mỗi lần chạy ghi thêm 1 dòng vào bảng **Nhật ký chạy** bên dưới.

---

## Nhật ký chạy

| Ngày | Commit | Tầng | Kết quả | Ghi chú |
|---|---|---|---|---|
| 2026-10-19 | `d404c41` | T0 | ✅ PASS | Backend **300/300** (40.4s, BUILD SUCCESS); FE **42/42** (12 file); coverage 44.8/28.89/38.14/50.64 ≥ ngưỡng 40/25/34/45; lint sạch; build OK |
| 2026-10-19 | `d404c41` | T1-A | ✅ PASS | `ProductionSchemaMigrationTest` + `ProductionSchemaValidationTest` nằm trong suite T0 — V1→V9 chạy đủ, prod-profile validate sạch |
| 2026-10-19 | `2d1c8ed` | T1-B | ✅ PASS | Flyway V1→V9 áp sạch trên **PostgreSQL 18.6 thật** (DB `chat_app_migration_test` tạo mới) + khởi động `ddl-auto=validate` không lỗi; `flyway_schema_history` đủ 9 dòng `success=t`. DB giữ lại chạy T2 (Testcontainers bỏ qua vì máy chưa có Docker) |
| 2026-10-19 | `cea59aa` | T2 — S1–S2, S8 | ✅ PASS | smoke1 **44/44**: register/login/refresh (cookie), friendship + block (`USER_004`), nhóm: chặn thêm non-friend `ROOM_014`, nhóm <3 người `ROOM_004`, member thường không thấy `inviteCode` (REST), email không còn lộ; admin bootstrap an toàn |
| 2026-10-19 | `cea59aa` | T2 — S3–S5 | ✅ PASS | smoke2 **36/36** trên PG thật: gửi/sửa/thu hồi/tự xoá phía mình (`clearedAt`), pin/unpin, search (cả nhánh có `clearedAt`), media local cookie (owner 200 / outsider 404 `MEDIA_005`), around-anchor |
| 2026-10-19 | `cea59aa` | T2/T4 — S7 (WS) | ✅ PASS | smoke3 (sockjs-client chính chủ) **14/14**: STOMP CONNECT kèm auth, presence online/offline, typing, DM realtime, REST history + around cho tin từ WS, block → error frame `USER_004`, re-friend. Ghi chú: `/api/ws/websocket` bare = chế độ raw-STOMP (không frame `o` — đúng thiết kế); SockJS dùng URL session-style; CONNECT thiếu auth bị từ chối bằng ERROR frame + close 1002 (không phải bug) |
| 2026-10-19 | `cea59aa` | Bugfix (PG-only) | ✅ FIXED | T2 phát hiện **42P18 "could not determine data type of parameter"** chỉ khi chạy PostgreSQL thật (H2 chấp nhận): 21 query dùng `(:param is null or ...)` → chuyển sang `coalesce(:param <cột>, true)`. Sau fix: backend **300/300** + toàn bộ smoke T2/T4 chạy lại xanh |
| 2026-10-19 | `cea59aa` | T4 — REST security/admin | ✅ PASS | smoke4 **48/48**: replay refresh cũ → 401 `AUTH_004` + thu hồi **toàn bộ** session của user (family khác cũng chết), refresh kèm Origin lạ → 403, token swap access↔media đều 401, `X-Request-ID` an toàn echo / độc hại thay UUID, user đã xoá trong DB → 401 (không 500), media tin đã thu hồi → 404 `MEDIA_005`, admin list/disable/re-enable/đổi role + audit `STATUS_CHANGE`/`ROLE_CHANGE`, no-op không sinh log, tự disable mình `ACCOUNT_002`, logout thu hồi refresh |
| 2026-10-19 | `cea59aa` | T4 — WS | ✅ PASS | t4ws **13/13**: frame room realtime không chứa `inviteCode` với member thường; admin disable giữa phiên → socket đóng **1008** (~1s); CONNECT khi bị disable → ERROR + đóng; re-enable sạch |
| 2026-10-19 | `cea59aa` | T4 — #7, #12 (limits) | ✅ PASS | smoke5a **7/7** (`RATE_LIMIT_ROOM_MEMBER_ADDS_MAX=3`): 10 lần login sai trong cửa sổ OK → lần 11 **429 `AUTH_005`** (tài khoản tồn tại hay không đều trả mã lỗi y hệt — không rò), đúng mật khẩu vẫn bị chặn khi hết cửa sổ; createGroup thứ 2 (trọng số 2, tổng 4>3) → **429**; thiếu creds Cloudinary → 500 `MEDIA_001`. smoke5b **8/8** (creds giả): ký OK, echo cloudName/apiKey, `allowedFormats` 23 mục không có html/svg/js, folder/uploadUrl/publicId/timestamp chuẩn |
| — | — | T3 (browser UI) | ⏳ để người dùng chạy | Các kịch bản UI thủ công (ErrorBoundary, focus trap, offline cache, virtualization, deep-link, WS reconnect, banner lỗi…) |
| 2026-10-19 | `cea59aa` | T5 | ✅ phần tự động | Query-count/hydration tests xanh trong T0; phần seed 200 tin live là tùy chọn — chưa chạy |
| 2026-10-20 | `d33a418` | UI audit (FE) | ✅ PASS (static) | Phục hồi 539 rule block + 9 keyframes bị mất khi tách `ChatPage.css`; FE **54/54**, lint/build sạch; chờ kiểm tra hình ảnh T3 |

## Frontend UI refactor audit (2026-10-20)

Sau khi tách `ChatPage.css` thành CSS theo component (commit `d33a418`):

- **P0 đã fix**: bản tách CSS làm mất **328 class** (trong đó **211 class** vẫn được JSX dùng) — call UI, media lightbox/viewer, details sidebar (member/invite), forward picker, blocked users, group seen, skeleton/typing, attachment, wallpaper… Đã phục hồi 1:1 **539 rule block** + **9 `@keyframes`**, phân bổ về đúng file component.
- **Cascade**: chuyển các override `@media (max-width: 480px)` về cùng file với rule base để không bị file load sau đè.
- **Kiểm tra tĩnh**: đối chiếu toàn bộ `className` trong TSX với selector định nghĩa trong 22 file CSS → **0 class còn thiếu style** (các tên còn lại là token động hoặc dead class có từ trước, không có rule ở HEAD).
- **Fix kèm**: scope `.details-close-btn` (SearchSidebar) và `.modal-close-btn` (ProfileViewer) theo modal; `AddMembersModal` dùng `send-btn`; Escape đóng ProfileEditor/CreateGroup/BlockedUsers (hook `useModalEscape`); MessageActions đóng bằng Escape + `aria-haspopup` + giới hạn chiều cao menu theo vùng nhìn thấy.
- **Kiểm chứng**: FE **54/54** (14 file), lint sạch, build OK. Chưa chạy kiểm tra hình ảnh trên browser (T3) — người dùng xác nhận khi backend bật.

## Việc còn treo (ngoài phạm vi plan)

- **166**: Testcontainers đầy đủ — chờ Docker (T1-B đóng được phần "Postgres thật" trước).
- **118** (tùy chọn): `pg_trgm` — cần Postgres thật + migration vendor-specific, khảo sát khi làm 166.
