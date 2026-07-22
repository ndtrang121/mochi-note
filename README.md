# MochiNote

MochiNote là tiện ích trình duyệt xây dựng bằng WXT, React và TypeScript. Dữ liệu chính được lưu local-first; Supabase local được dùng để phát triển và kiểm tra Auth, Row Level Security (RLS) cùng luồng đồng bộ.

## Chuẩn bị môi trường

Cần cài trước:

- Docker Desktop và bảo đảm Docker engine đang chạy.
- Node.js 20 trở lên.
- pnpm 11.9.0, đúng phiên bản khai báo trong `package.json`.

Sau khi clone repository, cài dependencies:

```powershell
corepack enable
pnpm install --frozen-lockfile
```

Repository đã có sẵn `supabase/config.toml` và migrations. Không cần chạy `supabase init`.

## Thiết lập Supabase local lần đầu

Chạy từ thư mục gốc của repository:

```powershell
pnpm run supabase:setup:test
```

Đây là lệnh được khuyến nghị cho lần thiết lập đầu tiên. Script sẽ:

1. Kiểm tra Docker và pnpm.
2. Khởi động Supabase local bằng Docker.
3. Tạo `.env.local` với API URL và publishable key dành cho extension.
4. Kiểm tra migration history và database advisors.
5. Chạy bộ test Auth, Data API grants, RLS isolation, spoof protection, last-write-wins, tombstone và `sync_version`.
6. Build extension với cấu hình Supabase local.

Script test chỉ chấp nhận Supabase URL có hostname `127.0.0.1` hoặc `localhost`, tránh chạy thao tác kiểm tra phá hủy dữ liệu trên project remote. Test account được tự động xóa sau khi chạy.

Khi hoàn tất, các địa chỉ mặc định là:

| Dịch vụ | Địa chỉ |
| --- | --- |
| Supabase API | `http://127.0.0.1:54321` |
| PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Supabase Studio | `http://127.0.0.1:54323` |
| Email test | `http://127.0.0.1:54324` |

Extension đã build nằm tại `.output/chrome-mv3`. Có thể mở `chrome://extensions`, bật **Developer mode**, chọn **Load unpacked** và trỏ tới thư mục này.

## Làm việc hằng ngày

Khởi động stack đã cài:

```powershell
pnpm run supabase:start
```

Khởi động, cập nhật `.env.local`, chạy advisors và build extension:

```powershell
pnpm run supabase:setup
```

Chạy riêng bộ test Auth/RLS/đồng bộ khi stack đang hoạt động:

```powershell
pnpm run supabase:verify
```

Chạy extension ở development mode:

```powershell
pnpm run dev
```

Dừng Supabase và giữ dữ liệu local cho lần chạy sau:

```powershell
pnpm run supabase:stop
```

## Reset database local

Để xóa dữ liệu local và áp dụng lại toàn bộ migrations mà không seed dữ liệu mẫu:

```powershell
pnpm run supabase:reset
```

Lệnh này chỉ nhắm tới database local, nhưng sẽ xóa dữ liệu đang có trong database đó. Không thêm cờ `--linked` vì cờ này có thể nhắm tới project remote.

Nếu muốn reset ngay trong quy trình setup, có thể gọi trực tiếp script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-supabase-local.ps1 -Reset -RunTests
```

## Biến môi trường và bảo mật

`supabase:setup` tự ghi hai biến public vào `.env.local`:

```dotenv
WXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
WXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local-publishable-key>
```

Không commit `.env.local`. Không đưa `SECRET_KEY`, `SERVICE_ROLE_KEY`, database password hoặc credential của project production vào extension. Secret key local chỉ được script kiểm tra dùng để dọn test account.

## Xử lý lỗi thường gặp

- **Docker CLI was not found**: cài Docker Desktop và mở terminal mới.
- **Docker engine is not running**: khởi động Docker Desktop, đợi engine sẵn sàng rồi chạy lại.
- **Port 54321–54324 đang được dùng**: dừng process hoặc Supabase project khác đang chiếm cổng.
- **`enableGlobalVirtualStore` changed**: chạy lại `pnpm install --frozen-lockfile` bằng pnpm 11.9.0.
- **`supabase start is already running`**: đây là thông báo bình thường; script tiếp tục kiểm tra và build.
- **Thông báo imgproxy hoặc pooler đang dừng**: hai dịch vụ tùy chọn này không chặn API, Auth, Studio hay bộ test hiện tại.

Lần chạy đầu có thể mất vài phút vì Docker phải tải các image của Supabase. Các lần sau sẽ nhanh hơn đáng kể.

## Các lệnh kiểm tra khác

```powershell
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run quality
```

