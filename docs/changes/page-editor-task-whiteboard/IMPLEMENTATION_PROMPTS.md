# Prompt dùng với coding agent — Plane Page Editor

Tài liệu đối chiếu: `docs/changes/page-editor-task-whiteboard/CHANGE_IMPACT.md` (bản 0.3).

Bản 0.3 **thay thế** bản 0.2 ở phần task và phần hiển thị board. Mọi prompt dưới đây đều bám bản 0.3.

---

## 0. Trước khi làm bất cứ việc gì

```text
Đọc docs/changes/page-editor-task-whiteboard/CHANGE_IMPACT.md bản 0.3.

Trước khi sửa bất cứ dòng code nào:
1. Chạy `git branch --show-current`, `git log -1`, `git status`. Xác nhận đang ở đúng
   nhánh sẽ code thật. Nếu có thay đổi chưa commit, DỪNG lại và báo cho tôi —
   không tự stash/reset/commit để "làm sạch".
2. Đọc mục 11 (Quy trình dev bắt buộc). Nếu bạn sửa bất cứ file nào trong
   packages/editor/src mà không build lại package + xoá cache Vite + restart
   container, thay đổi của bạn SẼ KHÔNG có tác dụng và bạn sẽ đi tìm nhầm lỗi.
   Đây là chuyện đã xảy ra thật, mất nhiều giờ.
3. Đọc mục 7 (rủi ro đang mở). R01 và R02 là hai lỗi đã xác nhận, phải sửa ở P0
   trước khi làm tính năng mới.

Báo lại: branch/HEAD, working-tree status, và xác nhận bạn đã hiểu mục 11.
```

## 1. Hoàn thành P0 — đóng hai lỗi đang mở và bốn gate

```text
Làm đúng bước P0 trong mục 9 của CHANGE_IMPACT.md. Chưa làm tính năng mới.

Sửa hai lỗi:
- R01 (page-task-embed-picker.tsx:31): code giữ {from,to} bắt lúc gõ /task rồi
  dùng lại sau khi modal đóng, nên chọn task xong không chèn được gì. Sửa theo
  D05: luôn chèn node vào tài liệu TRƯỚC, rồi mới điền ID vào. Không vá bằng
  cách tính lại offset.
- R02 (page-whiteboard-embed.tsx:66): scene gửi lên server đang kèm dataURL
  base64 của từng ảnh. Lọc bỏ trước khi gửi; load() đã tự dựng lại ảnh từ asset
  backend nên server không cần giữ base64.

Hoàn thành G1–G4 trong mục 8 bằng source thật:
- G1: tìm component/hook có sẵn cho member picker, date picker, và cách lấy
  trạng thái thuộc nhóm completed của project. Ưu tiên tái sử dụng.
- G2: dựng một bản thử tối thiểu nhúng Excalidraw inline trong ProseMirror node
  view, kiểm tra phím tắt/selection/cuộn/kéo thả không xung đột. Phải chạy thật,
  không suy luận.
- G3: truy vết read-only editor, version restore, copy/paste, export PDF/HTML
  cho issue-embed-component và whiteboard-embed-component.
- G4: xác định app đã có sự kiện/store cập nhật work item chưa, hay phải dùng
  refetch khi focus.

Với mỗi mục, ghi tên file và function cụ thể. Không ghi "không có" chỉ vì chưa
tìm thấy.

Trả về: hai lỗi đã sửa kèm test tái hiện (T03 cho R01, T08 cho R02), kết quả
G1–G4, và những chỗ source khác với tài liệu.
```

## 2. Triển khai P1 — dòng task inline

```text
Làm bước P1 trong mục 9. Bám mục 3.1 (TASK-01 đến TASK-09).

Những điều KHÔNG được làm khác đi:
- Giữ nguyên tên node issue-embed-component và tên các attrs hiện có (F04).
  Trang cũ đã có dữ liệu dùng node này; đổi tên là phá nội dung cũ.
- Tài liệu chỉ lưu ID. Không lưu tiêu đề, trạng thái, người thực hiện hay hạn
  vào trong doc dưới bất kỳ hình thức nào (D02).
- Mọi thay đổi task đi từ trình duyệt qua IssueService nội bộ, bằng quyền của
  người đang thao tác (D04, F12). Không dùng apps/live để sửa work item.
  Không dùng REST API công khai work-items.
- Luôn chèn node trước, điền ID sau (D05). Không giữ offset qua request async.
- Bỏ dở dòng nháp thì xoá node, không để lại task rác (TASK-02).
- Hạn chỉ theo ngày. Không thêm giờ, không làm chuông nhắc (D07).

Với mỗi nhóm sửa: ghi rõ mã D/TASK/IMP/AC/T liên quan, đối chiếu file thật
trước khi sửa, thay đổi nhỏ, chạy kiểm tra, ghi kết quả.

Không đánh dấu test ĐẠT khi chưa chạy. Không tự đổi contract API/DB/quyền/
vòng đời dữ liệu — những thay đổi đó cần duyệt riêng.
```

## 3. Triển khai P2 — board canvas trong trang

```text
Làm bước P2 trong mục 9. Bám mục 3.2 (BOARD-01 đến BOARD-09).

Backend board đã xong và đã đạt, GIỮ NGUYÊN: model, API, revision, idempotent
create, kiểm tra quyền, duplicate + copy asset + remap. Đừng viết lại.

Việc của đợt này chỉ ở phía hiển thị:
- Bỏ modal. Canvas render ngay trong luồng nội dung trang (D09).
- Thêm attr height, kéo được, lưu vào node (BOARD-04).
- Chế độ chỉ đọc hiển thị canvas không sửa được.
- Cách ly thao tác canvas khỏi phím tắt và selection của ProseMirror (G2).
- Cấu hình headless dùng cho apps/live tuyệt đối không import Excalidraw hay
  API trình duyệt (BOARD-01).

Chưa làm: vẽ realtime nhiều người, khay mẫu kéo thả. Hai thứ này ngoài v1.
```

## 4. Khi bàn giao

```text
Cập nhật bảng bàn giao cuối CHANGE_IMPACT.md:
yêu cầu → file/commit thật đã sửa → test và bằng chứng → khác biệt với thiết kế
→ kết luận.

Liệt kê rõ: test chưa chạy và lý do, lỗi có sẵn không thuộc phạm vi, rủi ro còn
lại. Không báo DONE khi AC chưa có bằng chứng.

Nhắc lại: nếu bạn sửa packages/editor/src, phải build lại + xoá cache Vite +
restart container trước khi kết luận bất cứ điều gì về hành vi chạy thật
(mục 11).
```
