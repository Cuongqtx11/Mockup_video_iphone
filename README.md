# Mockup_video_iphone

Tạo video mockup iPhone ngay trên trình duyệt, miễn phí và không cần đăng nhập.

**Web:** https://cuongqtx11.github.io/Mockup_video_iphone/

- 13 dòng iPhone 11–16, 45 biến thể màu; khung ảnh độ phân giải cao với mask màn hình chính xác.
- Nền có sẵn, màu riêng hoặc ảnh nền; tỷ lệ 9:16, 1:1, 16:9; chỉnh kích thước, phóng video, bóng đổ.
- HD 720p, HD+ 900p, Full HD 1080p, QHD 1440p, UHD 2160p / 4K; 30 hoặc 60 fps. Nhãn p là cạnh ngắn của khung 16:9 / 9:16; kích thước pixel luôn hiển thị trước khi xuất.
- MP4 H.264 + AAC được ưu tiên để lưu vào Ảnh trên iPhone. WebM dùng khi thiết bị không mã hóa được H.264. MediaRecorder là đường xuất dự phòng; âm thanh MP4 được chuẩn hóa sang AAC khi môi trường có thể giải mã.
- Tải tệp, xem bản xuất, mở ở tab mới hoặc chia sẻ vào ứng dụng Tệp / Ảnh. Bản xuất vẫn có thể tải sau khi đóng hộp thoại.
- Video gốc không tải lên server. Nguồn được đọc từng phần. Chế độ tự động dùng RAM cho tệp nhỏ và OPFS cho tệp xuất lớn nếu trình duyệt hỗ trợ. Chrome trên máy tính có thể ghi thẳng vào tệp.

## Chạy trên máy

```sh
npm ci
npm run check
npm run build
python3 -m http.server 8766 --directory dist
```

Mở http://localhost:8766. `qa.mjs` dùng playwright-core với Chromium có sẵn và video thử trong `test-results/input.mp4`.

## GitHub Pages

Workflow `.github/workflows/pages.yml` tự build và deploy `dist` khi push vào `main`. Trong Settings → Pages chọn GitHub Actions. Các đường dẫn tương đối hỗ trợ project subpath `/Mockup_video_iphone/`, không cần backend, khóa API hay tài khoản ChatGPT.

## Lưu trên iPhone

Mở bằng Safari. Sau khi xuất, “Lưu video vào Tệp” tải vào Tệp → Tải về. Để lưu vào Ảnh, bấm “Lưu vào Ảnh / chia sẻ” rồi chọn “Lưu video” trong bảng chia sẻ iOS. Nút chia sẻ chỉ hiện khi trình duyệt hỗ trợ chia sẻ tệp. Video WebM có thể cần đổi sang MP4 trước khi nhập vào Ảnh.

## Giới hạn thực tế

Không đo được đáng tin cậy RAM trống. `navigator.deviceMemory` là RAM tổng ước lượng; Safari thường không cung cấp. Máy, codec nguồn và hệ điều hành quyết định tốc độ và mức xuất hỗ trợ. Nếu bộ mã hóa không hỗ trợ 4K, giảm xuống Full HD; tăng độ phân giải xuất không khôi phục chi tiết mà video gốc không có. Giữ trang mở khi xuất theo thời gian thực.

OPFS giữ tệp tạm của bản xuất hiện tại trong bộ nhớ cục bộ của trình duyệt, không upload. Khi xuất lại thành công, bản tạm trước được dọn; nếu đóng trình duyệt đột ngột, có thể còn tệp tạm. Xóa dữ liệu trang sẽ xóa các tệp tạm đó.

## Nguồn tài nguyên

Khung máy lấy từ [device-frames-media](https://github.com/jonnyjackson26/device-frames-media/tree/551098a1f40ce33e6376ab9fdcad2d0756d5a47c), có nguồn artwork từ [Apple Design Resources](https://developer.apple.com/design/resources/) và các tác giả upstream. `dist/assets/frames/SOURCE.txt` ghi nguồn. Apple/iPhone là nhãn hiệu của Apple; dự án không thuộc Apple. Không gán giấy phép mã ứng dụng cho artwork bên thứ ba.

Mediabunny và AAC encoder dùng MPL-2.0; giấy phép đi kèm trong `dist/licenses`. Mã nguồn: https://github.com/Vanilagy/mediabunny. Encoder AAC dùng bản WASM FFmpeg theo thông tin upstream. Asset được vendor trong repo; `scripts/fetch-frames.py` dùng Python/Pillow để tái tạo asset và mask kỹ thuật khi cần, không phải bước build thường ngày.
