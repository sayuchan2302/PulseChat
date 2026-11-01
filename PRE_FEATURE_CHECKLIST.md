# PulseChat — Checklist trước khi thêm feature mới

> **Trạng thái**: Browser Quality Gate (Phase 1) và Realtime Hardening (Phase 2) hoàn tất ngày 2026-11-01.
> **Quy tắc**: hoàn tất T0 + T1 + T2 của `TEST_PLAN.md` trước khi bắt đầu feature mới. T3 vẫn cần người dùng chạy khi có backend.
> **Phạm vi**: hardening, kiểm thử hồi quy và chất lượng UI — không bao gồm roadmap feature mới.

---

## Trạng thái hiện tại (2026-11-01)

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Backend unit/integration | ✅ | **303/303**, BUILD SUCCESS |
| Frontend unit | ✅ | **58/58**, 14 file |
| Lint / production build | ✅ | `npm run lint`, `npm run build` |
| CSS coverage guard | ✅ | 706 used / 857 defined / 0 missing / 16 allowlisted |
| Browser E2E | ✅ local | Playwright **18/18** trên Chromium |
| Realtime recovery | ✅ local | Offline pause / online resume, backoff exponential, E2E nhận lại tin sau offline |
| Accessibility smoke | ✅ | axe: 0 serious/critical trên login + chat |
| Style contracts | ✅ | computed styles cho sidebar, composer, send button |
| Responsive overflow | ✅ | mobile 390×844 không overflow ngang |
| Visual snapshots | ✅ local Windows | 4 baseline; CI skip vì platform-specific |
| CI Browser E2E | ✅ | [Run 41301443914](https://github.com/sayuchan2302/PulseChat/actions/runs/41301443914) — cả 3 job xanh sau Phase 2 |
| T3 manual browser | ⏳ người dùng | call overlay, media viewer, details sidebar, ≤480px |

---

## Phase 1 — Browser Quality Gate

### Hạ tầng

- [x] Thêm Playwright + `@axe-core/playwright` vào `frontend/package.json`.
- [x] `playwright.config.ts`: Chromium, 1 worker, trace/screenshot/video khi fail, webServer backend 8081 + Vite 4173 khi chạy local; CI dùng `E2E_SERVERS_MANAGED=true`.
- [x] Backend profile `e2e`: `application-e2e.yml`, rate limit cao, CORS cho 4173, port 8081.
- [x] `e2e/start-backend.mjs`: build jar và chạy backend E2E với PostgreSQL.
- [x] `e2e/global.setup.ts`: seed 7 user, friendship, message, read state; ghi `.auth/users.json`.
- [x] `.gitignore`: bỏ qua `playwright-report/`, `test-results/`, `e2e/.auth/`.
- [x] `vitest.config.ts`: chỉ chạy unit tests trong `src/`, tránh Playwright specs.
- [x] CI: job `Browser E2E` dùng PostgreSQL 16 service, cài Chromium, build/start backend + Vite ở step riêng có timeout, upload report + server logs; frontend job thêm `check:css`. Run `41186673396` xanh.

### Test coverage

- [x] Auth: register qua UI, login/reload/logout, invalid credentials.
- [x] Chat: DM realtime giữa 2 browser, react + edit qua action menu.
- [x] Social: unfriend trong profile danger zone; tạo nhóm với 2 bạn.
- [x] UI: Escape đóng account modals, backdrop đóng profile, mobile không overflow.
- [x] Style contracts: sidebar/composer/send button có layout và màu đúng.
- [x] Accessibility: axe trên login và chat, không serious/critical.
- [x] Visual: login, direct conversation, partner profile, mobile list.

### Fix kèm trong Phase 1

- [x] `--text-secondary` light theme `#6E6E78` → `#66666F` (contrast 4.32 → 4.86 trên nền tertiary).
- [x] `--text-tertiary` light theme `#9E9EA8` → `#6B6B75` (contrast 2.27 → 4.51, đạt WCAG AA cho text nhỏ).
- [x] Selector E2E dùng `exact: true` cho Unfriend/Add friend/Create group để tránh strict-mode do aria-label chứa từ khóa.
- [x] Profile modal đóng sau unfriend; test mở lại profile để xác nhận trạng thái "Add friend".
- [x] Seed message để conversation xuất hiện trong sidebar (sidebar chỉ hiện hội thoại đã có tin nhắn).
- [x] Ổn định visual snapshot bằng cách ẩn username/time/unread động, giữ nguyên layout.

---

## Phase 2 — Realtime hardening (2026-11-01)

### Thay đổi

- [x] Chuyển reconnect sang `ReconnectionTimeMode.EXPONENTIAL` của stompjs: jitter 500–1000ms, nhân đôi sau mỗi lần lỗi, tối đa 30 giây.
- [x] `offline`: tạm dừng client bằng `deactivate({ force: true })` và cập nhật trạng thái offline ngay.
- [x] `online`: kích hoạt lại cùng client; `beforeConnect` refresh access token; `onConnect` resync dữ liệu đang mở.
- [x] Giữ `connectingPromise` khi socket drop để tránh tạo client thứ hai nếu `connect()` được gọi lại trong lúc reconnect.
- [x] Thêm E2E: Alice offline, Bob gửi tin, Alice online lại nhận tin và gửi tiếp cho Bob.

### Bằng chứng

| Hạng mục | Kết quả |
|---|---|
| WebSocket unit tests | **9/9** pass |
| Frontend unit tests | **58/58** pass, 14 file |
| Playwright E2E | **18/18** pass (1 setup + 17 scenarios) |
| `npm run lint` / `npm run build` / `npm run check:css` | pass |

---

## Bài học giữ lại

- **CSS tách file vẫn có thể mất style dù test xanh**: `d33a418` từng làm mất 328 class (211 class còn dùng trong JSX). Bắt buộc chạy `npm run check:css` sau khi move/rename CSS.
- **H2 không thay thế PostgreSQL cho mọi query**: H2 từ chối `MAX(id) ... GROUP BY CASE ...`; E2E dùng PostgreSQL thật. Query mới có `GROUP BY CASE` nên được kiểm tra trên PostgreSQL.
- **Sidebar chỉ có hội thoại có tin nhắn**: test cần seed message hoặc điều hướng trực tiếp `/chat/u/:username`; đừng chờ friend xuất hiện trong danh sách.
- **Playwright strict mode**: aria-label như "Start audio call with Unfriend Bob" cũng khớp `getByRole('button', { name: 'Unfriend' })`; dùng `exact: true`.
- **Axe bắt contrast rất tốt**: token xám nhạt cho metadata có thể fail 4.5:1 dù nhìn "ổn"; sửa token thay vì rải style riêng.
- **Visual snapshot cần dữ liệu tĩnh**: username có runId, thời gian tương đối và unread badge phải được ẩn/mask; nếu không baseline sẽ fail mỗi lần chạy.
- **`setOffline` không đóng WebSocket đang mở ngay**: trình duyệt có thể giữ socket cũ cho tới heartbeat. Phải lắng nghe sự kiện `offline` và chủ động `deactivate` client, nếu không UI vẫn báo online và tiếp tục retry vô ích.
- **Reconnect cần đồng bộ lại dữ liệu**: chỉ bật lại socket là chưa đủ; `onConnect` phải reload conversation/room/user để bắt tin nhắn bị lỡ trong thời gian offline.

---

## T3 — Manual checklist trước khi release

- [ ] Call overlay: audio/video, mute, camera, screen share, minimize/restore, kết thúc sạch.
- [ ] Media lightbox/viewer: ảnh/video/voice, Escape/backdrop, focus trả về.
- [ ] Details sidebar: member list, invite link, nickname, group avatar, pinned message.
- [ ] Mobile ≤480px: chuyển sidebar/chat, không overflow, composer/action menu dùng được.
- [ ] ErrorBoundary fallback + reload.
- [ ] Offline cache reload và logout cleanup.
- [ ] WS reconnect sau mất mạng; pending message gửi lại. (E2E đã phủ reconnect + resync; pending send khi offline vẫn kiểm tra thủ công.)
- [ ] Deep-link invite sau login.

---

## Checklist khi bắt đầu feature mới

- [ ] T0 + T1 + T2 xanh; CI Browser E2E xanh.
- [ ] Feature spec rõ acceptance criteria.
- [ ] Chạm DB → migration Flyway mới, entity khớp 100%.
- [ ] Chạm auth/media/WS → rà security checklist + thêm test.
- [ ] Thêm test cho logic mới (unit; E2E nếu là luồng UI quan trọng).
- [ ] Chạy `npm run check:css` nếu thêm/đổi class hoặc tách CSS.
- [ ] Cập nhật README/.env.example nếu có config mới.
- [ ] Commit nhỏ, một chủ đề.

---

## Lệnh kiểm tra nhanh

```powershell
# Backend
cd backend
.\mvnw.cmd -B test

# Frontend
cd frontend
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run check:css
npm.cmd run test:e2e
```
