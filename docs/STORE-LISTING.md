# MochiNote store listing

## Name

MochiNote — ghi chú cạnh trình duyệt

## Short description

Ghi chú, Sticker, thư mục và nhiệm vụ nhẹ ngay cạnh trang bạn đang xem.

## Description

MochiNote là trợ lý ghi chú local-first, nhẹ và riêng tư cho Chrome/Edge. Lưu ý tưởng thành Sticky, sắp xếp bằng thư mục nhiều lớp, lên kế hoạch nhiệm vụ theo ngày và đặt nhắc nhở ngay trong side panel.

### Included

- Ghi chú checklist với màu, họa tiết, ghim và yêu thích.
- Sticker board hai cột, lọc theo thư mục và thao tác nhanh.
- Thư mục con không giới hạn độ sâu.
- Task planner theo ngày với hoàn thành, giờ, thư mục, sắp xếp và xóa.
- Tìm kiếm không dấu, lọc theo folder/màu/ghim/yêu thích.
- Reminder local với lặp hằng ngày/hằng tuần và notification best effort.
- Popup quick capture, metadata trang hiện tại và chụp viewport nhìn thấy.
- Context menu “Lưu trang vào MochiNote”.

Không cần tài khoản. Dữ liệu của bạn ở lại trên thiết bị.

## Permission rationale

See [PRIVACY.md](PRIVACY.md). The extension intentionally avoids `<all_urls>` and does not use remote code.

## Release surfaces

- Side panel: `sidepanel.html`
- Toolbar popup: `popup.html`
- Service worker: `background.js`

## Store assets

The package uses the bundled Mochi mascot at `public/brand/mochi-mascot.png` for extension icons and notifications. Store graphics live outside `public/` so they are not bundled into the extension:

- `store-assets/generated/mochinote-screenshot-1280x800.png`
- `store-assets/generated/mochinote-promo-440x280.png`

They are generated from `store-assets/mochinote-promo-source.png` by `pnpm run prepare:store`. The source was produced with the built-in imagegen tool from the accepted MochiNote reference using an `ads-marketing` prompt that preserved the warm palette, three core product surfaces, compact popup, exact brand name, and Vietnamese tagline.

Product screenshots captured during Browser QA at 400px and 320px side-panel widths are recorded in `.project/fidelity-ledger.md`.
