# Mockup_video_iphone

Tạo video mockup iPhone trên trình duyệt, miễn phí và không cần đăng nhập.

**Web:** https://cuongqtx11.github.io/Mockup_video_iphone/

- 13 dòng iPhone 11–16, 45 khung ảnh màu với mask màn hình chính xác.
- Kích thước máy 25–200%, chỉnh vị trí và kéo trực tiếp trên canvas. Trên 100%, máy có thể tràn khỏi khung để tạo góc cận cảnh.
- 18 nền có sẵn: aurora, lụa, ánh đào, neon, hoàng hôn, phong cảnh, studio… hoặc màu/ảnh nền riêng.
- Tối đa 8 lớp chữ. Font Be Vietnam Pro, Playfair Display, Oswald và font hệ thống; mẫu Clean, Editorial, Poster, Neon, Glass, Golden. Đổi màu, cỡ, kéo giãn ngang/dọc, khoảng cách, độ đậm, căn dòng, xoay và kéo vị trí.
- Hiệu ứng chữ: bóng, viền, phát sáng, ánh vàng, nền kính. Chuyển động: hiện dần, trượt lên, phóng nhẹ, lơ lửng, nhấp nháy nhẹ, gõ chữ. Chữ và chuyển động được vẽ vào video xuất theo thời gian từng khung hình.
- HD 720p, HD+ 900p, Full HD 1080p, QHD 1440p, UHD 2160p / 4K; 30/60 fps; 9:16, 1:1, 16:9. Kích thước pixel được hiển thị trước khi xuất.

## Xuất và lưu vào máy

**Không giữ toàn bộ bản xuất trong RAM, không upload video lên server.** Trình duyệt vẫn cần RAM cho khung hình, bộ mã hóa và các đoạn ghi nhỏ.

1. Chrome/Edge máy tính: chế độ Tự động mở bộ chọn tệp trước khi xuất, ghi từng phần vào tệp đã chọn. Hoàn tất là tệp đã có trên máy. Hủy xuất sẽ abort để giữ tệp cũ nếu chọn ghi đè.
2. Safari/iPhone và trình duyệt không có showSaveFilePicker: ghi vào tệp cục bộ OPFS, sau đó dùng bảng chia sẻ để Lưu vào Tệp hoặc Lưu video vào Ảnh. Safari mới dùng createWritable; bản cũ có thể dùng createSyncAccessHandle trong dedicated worker khi API có sẵn.
3. Tải từ tệp tạm qua service worker cùng origin, Content-Disposition và HTTP Range; không đọc toàn bộ video bằng arrayBuffer để tải. Khi service worker không khả dụng, dùng URL trỏ vào File đã ghi trên máy.
4. Đường dự phòng MediaRecorder cũng ghi các đoạn ngắn vào tệp, không gom danh sách chunk của cả video trong RAM. MP4 được chuẩn hóa âm thanh AAC trên tệp khi môi trường hỗ trợ.

MP4 H.264/AAC được ưu tiên. Máy không mã hóa được H.264 có thể xuất WebM; WebM lưu được vào Tệp nhưng có thể không nhập trực tiếp vào Ảnh iPhone. Safari chưa hỗ trợ bộ chọn tệp ghi trực tiếp như Chrome; không thể tự ghi vào thư viện Ảnh mà không có thao tác người dùng trong bảng chia sẻ.

Bản xuất gần nhất vẫn có thể tải/chia sẻ sau khi đóng hộp thoại. Giữ trang mở khi xuất hoặc tải từ tệp cục bộ. Các tệp OPFS chỉ nằm trong dữ liệu trang trên thiết bị; bản trước được dọn sau khoảng 2 phút khi có bản mới. Đóng trình duyệt đột ngột có thể để lại tệp tạm; xóa dữ liệu trang sẽ dọn chúng.

## Chạy và kiểm tra

```sh
npm ci
npm run check
npm run build
python3 -m http.server 8766 --directory dist
```

Mở http://localhost:8766. Các bài kiểm tra dùng playwright-core và Chromium có sẵn:

- `qa.mjs`: xem trước, tỷ lệ, xuất/tải từ tệp, ghi trực tiếp, MediaRecorder, hủy xuất, bố cục mobile.
- `qa-highres.mjs`: các mức HD đến 4K, xuất 4K thật, tải lại và chia sẻ File, các khung máy.
- `qa-editor.mjs`: scale 200%, nền, font/mẫu chữ, kéo giãn và kéo vị trí, nhiều lớp chữ, xuất chữ động, Range và đường ghi bằng worker.

Video thử tự tạo ở `test-results/input.mp4` (360×780, 2s, H.264/AAC) và `test-results/short.mp4` (0.3s). Thư mục test-results không được commit/deploy. Kiểm tra iOS thật vẫn cần thiết vì mô phỏng API trên Chromium không phải Safari.

## GitHub Pages

`.github/workflows/pages.yml` tự build và deploy dist khi push main. Settings → Pages dùng GitHub Actions. URL tương đối và worker đều hỗ trợ project subpath `/Mockup_video_iphone/`. Không backend, khóa API hoặc tài khoản ChatGPT. Service worker chỉ phục vụ tệp video cục bộ, không cache HTML/JS của app.

## Giới hạn

Tốc độ và độ phân giải tối đa phụ thuộc máy, codec nguồn và trình duyệt. Tăng độ phân giải xuất không khôi phục chi tiết video gốc không có. Giữ trang mở cho đường ghi theo thời gian thực. Các API ghi tệp và chia sẻ có mức hỗ trợ khác nhau; app kiểm tra API và báo lỗi cụ thể khi không thể mở tệp.

## Tài nguyên và giấy phép

Khung lấy từ [device-frames-media](https://github.com/jonnyjackson26/device-frames-media/tree/551098a1f40ce33e6376ab9fdcad2d0756d5a47c), có artwork từ [Apple Design Resources](https://developer.apple.com/design/resources/) và tác giả upstream. `dist/assets/frames/SOURCE.txt` ghi nguồn. Apple/iPhone là nhãn hiệu Apple; dự án không thuộc Apple. Không gán giấy phép mã ứng dụng cho artwork bên thứ ba.

Font từ [Google Fonts](https://github.com/google/fonts), có giấy phép OFL đi kèm tại dist/assets/fonts. Nền được tạo bằng Canvas. Mediabunny/AAC encoder dùng MPL-2.0, giấy phép trong dist/licenses; nguồn: https://github.com/Vanilagy/mediabunny. AAC encoder dùng WASM FFmpeg theo upstream. `scripts/fetch-frames.py` tái tạo asset/mask khi cần, không nằm trong bước build thường ngày.
