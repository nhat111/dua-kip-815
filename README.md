# Đua kịp 8:15 – Men Day 11/11

Game đua đi làm cho nhiều người chơi, mỗi người một điện thoại.

## Cấu trúc
- `public/index.html`: toàn bộ game (giao diện, âm thanh, logic)
- `api/state.js`: API đồng bộ bảng xếp hạng (Vercel Serverless Function)

## Deploy
1. Push repo này lên GitHub/GitLab.
2. Vercel → Add New Project → chọn repo → Deploy (không cần build, giữ mặc định).
3. Bảng xếp hạng chung cần Redis:
   Project → Storage (hoặc Marketplace) → thêm **Upstash Redis** → Connect to Project.
   Vercel tự thêm biến môi trường (`KV_REST_API_URL`/`KV_REST_API_TOKEN` hoặc `UPSTASH_REDIS_REST_*`).
4. Deployments → Redeploy để nhận biến môi trường.
5. Gắn domain riêng: Project → Settings → Domains.

## Xóa bảng xếp hạng trước giờ G (tùy chọn)
Thêm biến `ADMIN_KEY=mat-khau-cua-ban`, redeploy, rồi mở:
`https://domain-cua-ban/api/state?reset=1&key=mat-khau-cua-ban`

## Không có Redis thì sao?
Game vẫn chạy, nhưng bảng xếp hạng có thể nhảy lung tung vì Vercel chạy nhiều instance riêng.
