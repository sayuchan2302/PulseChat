# PulseChat — Kế hoạch kiểm thử ổn định (Stability Test Plan)

> **Mục tiêu**: giữ các luồng quan trọng của PulseChat không hồi quy sau mỗi lần refactor UI/backend.
> **Nguyên tắc**: chạy từ rẻ → đắt. Tầng nào FAIL thì dừng, fix, commit rồi chạy lại từ tầng đó.
> **Cập nhật gần nhất**: 2026-11-01 — dọn tài liệu, bổ sung E2E cho popup cuộc gọi phía người nhận.

## Tổng quan các tầng

| Tầng | Nội dung | Hình thức | Thời gian | Điều kiện |
|---|---|---|---|---|
| **T0** | Backend unit/integration, frontend unit, lint, build, CSS coverage | tự động | ~2 phút | không |
| **T1** | Schema & migration (H2 trong T0 + PostgreSQL thật) | tự động + thủ công | ~5 phút | PostgreSQL local |
| **T2** | Browser quality gate: E2E, axe, responsive, style contracts, visual | tự động | ~1 phút | PostgreSQL local |
| **T3** | UI manual checklist (call, media, sidebar details, mobile) | thủ công | ~20 phút | T2 đang chạy |
| **T4** | Bảo mật đối kháng (auth, media, WS, admin) | thủ công/script | ~15 phút | stack thật |

Docker/Testcontainers vẫn chưa dùng được trên máy hiện tại; T1 dùng PostgreSQL local. Visual image snapshots chỉ chạy local vì baseline phụ thuộc platform.

---

## T0 — Bộ test tự động

```powershell
# Backend — kỳ vọng 303/303, BUILD SUCCESS
cd backend
.\mvnw.cmd -B test

# Frontend — kỳ vọng 58/58 test / 14 file
cd frontend
npm.cmd test
npm.cmd run test:coverage
npm.cmd run lint
npm.cmd run build
npm.cmd run check:css
```

**Gotchas**:

- Dùng `npm.cmd` trên Windows vì `npm.ps1` có thể bị chặn.
- `vitest.config.ts` chỉ lấy `src/**/*.{test,spec}.{ts,tsx}` để không chạy nhầm Playwright specs.
- `check:css` đối chiếu class dùng trong TSX với selector CSS; allowlist chỉ chứa class động hoặc dead class đã ghi lý do.
- CI chạy backend tests + frontend tests + CSS coverage + lint + build, và job Browser E2E riêng.

### Map khu vực → test chính

| Khu vực | Test chính |
|---|---|
| Auth/session | `AuthServiceTest`, `AuthControllerTest`, `JwtServiceTest`, `RefreshTokenServiceTest`, `RateLimitServiceTest` |
| Friendship/block | `FriendshipServiceTest`, `UserBlockServiceTest`, `UserBlockQueryTest` |
| Chat room/group | `ChatRoomServiceTest`, `RoomNotificationQueryTest`, `ChatRoomResponseTest` |
| Message | `MessageServiceTest`, `MessageHydrationQueryCountTest`, `ClearedConversationQueryTest` |
| Media | `LocalMediaStorageServiceTest`, `LocalAvatarStorageServiceTest`, `MediaAccessServiceTest`, `LocalMediaHttpSecurityTest` |
| Call/WS/presence | `CallSessionServiceTest`, `ChatWebSocketControllerTest`, `WebSocketAuthChannelInterceptorTest`, `PresenceServiceTest` |
| FE auth/API/WS/cache | `api.test.ts`, `AuthContext.test.tsx`, `websocket.test.ts`, `dbService.test.ts` |
| FE hooks/components | `useMediaUpload.test.tsx`, `useMessageHistory.test.tsx`, `useMessageActions.test.tsx`, `useFocusTrap.test.tsx`, `GlobalMessageSearchModal.test.tsx`, `BlockedUsersModal.test.tsx` |

---

## T1 — Schema & migration

- `ProductionSchemaMigrationTest`: chạy toàn bộ Flyway migration trên H2 PostgreSQL mode.
- `ProductionSchemaValidationTest`: profile `prod` + Flyway + `ddl-auto=validate`.
- Quy trình PostgreSQL thật (không cần Docker):

```powershell
psql -U postgres -c "CREATE DATABASE chat_app_migration_test"
cd backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.arguments=--spring.datasource.url=jdbc:postgresql://localhost:5432/chat_app_migration_test --spring.flyway.enabled=true --spring.jpa.hibernate.ddl-auto=validate --server.port=18080"
```

Kỳ vọng: Flyway áp đủ migration, Hibernate validate sạch, app start OK. Xem lịch sử bằng `select installed_rank, version, description, success from flyway_schema_history order by installed_rank;`.

---

## T2 — Browser Quality Gate

### Kiến trúc

- **Playwright** chạy Chromium, 1 worker, retry 1 lần trên CI.
- Backend E2E chạy jar riêng ở cổng **8081**, profile `e2e`, dùng PostgreSQL từ `backend/.env` hoặc biến `DB_*`.
- Frontend Vite chạy ở cổng **4173** với `VITE_API_BASE_URL`/`VITE_WS_BASE_URL` trỏ backend E2E.
- `global.setup.ts` tạo 7 tài khoản prefix `e2e_` mỗi lần chạy, kết bạn, seed tin nhắn và đánh dấu đã đọc. Dữ liệu auth lưu ở `e2e/.auth/users.json` (đã gitignore).
- Không dùng H2 cho E2E: H2 từ chối query `MAX(id) ... GROUP BY CASE ...` của Hibernate trong luồng danh sách hội thoại, trong khi PostgreSQL xử lý đúng. E2E vì vậy kiểm tra đúng database production.
- Trên CI, backend và Vite được build/start ở các step riêng có timeout; Playwright chạy với `E2E_SERVERS_MANAGED=true` để không tự quản lý server. Log server được ghi vào job summary và artifact, tránh treo job khi shutdown.

### Phạm vi tự động

| File | Nội dung |
|---|---|
| `e2e/auth.spec.ts` | Register qua UI, login/reload/logout, sai mật khẩu |
| `e2e/chat.spec.ts` | Gửi DM realtime cho 2 browser, phục hồi sau offline/online, react + edit qua action menu |
| `e2e/social.spec.ts` | Unfriend trong profile danger zone, tạo nhóm với 2 bạn |
| `e2e/call.spec.ts` | Popup cuộc gọi phía người nhận: nút Accept/Decline, bố cục tên/trạng thái, desktop + mobile |
| `e2e/ui.spec.ts` | Escape đóng modal, backdrop đóng profile, mobile không overflow, computed-style contracts, axe smoke |
| `e2e/visual.spec.ts` | 4 image snapshots local: login, direct conversation, partner profile, mobile list |

### Lệnh chạy

```powershell
cd frontend
npm.cmd run test:e2e          # toàn bộ quality gate
npm.cmd run test:e2e:visual   # chỉ visual snapshots
npm.cmd run check:css
```

Tạo/cập nhật baseline visual trên Windows:

```powershell
npm.cmd run test:e2e:visual -- --update-snapshots
```

### Bằng chứng chạy local (2026-11-01)

| Hạng mục | Kết quả |
|---|---|
| Backend tests | **303/303** pass |
| Frontend unit tests | **58/58** pass, 14 file |
| Playwright E2E | **19/19** pass (1 setup + 18 scenarios), Chromium |
| Incoming call popup | **pass** — nút không tràn chữ, tên/trạng thái xuống dòng, card nằm trong viewport ở 1440×900 và 390×844 |
| Accessibility (axe) | 0 serious/critical trên login, chat và call popup |
| CSS coverage | **706** class dùng, **857** định nghĩa, **0 missing**, **16 allowlisted** |
| Lint / build | pass |
| Visual baselines | 4 snapshot Windows (`*-chromium-win32.png`) |
| CI | ✅ [run 41301443914](https://github.com/sayuchan2302/PulseChat/actions/runs/41301443914) — backend, frontend, Browser E2E xanh sau Phase 2 |

### Lưu ý vận hành

- Chạy E2E local sẽ tạo tài khoản `e2e_*` trong database đang cấu hình. Muốn tách dữ liệu, trỏ `DB_NAME` sang database throwaway.
- Visual snapshots bị skip trên CI (`process.env.CI`) vì font/antialiasing khác platform. Gate CI dựa vào computed-style contracts, responsive overflow và axe.
- Snapshot được ổn định bằng cách ẩn username/time/unread động trong CSS trước khi chụp; không che toàn bộ component.
- Nếu backend E2E đã chạy sẵn ở 8081, Playwright dùng lại server local. Trên CI, server được quản lý riêng và Playwright chỉ chạy tests.

### Realtime hardening (Phase 2)

**Vấn đề**

- Backoff cũ tự tính `reconnectDelay`; stompjs snapshot giá trị này nên các lần retry không tăng theo cấu hình mong muốn.
- Khi trình duyệt mất mạng, WebSocket đang mở có thể không đóng ngay. UI vẫn hiển thị online và client tiếp tục retry dù không có đường mạng.
- Sau khi mạng trở lại, client có thể phải chờ tới backoff tiếp theo (tối đa 30 giây), trong khi dữ liệu bị lỡ chỉ được đồng bộ khi kết nối lại.

**Thay đổi**

- Dùng `ReconnectionTimeMode.EXPONENTIAL` của stompjs: delay khởi đầu 500–1000ms (jitter), nhân đôi mỗi lần lỗi, chặn trên 30 giây.
- Lắng nghe `offline` để tạm dừng client bằng `deactivate({ force: true })`, cập nhật trạng thái offline ngay và không retry vô ích.
- Lắng nghe `online` để kích hoạt lại cùng client, refresh token qua `beforeConnect`, rồi resync user/room/conversation khi kết nối thành công.
- Giữ `connectingPromise` khi socket drop ngoài ý muốn để `connect()` đồng thời không tạo client thứ hai; trạng thái chuyển `reconnecting` và promise chỉ được giải quyết khi `onConnect`.
- Không đổi API backend hay schema; thay đổi nằm ở `websocket.ts`, hook realtime và E2E.

**Bằng chứng**

| Hạng mục | Kết quả |
|---|---|
| WebSocket unit tests | **9/9** pass, gồm offline pause/online resume, initial offline và connect trong lúc reconnect |
| Playwright offline recovery | **pass** — Alice offline, Bob gửi tin, Alice online lại nhận tin và gửi tiếp cho Bob |

### Incoming call popup fix (2026-11-01)

- Nguyên nhân: `.call-action-btn` dùng chung kích thước icon 36×36, trong khi nút Accept/Decline có thêm chữ; chữ tràn khỏi nút. Tên, trạng thái và chip loại cuộc gọi cũng dồn trên một dòng.
- Sửa CSS thuần: nút dạng pill tối thiểu 118×42, chữ không xuống dòng, Decline dùng màu đỏ; phần identity tách tên và metadata thành hai dòng.
- Thêm `e2e/call.spec.ts` kiểm tra kích thước nút, không tràn chữ, thứ tự dòng và vị trí card trong viewport ở desktop lẫn mobile.

---

## T3 — UI manual checklist

Chạy với backend + frontend thật, tốt nhất ở 2 cửa sổ trình duyệt:

- **Call overlay**: gọi audio/video 1-1, mute, camera, screen share, minimize/restore, kết thúc sạch; kiểm tra cả popup người nhận.
- **Media lightbox/viewer**: ảnh, video, voice note; đóng bằng Escape/backdrop; focus trả về nút mở.
- **Details sidebar**: mở/đóng, member list, invite link, nickname, group avatar, pinned message.
- **Mobile ≤480px**: sidebar/chat chuyển màn hình, không overflow ngang, composer và action menu dùng được.
- **ErrorBoundary**: fallback + reload khi render lỗi.
- **Offline cache**: reload F5 hiển thị hội thoại từ IndexedDB; logout xóa cache.
- **WS reconnect**: tắt/bật mạng, socket tự kết nối lại; tin nhắn pending được gửi lại. E2E đã phủ reconnect + resync; phần gửi tin khi offline vẫn cần kiểm tra thủ công.
- **Deep-link invite**: mở link ở tab ẩn danh → login → vào đúng invite page.

---

## T4 — Bảo mật đối kháng

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Response user/search | Không có `email` |
| 2 | Refresh token cũ dùng lại | 401 `AUTH_004`, revoke toàn bộ session active |
| 3 | Access token dùng làm media cookie (và ngược lại) | 401 |
| 4 | User bị xóa trong DB + token cũ | 401, không 500 |
| 5 | Refresh với `Origin` lạ | Bị `AuthOriginCheckFilter` chặn |
| 6 | Login sai vượt ngưỡng | 429 `AUTH_005`, không lộ tài khoản tồn tại |
| 7 | Mời người thứ 4 khi limit = 3 | 429 `AUTH_005` |
| 8 | Tạo nhóm/thêm non-friend hoặc bị block | `ROOM_014` / `USER_004` |
| 9 | Member thường nhận room response | Không lộ `inviteCode` |
| 10 | Truy cập media ngoài quyền | 404 `MEDIA_005` |
| 11 | `X-Request-ID` chứa script | Response dùng UUID tự sinh |
| 12 | Cloudinary bật nhưng thiếu creds | `CLOUDINARY_CONFIG_MISSING` |
| 13 | WS CONNECT khi account bị disable | Từ chối/đóng session 1008 |

---

## Điều kiện đạt

1. T0 + T1 pass, không có test bị xóa âm thầm.
2. T2 pass local; CI job Browser E2E xanh sau push.
3. T3 pass hoặc mọi issue được fix/ghi chú.
4. Không còn lỗi P0/P1 mở.
5. Mỗi lần chạy ghi thêm một dòng vào bảng dưới.

## Nhật ký chạy

| Ngày | Commit | Tầng | Kết quả | Ghi chú |
|---|---|---|---|---|
| 2026-10-19 | `cea59aa` | T0–T4 | ✅ PASS | Baseline cũ: backend 300/300, FE 42/42, smoke REST/WS đầy đủ |
| 2026-10-20 | `d33a418` | UI audit | ✅ PASS (static) | Phục hồi 539 rule CSS + 9 keyframes; FE 54/54 |
| 2026-10-31 | `c8a9a4e` | T0 | ✅ PASS | Backend **303/303**, FE **55/55**, lint/build/CSS coverage sạch |
| 2026-10-31 | `c8a9a4e` | T2 | ✅ PASS | Playwright **17/17**, axe 0 serious/critical, 4 visual baselines local |
| 2026-10-31 | `6c105f5` | CI | ✅ PASS | [Run 41186673396](https://github.com/sayuchan2302/PulseChat/actions/runs/41186673396) — cả 3 job xanh; Browser E2E + CSS coverage chạy trên CI |
| 2026-11-01 | `93c5a22` | Phase 2 | ✅ PASS | WS offline pause/resume + exponential backoff; FE **58/58**, E2E **18/18** |
| 2026-11-01 | `e8277f1` | CI | ✅ PASS | [Run 41301443914](https://github.com/sayuchan2302/PulseChat/actions/runs/41301443914) — backend, frontend, Browser E2E xanh |
| 2026-11-01 | `fef753a` | UI fix | ✅ PASS local | Popup cuộc gọi phía người nhận; E2E **19/19**; T3 vẫn chờ chạy tay |
