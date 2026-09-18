# Prompt dùng với coding agent — Plane Page Editor

Đặt `CHANGE_IMPACT.md` trong repo tại:

```text
docs/changes/page-editor-task-whiteboard/CHANGE_IMPACT.md
```

## 0. Chuẩn bị trước khi giao (đang ở nhánh `main`)

```text
Tôi sẽ giao cho bạn 2 file để bắt đầu công việc:
- CHANGE_IMPACT.md
- IMPLEMENTATION_PROMPTS.md

Đích cuối cùng trong repo:
docs/changes/page-editor-task-whiteboard/CHANGE_IMPACT.md
docs/changes/page-editor-task-whiteboard/IMPLEMENTATION_PROMPTS.md

Bây giờ CHỈ làm bước chuẩn bị. CHƯA đối chiếu kỹ thuật, CHƯA code.

Hãy:
1. Xác nhận remote origin, branch hiện tại và HEAD commit. Tôi báo trước là
   đang ở nhánh `main` — tự kiểm tra lại bằng `git branch --show-current` và
   `git log -1`, không tin lời tôi nói mà không xác minh.
2. Chạy `git status`. Nếu có working-tree changes chưa commit, DỪNG lại và
   báo cho tôi — không tự stash/commit/reset để "làm sạch" trước khi bắt đầu.
3. CHANGE_IMPACT.md được viết dựa trên nhánh `preview`, commit
   `174243b565e483e24f057cf9add9fe59a9f818c3` của repo `cuoicungtui/plane`.
   Nhánh `main` hiện tại có thể đã tiến xa hơn mốc đó. Với mỗi file được
   trích dẫn ở mục 13 của tài liệu (S02–S21, đường dẫn kèm sẵn), hãy đọc
   bản trên `main` (HEAD hiện tại) và so với nội dung/trích dẫn trong tài
   liệu. Với mỗi phát hiện F01–F15 ở mục 1, ghi rõ một trong ba: "vẫn đúng
   trên main", "khác trên main (nêu khác gì, kèm đường dẫn/dòng)", hoặc
   "chưa kiểm tra được — vì sao". Không suy đoán nếu chưa đọc trực tiếp.
4. Tạo thư mục và đặt 2 file vào đúng đường dẫn nêu trên. Chưa commit — để
   tôi xem lại diff trước.
5. Các quyết định D04, D08, D09, BOARD-07 trong tài liệu đã được tôi duyệt
   (có ghi người duyệt + ngày trong file) — coi là chốt, KHÔNG phải phần
   cần bạn review hay đề xuất lựa chọn khác ở bước này hay bất kỳ bước sau.

Báo lại cho tôi: branch/HEAD/remote, working-tree status, kết quả so sánh
F01–F15 với `main`, và xác nhận vị trí 2 file đã được đặt. Chưa chạy G0–G4
đầy đủ hay code trong lượt này — việc đó làm ở Prompt 1 kế tiếp, chỉ chạy
sau khi tôi xem qua kết quả bước này.
```

## 1. Đối chiếu tại checkout trước khi code

```text
Tôi muốn thêm /task và /board vào Plane Page theo tài liệu:
docs/changes/page-editor-task-whiteboard/CHANGE_IMPACT.md

Repo: https://github.com/cuoicungtui/plane

Lúc này chỉ đọc source, đối chiếu và cập nhật tài liệu; chưa viết code tính năng,
chưa cài/nâng dependency, chạy migration hoặc deploy.

Hãy:
- Đọc toàn bộ tài liệu và ghi lại branch, HEAD, remote, working-tree changes.
  Không reset hoặc ghi đè thay đổi đang có. Xác nhận đây có đúng là nhánh
  mà tính năng sẽ được code thật hay không — không giả định "main" hay
  "preview" là đúng chỉ vì tài liệu nhắc tới; tự kiểm tra bằng `git branch`,
  `git log` và so với ghi chú G0 trong tài liệu.
- Hoàn thành G0–G4 bằng source thực tế. Đừng dừng ở README hoặc chỉ đọc
  những file đã nêu; tìm call sites và dependency có liên quan.
- G3 phải trả lời được F15: Page có `is_global=True` hoặc thuộc nhiều
  project thì frontend hiện tại gọi API bằng `project_id` nào? Ghi rõ
  file/function tìm được; đây là điều kiện để chốt route API whiteboard.
- D08 và BOARD-07 trong tài liệu đã ĐÃ DUYỆT (không phải điều cần review lại):
  duplicate Page tạo board độc lập; copy 1 block board sang Page khác phải
  bị chặn với thông báo rõ; whiteboard v1 cho phép ảnh/upload qua asset
  backend (MinIO) sẵn có. Đừng đề xuất lại các lựa chọn khác cho 2 mục này.
- Xác minh luồng Page/Yjs → apps/live → API → database, extension work-item
  hiện hữu, sanitizer, quyền, assets, duplicate, restore, copy/paste,
  read-only và export.
- Nếu source khác tài liệu, ghi sự khác biệt và evidence file + function;
  cập nhật HIỆN TRẠNG, không tự sửa code để khớp giả định cũ.
- Bổ sung tên model, route, file mới dự kiến, migration dependency, test
  runner và các vị trí IMP còn chưa xác định. Tái sử dụng trước khi tạo mới.
- Tách điều đã xác nhận, thiết kế đề xuất và điều cần kiểm tra runtime.
  Không suy đoán dữ liệu production từ model trong repo.

Trả về bản CHANGE_IMPACT.md đã cập nhật và một bản tóm tắt:
đã xác nhận gì, khác biệt gì, quyết định nào cần tôi duyệt trước khi code.
Chưa triển khai tính năng trong lượt này.
```

## 2. Triển khai sau khi đã duyệt bản tài liệu cập nhật

```text
Tôi đồng ý triển khai phương án v1 trong bản CHANGE_IMPACT.md đã duyệt tại:
docs/changes/page-editor-task-whiteboard/CHANGE_IMPACT.md

Trước khi code, xác nhận tài liệu đang dùng và kiểm tra HEAD/diff có thay đổi
so với lượt review không. Nếu có khác biệt ảnh hưởng thiết kế, cập nhật phân tích trước; không coi việc tôi duyệt bản cũ là duyệt cả thay đổi mới.

Nếu mục G2 hoặc câu hỏi F15 trong tài liệu còn để trống hoặc CHƯA XÁC MINH,
dừng lại và làm rõ trước (quay lại như prompt đối chiếu ở bước 1), không tự
chuyển sang code khi bằng chứng chưa đủ.

D08 và BOARD-07 đã được tôi duyệt cụ thể — coi là chốt, không đề xuất lại:
- Duplicate Page → board bản sao độc lập, không dùng chung với gốc.
- Copy 1 block whiteboard sang Page khác → chặn, báo lỗi rõ ràng.
- Whiteboard v1 → cho phép ảnh/upload qua asset backend (MinIO) hiện có,
  nhưng vẫn phải chạy và đạt T12 trước khi coi là hoàn thành.

Triển khai lần lượt theo P1–P6, không mở rộng phạm vi.
Giữ @plane/editor và pipeline Page hiện có; ưu tiên tái sử dụng work-item embed.
Không đưa scene whiteboard vào nội dung Page hoặc import canvas vào server.

Với mỗi nhóm sửa:
1. Ghi rõ các mã D/TASK/BOARD, IMP, AC và T liên quan.
2. Đối chiếu file/call site thực tế, cập nhật phát hiện mới trước khi sửa.
3. Thực hiện thay đổi nhỏ, chạy kiểm tra phù hợp, ghi kết quả và bằng chứng.
4. Không tự thay API/DB contract, quyền, vòng đời dữ liệu hoặc scope đã duyệt.
   Những thay đổi đó cần duyệt riêng; tự sửa spec không phải tự cấp phép.

Không đánh dấu PASS khi chưa chạy test. Ghi rõ test chưa chạy và lý do.
Không xóa/reset thay đổi của người khác. Không tự deploy production,
chạy migration trên dữ liệu thật hoặc xóa dữ liệu để làm test qua.

Khi bàn giao, cập nhật bảng đối chiếu trong CHANGE_IMPACT.md:
yêu cầu → file/commit thực sửa → test/bằng chứng → khác biệt → kết luận.
Liệt kê rõ phần chưa đạt, test chưa chạy và rủi ro còn lại.
```
