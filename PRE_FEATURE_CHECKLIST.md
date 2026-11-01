# PulseChat — Checklist trước khi thêm feature mới

> **Trạng thái**: Browser Quality Gate (Phase 1), Realtime Hardening (Phase 2) và fix popup cuộc gọi hoàn tất ngày 2026-11-01.
> **Quy tắc**: hoàn tất T0 + T1 + T2 của [`TEST_PLAN.md`](TEST_PLAN.md) trước khi bắt đầu feature mới. T3 vẫn cần chạy tay khi có backend.
> **Phạm vi**: hardening, kiểm thử hồi quy và chất lượng UI — chưa bao gồm roadmap feature mới.

---

## Trạng thái hiện tại (2026-11-01)

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Backend unit/integration | ✅ | **303/303**, BUILD SUCCESS |
| Frontend unit | ✅ | **58/58**, 14 file |
| Lint / production build | ✅ | `npm run lint`, `npm run build` |
| CSS coverage guard | ✅ | 705 used / 856 defined / 0 missing / 16 allowlisted |
| Browser E2E | ✅ local | Playwright **19/19** trên Chromium |
| Realtime recovery | ✅ local | Offline pause / online resume, exponential backoff, E2E nhận lại tin sau offline |
| Incoming call popup | ✅ local | Nút 36×36 đồng bộ với caller; icon-only, không tràn chữ; bố cục đúng ở desktop và mobile 390×844 |
| Accessibility smoke | ✅ | axe: 0 serious/critical trên login, chat và call popup |
| Style contracts | ✅ | Computed styles cho sidebar, composer, send button |
| Responsive overflow | ✅ | Mobile 390×844 không overflow ngang |
| Visual snapshots | ✅ local Windows | 4 baseline; CI skip vì platform-specific |
| CI Browser E2E | ✅ | [Run 41301443914](https://github.com/sayuchan2302/PulseChat/actions/runs/41301443914) — cả 3 job xanh sau Phase 2 |
| T3 manual browser | ⏳ người dùng | Call overlay, media viewer, details sidebar, mobile ≤480px |

Chi tiết kiến trúc, phạm vi test và bằng chứng nằm trong [`TEST_PLAN.md`](TEST_PLAN.md).

---

## Đã hoàn tất

- **Phase 1 — Browser Quality Gate**: Playwright + axe + computed-style contracts + CSS coverage; backend 303/303, frontend 58/58, E2E 19/19, 4 visual baselines local.
- **Phase 2 — Realtime Hardening**: STOMP exponential backoff (jitter 500–1000ms, cap 30s), pause/resume theo `online`/`offline`, giữ `connectingPromise`, resync sau reconnect.
- **Incoming call popup fix**: nút Accept/Decline dùng chung kiểu `.call-round-btn` 36×36 với caller; Accept xanh, Decline đỏ, icon-only + `aria-label`; tên và metadata tách dòng; E2E so sánh trực tiếp với popup người gọi.

---

## Bài học giữ lại

- **CSS tách file vẫn có thể mất style dù test xanh**: từng mất 328 class sau refactor. Luôn chạy `npm run check:css` sau khi move/rename CSS.
- **H2 không thay thế PostgreSQL cho mọi query**: H2 từ chối `MAX(id) ... GROUP BY CASE ...`; E2E dùng PostgreSQL thật.
- **Sidebar chỉ có hội thoại có tin nhắn**: test cần seed message hoặc điều hướng trực tiếp `/chat/u/:username`.
- **Playwright strict mode**: aria-label như "Start audio call with Unfriend Bob" cũng khớp `getByRole('button', { name: 'Unfriend' })`; dùng `exact: true`.
- **Axe bắt contrast rất tốt**: token xám/nhạt cho metadata có thể fail 4.5:1 dù nhìn "ổn"; sửa token thay vì rải style riêng.
- **Visual snapshot cần dữ liệu tĩnh**: username có runId, thời gian tương đối và unread badge phải được ẩn/mask.
- **`setOffline` không đóng WebSocket đang mở ngay**: phải nghe sự kiện `offline` và chủ động `deactivate` client.
- **Reconnect cần đồng bộ lại dữ liệu**: chỉ bật lại socket là chưa đủ; `onConnect` phải reload conversation/room/user.
- **Nút hành động trong cùng overlay nên dùng chung class/kích thước**: ưu tiên icon-only + `aria-label` thay vì nhồi chữ vào nút nhỏ; E2E nên so sánh trực tiếp hai phía caller/receiver.

---

## T3 — Manual checklist trước khi release

- [ ] Call overlay: audio/video, mute, camera, screen share, minimize/restore, kết thúc sạch; kiểm tra cả popup người nhận.
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
