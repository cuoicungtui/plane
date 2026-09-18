# CHANGE IMPACT — Plane Page Editor: Task và Whiteboard

**Mã thay đổi:** PAGE-EMBED-001  
**Ngày lập:** 18/09/2026  
**Phiên bản tài liệu:** 0.2 — một số quyết định (D04, D08, D09, BOARD-07) đã được duyệt; phần còn lại vẫn DRAFT, chờ review  
**Repository:** `cuoicungtui/plane`  
**Mốc source đã truy vấn:** nhánh `preview`, commit `174243b565e483e24f057cf9add9fe59a9f818c3`  
**Phạm vi kiểm chứng:** đọc source qua GitHub; chưa chạy ứng dụng, test, migration hoặc truy cập database đang vận hành.  
**Người duyệt các quyết định đã chốt (D04, D08, D09, BOARD-07):** tuongdangvuongquoc901@gmail.com, 19/09/2026.

> Dùng tài liệu này làm mốc đối chiếu khi code. Phần **HIỆN TRẠNG** mô tả source đã đọc; phần **ĐỀ XUẤT** là thiết kế chưa được phê duyệt. Không coi việc chỉnh tài liệu là tự phê duyệt thay đổi. Source đang triển khai có thể khác mốc trên; phải hoàn thành bước G0 trước khi sửa code.

## 0. Tóm tắt để duyệt

**Mục tiêu:** trong Plane Page, người dùng chèn được task thật và whiteboard tự do, không thay editor hoặc làm hỏng tài liệu cũ.

| Hạng mục | Đề xuất cho phiên bản đầu |
|---|---|
| `/task` | Chọn hoặc tạo work item qua cơ chế Plane hiện có; ưu tiên tái sử dụng `WorkItemEmbedExtensionConfig`. Không tạo một hệ thống task riêng. |
| `/board` | Tạo whiteboard thuộc Page; chèn node giữ ID; scene được lưu riêng ở backend; Page hiển thị preview và mở modal để sửa. |
| Lưu Page | Giữ luồng cộng tác hiện có: binary Yjs → HTML/JSON → API. Không tự chuyển sang ghi trực tiếp `description_json`. |
| Bảo vệ dữ liệu | Schema thêm mới; không chuyển đổi toàn bộ Page cũ. Xóa block không đồng nghĩa xóa task/board. Có kiểm soát ghi đè khi hai tab sửa board. |
| Phạm vi v1 | Chưa cộng tác realtime bên trong canvas; không làm Kanban mới; không nâng cấp Tiptap/React để phục vụ tính năng này. |

**Ba nhóm phải xử lý cùng tính năng:** đường lưu và chuyển đổi tài liệu; quyền truy cập tài nguyên tham chiếu; vòng đời duplicate/undo/restore/export.

**Kết luận thiết kế:** giữ hướng dùng Excalidraw, nhưng tách adapter canvas ở ứng dụng web khỏi cấu hình node dùng trên server. Tái sử dụng work-item embed hiện có, đồng thời kiểm tra sanitizer và renderer thay vì chỉ bật menu.

---

## 1. HIỆN TRẠNG — những gì đã xác nhận từ source

Các mã S bên dưới dẫn tới file nguồn tại đúng commit truy vấn; xem mục 13.

| ID | Phát hiện đã xác nhận | Ý nghĩa đối với thay đổi |
|---|---|---|
| F01 | `Page` có `description_json`, `description_binary`, `description_html`, `description_stripped`; có workspace, owner, access, lock, archive và quan hệ nhiều-nhiều với Project. `PageVersion` cũng có ba dạng nội dung. [S02] | Không suy ra JSON là dữ liệu gốc chỉ từ tên cột. Không mặc định mỗi Page chỉ thuộc một Project. |
| F02 | `PageEditorBody` dùng `CollaborativeDocumentEditorWithRef`, truyền `isContentEditable`, realtime config, mention handler, file handler và `extendedEditorProps`. [S03] | Đây là một điểm nối nghiệp vụ Page với editor; cần giữ mentions, upload và collaboration. |
| F03 | `apps/live` đọc binary trước. Binary rỗng thì chuyển HTML sang binary. Khi lưu, nó sinh binary base64, HTML và JSON rồi gọi API description. [S08][S09] | Trong đường cộng tác này, binary là đầu vào ưu tiên. Kết luận không tự động áp dụng cho mọi import/API bên ngoài chưa truy vết. |
| F04 | `yjs-utils.ts` xây document schema từ `CoreEditorExtensionsWithoutProps` và `DocumentEditorExtensionsWithoutProps`, rồi chuyển Yjs ↔ ProseMirror/HTML. [S06][S07] | Node mới cần cấu hình headless dùng chung, không chỉ React Node View. |
| F05 | Đã có `WorkItemEmbedExtensionConfig`: block/atom với `entity_identifier`, `project_identifier`, `workspace_identifier`, `id`, `entity_name`; HTML tag là `issue-embed-component`. React wrapper gọi `widgetCallback` bằng các ID. [S04][S05] | Có nền tảng tái sử dụng cho `/task`; việc tồn tại extension không chứng minh chức năng đã được bật hoàn chỉnh trong Page UI. |
| F06 | `useExtendedEditorProps` trong nhánh core đang trả `{}`. `DocumentEditorAdditionalExtensions` đang đăng ký slash commands. [S15][S16] | Có điểm mở rộng phù hợp; cần nối callback nghiệp vụ, không đẩy API Plane vào package editor. |
| F07 | To-do list trong slash menu đã có từ khóa tìm kiếm `task`. Menu có cơ chế nhận additional options. [S13] | `/task` cần phân biệt work item với checklist, tránh hai lựa chọn nhập nhằng. |
| F08 | `PagesDescriptionViewSet` kiểm tra lock/archive, dùng `PageBinaryUpdateSerializer`, gọi task nền ghi log và version. Serializer kiểm tra/sanitize HTML. [S10][S11] | Tác động không dừng ở lưu một trường dữ liệu. |
| F09 | `content_validator.py` sử dụng nh3. Danh sách custom tags đã đọc có mentions/images nhưng không liệt kê `issue-embed-component`; allowlist attributes cũng chưa khai báo riêng cho work-item embed. [S12] | Rủi ro tĩnh: custom tag/attrs bị loại ở đường HTML. Phải tái hiện bằng test; chưa khẳng định đã quan sát mất dữ liệu trên server thật. |
| F10 | Duplicate Page đặt `description_binary = None`, giữ bản nội dung để tái dựng và gọi job sao chép asset. [S10] | HTML round-trip và remap board ID là bắt buộc khi duplicate. |
| F11 | `page_transaction_task.py` hiện khai báo component map cho mention và image. [S17] | Không mặc định task/board embed đã được ghi log hay lập chỉ mục tham chiếu đầy đủ. |
| F12 | PDF có node-renderer registry. Nhánh fallback trả children, hoặc View rỗng khi node lạ không có children. [S18] | Node atom mới có nguy cơ biến mất khỏi PDF nếu không có renderer/fallback rõ ràng. |
| F13 | `IssueService` có `createIssue`, `retrieve`, `retrieveIssues` và các phương thức lấy danh sách work item. [S14] | Ưu tiên service hiện hữu; nhóm request theo project khi cần nhiều task để tránh gọi riêng từng node. |
| F14 | Catalog khai báo Tiptap `^2.22.3`, `tiptap-markdown` `^0.8.10`, React/React DOM `19.2.8`; package editor dùng catalog và peer React `^19.0.0`. Đây là cấu hình khai báo, chưa đối chiếu bản thực cài trong lockfile/runtime. [S19][S20] | Không lấy tài liệu Markdown đời khác làm bằng chứng cho hành vi hiện tại. Pin phiên bản Excalidraw tương thích sau khi kiểm tra lockfile. |
| F15 | `Page` có `is_global` (boolean) và `projects` là ManyToMany — một Page có thể không thuộc project nào hoặc thuộc nhiều project. Nhưng toàn bộ route API Page đọc được trong `apps/api/plane/app/urls/page.py` đều bắt buộc `project_id` trong path; không thấy route Page cấp workspace riêng cho trường hợp `is_global=True` hoặc nhiều project. **CHƯA XÁC MINH** frontend hiện tại chọn `project_id` nào để gọi API cho các Page này. | Route whiteboard đề xuất ở mục 5 (nested dưới `projects/{projectId}/pages/{pageId}/`) chỉ đúng nếu Page mục tiêu luôn có một `project_id` xác định để dùng. Phải điều tra xong ở G3 trước khi chốt route whiteboard; nếu không, route có thể sai cho Page global/đa-project. |

### Luồng Page đang có

```text
Người dùng chỉnh Page
  → PageEditorBody
  → CollaborativeDocumentEditorWithRef / tài liệu Yjs
  → Hocuspocus trong apps/live
  → storeDocument
  → getAllDocumentFormatsFromDocumentEditorBinaryData
  → PageCoreService.updateDescriptionBinary
  → PATCH .../pages/{pageId}/description/
  → PagesDescriptionViewSet + PageBinaryUpdateSerializer
  → Page: binary + HTML + JSON
  → page_transaction / track_page_version
```

Đường tải: lấy binary; nếu rỗng, lấy HTML rồi chuyển thành binary và lưu lại. Đây là luồng đã truy vết từ các file trên, chưa bao trùm mọi đường import, offline fallback hoặc công cụ ghi API trực tiếp. [S03][S07][S08][S09][S10]

---

## 2. Phạm vi và các quyết định ĐỀ XUẤT

| ID | Quyết định đề xuất | Không bao gồm / giới hạn |
|---|---|---|
| D01 | Giữ `@plane/editor`, Tiptap/ProseMirror và pipeline Page hiện tại. | Không thay editor, không đổi nguồn dữ liệu Page sang JSON thuần. |
| D02 | `/task` có hai thao tác: chọn task có sẵn hoặc tạo mới; kết quả là tham chiếu task. | Không biến checklist thành task; không thay đổi ý nghĩa `@user`; chưa sửa trạng thái task trực tiếp trong block. |
| D03 | Dùng `@excalidraw/excalidraw` cho canvas v1; mở bằng modal phía client. | Không tích hợp tldraw/React Flow đồng thời; không thêm realtime canvas. |
| D04 — **ĐÃ DUYỆT 19/09/2026** | Mỗi board thuộc một Page trong một workspace; nhiều block trong cùng Page có thể trỏ cùng board. | Chưa có board dùng chung để chỉnh sửa giữa nhiều Page ở v1. Muốn có board dùng chung nhiều Page phải xin duyệt riêng ở đợt sau, không tự mở lại quyết định này khi code. |
| D05 | Scene lưu riêng; node chỉ giữ ID/phiên bản cấu trúc. | Không đưa scene, base64 ảnh, token, URL ký tạm thời hay trạng thái con trỏ vào nội dung Page. |
| D06 | Người đọc/sửa board phải thỏa quyền Page hiện hành; server kiểm tra mỗi request. | Xem được Page không tự cấp quyền xem task được nhúng. |
| D07 | Gỡ block, undo và redo chỉ tác động liên kết trong tài liệu. | Không tự xóa task/board vì block biến mất trong một lần autosave. |
| D08 — **ĐÃ DUYỆT 19/09/2026** | Duplicate Page tạo bản sao board độc lập, không dùng chung board với bản gốc; ID board bản sao được thay mới hoàn toàn. Copy riêng một block whiteboard sang Page khác: **chặn, báo lỗi rõ ràng cho người dùng** (ví dụ "Chưa hỗ trợ copy whiteboard sang trang khác") — không tự tạo liên kết về board nguồn, không tự tạo board mới ngầm. | Không âm thầm để hai Page sửa cùng một board. Muốn hỗ trợ copy board sang Page khác ở đợt sau phải xin duyệt UX riêng, không tự mở lại quyết định này giữa lúc code. |
| D09 — **ĐÃ DUYỆT 19/09/2026** | Khôi phục phiên bản Page khôi phục bố cục và tham chiếu. Trong v1, tham chiếu board mở scene đã lưu mới nhất — **không phải bản vẽ đúng thời điểm version đó**. UI phải hiển thị rõ điều này cho người dùng khi họ khôi phục một version Page có chứa board (ví dụ ghi chú "whiteboard hiển thị bản mới nhất, không theo lịch sử version của trang"). | Không cam kết lịch sử Page là lịch sử scene board. Muốn khôi phục chính xác scene theo thời điểm phải bổ sung versioning board và phạm vi riêng — không nằm trong v1, không tự làm thêm khi chưa duyệt. |
| D10 | PDF/HTML/Markdown có fallback đọc được cho task/board. | Markdown không cam kết round-trip lossless; export không được làm biến đổi tài liệu nguồn. |

**Điểm sản phẩm cần hiểu đúng:** whiteboard v1 gồm hình, chữ, đường nối và thao tác vẽ theo thư viện đã chọn. “Bảng” dạng lưới chỉnh sửa như spreadsheet bên trong canvas chưa được xác nhận; không coi bảng của Page là bảng của whiteboard. Không cam kết tương đương toàn bộ Lark Board.

Excalidraw cung cấp React component, props nhận dữ liệu ban đầu/thay đổi và chế độ xem; ứng dụng chủ vẫn phải triển khai persistence, quyền và xử lý lỗi. Tài liệu props mô tả `onChange(elements, appState, files)`. [E01][E02] Kho Excalidraw công bố MIT; giữ thông báo giấy phép và kiểm tra bản package thực cài trước khi phát hành. [E05]

---

## 3. Hợp đồng hành vi và dữ liệu

### 3.1 TASK — tái sử dụng tài nguyên có sẵn

```text
/task → chọn/tạo work item → API thành công và có ID thật
      → kiểm tra Page còn mở và còn quyền sửa
      → chèn WorkItemEmbed theo convention hiện có
      → Page lưu qua collaboration hiện có
      → block lấy thông tin task qua service có kiểm tra quyền
```

**TASK-01:** Không tạo bảng `tasks` mới. Giữ node type theo `CORE_EXTENSIONS.WORK_ITEM_EMBED`; không đổi tên node/tag cũ. Các attrs hiện hữu phải được giữ đúng ý nghĩa. `id` của block là định danh instance, không phải ID task. [S04][S05]

**TASK-02:** Title, status và assignee hiển thị lấy từ work item hiện tại; không coi bản chụp trong Page là dữ liệu nghiệp vụ. Có trạng thái loading, không có quyền/không truy cập được, và lỗi mạng. Không hiển thị chi tiết task từ cache của người dùng/workspace khác.

**TASK-03:** API tạo lỗi hoặc người dùng hủy thì không chèn tham chiếu hỏng. Tạo task thành công nhưng chèn/lưu Page thất bại thì giữ task, hiện liên kết và cho thử chèn lại; không tạo lại task hoặc tự xóa task. Chưa xác nhận API task hỗ trợ idempotency: không tự retry POST khi chưa biết request trước đã thành công hay chưa.

**TASK-04:** Khi modal mở, người khác vẫn có thể chỉnh Page. Vị trí chèn cần theo bookmark/transaction mapping hoặc cơ chế neo phù hợp với editor hiện tại; không giữ một số offset rồi dùng lại sau một request bất đồng bộ. Chuyển Page hoặc mất quyền trong lúc chờ phải hủy thao tác chèn.

**TASK-05:** Slash menu thể hiện rõ “Task / Work item” và “Checklist / To-do list”. Kiểm tra thứ tự tìm kiếm với `task`, `todo`, `checkbox`; không phá shortcut checklist cũ.

### 3.2 BOARD — node tham chiếu mới

Tên dưới đây là **đề xuất**, chưa tồn tại trong source đã đọc:

```json
{
  "type": "whiteboardEmbed",
  "attrs": {
    "id": "<UUID của block>",
    "board_id": "<UUID của board>",
    "schema_version": 1
  }
}
```

HTML nội bộ đề xuất: `whiteboard-embed-component` với đúng các attrs trên. Schema headless, parser HTML, serializer và sanitizer phải dùng cùng contract. Không chèn trực tiếp một JSON node bằng cách PATCH riêng `description_json`.

**BOARD-01:** React Node View chỉ hiển thị preview/trạng thái và gọi callback mở board. Excalidraw cùng phần gọi API đặt tại ứng dụng web; cấu hình node dùng bởi `apps/live` không import canvas/browser APIs.

**BOARD-02:** Tạo board thành công rồi mới chèn node. API tạo board dùng `creation_key` ổn định cho lần tạo để retry không sinh board trùng. Nếu chèn node thất bại, cho nối lại board đã tạo; không tự xóa tài nguyên có thể đang được tham chiếu.

**BOARD-03:** Nội dung board gồm scene và phần app state cần giữ lâu dài. Không lưu toàn bộ app state UI, selection, collaborators hay trạng thái modal. Phải bảo toàn các thuộc tính scene cần thiết của đúng phiên bản thư viện, không tự “lọc gọn” gây mất binding. Tài liệu Excalidraw có tiện ích serialize/restore; kiểm tra chữ ký thực tế của phiên bản đã pin. [E02][E03]

**BOARD-04:** Bản đầu không realtime nhưng vẫn có thể bị hai tab/người dùng cùng lưu. Mỗi lần ghi phải kèm `expected_revision`; server kiểm tra và tăng revision nguyên tử. Không dùng timestamp client làm khóa và không tự ghi đè khi xung đột.

**BOARD-05:** Trạng thái UI: loading → ready → dirty → saving → saved; thêm save-error, conflict, read-only và unavailable. Chỉ báo “Đã lưu” sau khi server xác nhận đúng lần lưu. Đóng modal khi dirty phải lưu xong hoặc hỏi bỏ thay đổi; không trông chờ `beforeunload` để bảo đảm lưu.

**BOARD-06:** Preview là dữ liệu dẫn xuất theo `preview_revision`, không phải scene gốc. Preview lỗi không làm mất scene đã lưu. Preview cũ phải được nhận diện; phản hồi đến trễ không được thay thế preview của revision mới hơn.

**BOARD-07 — ĐÃ DUYỆT 19/09/2026:** Cho phép ảnh/upload trong whiteboard từ v1 — hệ thống đã có MinIO và database cho asset backend nên điều kiện tiên quyết đã đủ. Ảnh phải lưu bền vững qua asset backend hiện có (không nhúng base64 vào `scene`), khôi phục đúng mapping file ID khi mở lại, không dùng URL ký tạm thời làm địa chỉ vĩnh viễn. Quyết định mở tính năng không thay cho việc kiểm thử: T12 (ảnh qua session mới, URL hết hạn, đúng quyền/revision) vẫn phải chạy và đạt trước khi coi BOARD-07 là hoàn thành.

**BOARD-08:** Không bật tùy ý iframe, tải scene từ URL ngoài hoặc chia sẻ qua dịch vụ hosted. Kiểm tra link, upload, preview và font/assets cho môi trường self-host. Tài liệu Excalidraw có cơ chế tự phục vụ font; cần kiểm tra cấu hình thay vì mặc định phụ thuộc CDN. [E01]

---

## 4. Database impact — ĐỀ XUẤT

### 4.1 Điều giữ nguyên

Không đổi/xóa cột nội dung Page; không backfill toàn bộ Page cũ; không thay schema work item chỉ để nhúng task. Chưa có bằng chứng cần một bảng quan hệ Page–Task riêng: node reference đủ cho yêu cầu hiển thị ban đầu. Nếu cần báo cáo “task sinh từ Page nào”, phải ghi thêm yêu cầu và truy vết metadata/quan hệ hiện hữu trước khi thêm bảng.

### 4.2 Tài nguyên whiteboard mới

Trước khi tạo model, hoàn thành G2 để xác nhận không có model tương đương cần tái sử dụng. Các trường dưới đây là thiết kế logic, không phải migration đã viết:

| Trường | Mục đích / quy tắc |
|---|---|
| `id` | UUID board, không trùng với UUID block. |
| `workspace_id` | Khớp workspace của Page, do server xác định. |
| `page_id` | Page sở hữu. Không gán tùy ý `project_id` cố định vì Page có quan hệ nhiều Project. |
| `engine`, `schema_version` | Nhận diện định dạng scene và hỗ trợ chuyển đổi trong tương lai. |
| `scene` | JSONField cho dữ liệu canvas và app state bền vững đã xác thực; không nhét bytes ảnh. |
| `revision` | Số phiên bản do server quản lý, dùng kiểm soát ghi đồng thời. |
| `creation_key` | UUID cho một yêu cầu tạo; unique cùng Page để chống tạo trùng do retry. |
| `preview_asset_id`, `preview_revision` | Tham chiếu preview tùy chọn; kiểu FK chốt sau khi kiểm tra asset model. |
| Trường audit/xóa mềm | Tái sử dụng BaseModel/convention thực tế; chưa tự định nghĩa một hệ thống audit mới. |

Index tối thiểu phục vụ tra cứu theo Page/workspace và constraint chống trùng creation key. Mọi truy cập phải xác minh chuỗi workspace → Page → board. Không có FK database nào thay thế được kiểm tra quyền.

**Migration:** chỉ thêm schema whiteboard và cấu trúc phụ thực sự cần. Dùng migration head thực tế của checkout, không tự đặt số migration trong tài liệu. Chạy trên database test có dữ liệu Page cũ; so sánh số lượng và nội dung trước/sau. Kiểm tra transaction, constraint và ảnh hưởng của code cũ trong giai đoạn triển khai.

**Dữ liệu bị gỡ liên kết:** không tự purge khi một autosave không thấy node. Board có thể còn trong undo, lịch sử Page hoặc request đang chạy. Chưa có chính sách retention được duyệt thì giữ lại và ghi nhận tài nguyên chưa liên kết; không xây job xóa tự động trong đợt này.

**Xóa Page:** phải theo quy tắc soft/hard delete thực tế của BaseModel và Page. Board phải không truy cập được khi Page không còn được phép truy cập; việc purge vật lý chỉ sau chính sách retention/backup. Không tùy tiện chọn CASCADE để giải quyết vòng đời.

---

## 5. API và quyền truy cập — ĐỀ XUẤT

### API giữ nguyên

Tái sử dụng `IssueService.createIssue/retrieve/retrieveIssues` và đường Page description đang có. Không đổi request/response cũ nếu không có lý do đã duyệt. Các phương thức service task hiện dựng URL theo workspace, project và `serviceType`; phải dùng service/convention hiện tại, không hardcode một API khác. [S14]

### API whiteboard dự kiến

Namespace cần bám route Page của checkout. Với Project Page, mẫu thiết kế là:

```text
/api/workspaces/{slug}/projects/{projectId}/pages/{pageId}/whiteboards/
```

Đây là **route đề xuất**, không phải endpoint đã tồn tại.

| Thao tác | Hợp đồng tối thiểu |
|---|---|
| `POST collection` | Tạo board với creation key; server xác định Page/workspace, trả ID + revision. Retry cùng key không tạo thêm bản ghi; key cũ với payload mâu thuẫn phải báo lỗi. |
| `GET /{boardId}/` | Trả scene, revision, metadata/preview sau khi kiểm tra quyền. Không tin page/workspace do node cung cấp. |
| `PATCH /{boardId}/` | Nhận scene + expected revision; cập nhật có điều kiện nguyên tử; trả revision mới. Payload sai/missing revision không được ngầm ghi đè. |
| Đường preview/asset | Tái sử dụng asset pipeline nếu quyền/lifecycle phù hợp; xác thực board/Page và revision. Không cho truy cập công khai chỉ vì biết URL. |

Xung đột đề xuất trả `409` cùng mã lỗi ổn định; lỗi payload `400`, lỗi quá giới hạn `413`; `401/403/404` phải theo convention xác thực và chống lộ tài nguyên của repo. Không dùng `404` để phân biệt công khai “board có tồn tại nhưng thuộc workspace khác”.

**Quyền sửa board** phải xét Page editable, owner/access, tư cách thành viên, guest, project archive, Page archive/lock và tình trạng bị xóa theo policy hiện tại. Không chỉ dựa vào nút disabled ở frontend. Khóa Page sau khi modal mở phải khiến lần lưu tiếp theo bị từ chối an toàn.

**Task** được kiểm tra quyền riêng qua API task; quyền đọc Page không mở rộng quyền đọc work item. Export và preview cũng phải tuân theo cùng nguyên tắc, không dùng tài khoản đặc quyền để đưa dữ liệu kín vào Page dễ xem hơn.

---

## 6. Ma trận ảnh hưởng và phạm vi sửa

`SỬA` = dự kiến cần sửa; `KIỂM TRA` = có dependency, chỉ sửa khi có bằng chứng; `MỚI` = vị trí đề xuất, chưa phải file hiện hữu.

| ID | Thành phần / file đã đọc hoặc vị trí dự kiến | Hành động và rủi ro | Test liên quan |
|---|---|---|---|
| IMP01 | `packages/editor/src/extensions/work-item-embed/{extension-config.ts,extension.tsx}` | KIỂM TRA/tái sử dụng; tránh đổi node schema làm hỏng nội dung cũ. | T02,T06 |
| IMP02 | `packages/editor/src/extensions/document-extensions.tsx`; `slash-commands/command-items-list.tsx` | SỬA điểm mở rộng có giới hạn theo Document Editor; phân biệt task/checklist. | T04,T05 |
| IMP03 | `apps/web/core/components/pages/editor/editor-body.tsx`; `hooks/pages/use-extended-editor-extensions.ts` | SỬA nối handlers/Page context; giữ collaboration, mentions, editable và upload. | T01,T05,T07,T10 |
| IMP04 | `packages/editor/src/extensions/whiteboard-embed/` — MỚI | Config headless + Node View mỏng; không import Excalidraw vào đường server. | T06,T16,T17 |
| IMP05 | `packages/editor/src/extensions/core-without-props.ts`; `helpers/yjs-utils.ts` | SỬA registry document schema; kiểm tra converters. Không bắt buộc sửa thuật toán converter nếu đăng ký schema là đủ. | T01,T06,T07 |
| IMP06 | `apps/live/src/extensions/database.ts`; `services/page/core.service.ts` | KIỂM TRA đường lưu/tải và contract; không tạo đường ghi Page mới. | T06,T07,T18 |
| IMP07 | `apps/api/plane/app/serializers/page.py`; `utils/content_validator.py` | SỬA allowlist tối thiểu cho task/board; giữ xác thực và chống XSS, không tắt sanitize. | T06,T19 |
| IMP08 | `apps/web/core/services/issue/issue.service.ts` | TÁI SỬ DỤNG; chỉ sửa service khi API/nhu cầu thực tế thiếu. Cần locate modal/picker hiện có trước khi làm UI mới. | T02,T03,T10 |
| IMP09 | Model/serializer/view/URL/migration whiteboard trong `apps/api/plane/` — MỚI, tên cụ thể chốt tại G2 | Schema, auth, revision, idempotent create; rủi ro cao về dữ liệu/quyền. | T08,T09,T10,T18,T19 |
| IMP10 | Adapter/modal/service whiteboard ở `apps/web/core/` — MỚI, đường dẫn chốt trước code | Persistence, preview, lỗi lưu, focus/keyboard, client-only loading. | T08,T09,T11,T12,T17 |
| IMP11 | `apps/api/plane/app/views/page/base.py`: duplicate, description, delete | SỬA nhánh duplicate/remap board khi cần; kiểm tra archive/lock/delete; không chia sẻ scene ngoài ý muốn. | T10,T13,T14 |
| IMP12 | `apps/api/plane/db/models/page.py`: PageVersion; `bgtasks/page_transaction_task.py` | KIỂM TRA lịch sử/ref tracking. PageLog không được dùng như danh mục quyền hay nguồn duy nhất để purge board. | T13,T15 |
| IMP13 | `apps/live/src/lib/pdf/node-renderers.tsx` và export callers | SỬA renderer/fallback; dữ liệu tham chiếu phải được resolve đúng quyền, không biến block thành khoảng trắng. | T16 |
| IMP14 | `packages/editor/package.json`; manifest ứng dụng sở hữu canvas; `pnpm-workspace.yaml`; `pnpm-lock.yaml` | SỬA có kiểm soát dependency mới; giữ một React; pin bản phù hợp. Lockfile chưa được kiểm tra trong lượt review này. | T17 |
| IMP15 | Read-only/version views, Markdown/HTML export/import, offline cache và asset pipeline | KIỂM TRA bổ sung tại G3: xác định file/call site thực tế rồi bổ sung vào bảng trước khi sửa. | T01,T06,T12,T15,T16 |

Không hiểu bảng này là “sửa tất cả các file”. Mỗi thay đổi phải có lý do và evidence. Vùng MỚI/G3 phải được cụ thể hóa tại checkout, không đặt tên file giả rồi coi là đã tồn tại.

---

## 7. Rủi ro ưu tiên

| ID | Rủi ro | Cách kiểm soát bắt buộc |
|---|---|---|
| R01 | UI hiểu node nhưng converter/server không hiểu → lỗi lưu hoặc mất block. | Đăng ký schema headless; test binary ↔ JSON ↔ HTML và restart. |
| R02 | Sanitizer bỏ tag/attrs, nhất là đường duplicate qua HTML. | Allowlist hẹp cho node; test với sanitizer thật, đồng thời thử payload độc hại. |
| R03 | Người xem Page đọc được task/board/preview không có quyền. | Kiểm tra tài nguyên trên server cho mọi đường đọc/ghi/export/asset. |
| R04 | Hai tab ghi đè scene dù không làm realtime. | Atomic expected-revision; giữ draft khi conflict; không auto-force-save. |
| R05 | Tạo tài nguyên thành công nhưng chèn node/lưu Page thất bại. | Retry liên kết, idempotent board create; không tạo/xóa bù mù quáng. |
| R06 | Undo/delete block/duplicate/restore làm mất hoặc chia sẻ nhầm board. | Quy tắc D07–D09, mapping ID và test vòng đời. |
| R07 | Canvas kéo browser code vào apps/live hoặc tăng nặng mọi editor. | Adapter ở web; lazy load; schema server thuần; kiểm tra build/SSR. |
| R08 | Rollback về bản không biết node rồi người dùng lưu → mất dữ liệu mới. | Rollback về bản đọc được node; tắt thao tác mới nhưng giữ parser/renderer/schema. |
| R09 | Preview/ảnh chỉ tồn tại local hoặc URL tạm; mở lại mất hình. | Asset backend, revision metadata và test phiên trình duyệt mới. |

---

## 8. Các bước kiểm chứng phải hoàn thành trước khi code

| Gate | Việc agent cần làm | Điều kiện qua |
|---|---|---|
| G0 — Đúng phiên bản | Ghi remote, branch, HEAD, working-tree changes; so với commit baseline. Xác minh phiên bản build/server cần thay đổi nếu có quyền truy cập. Không reset/checkout đè công việc đang dở. | Có baseline mới được xác nhận; ghi rõ phần chưa biết của deployment; cập nhật phát hiện bị thay đổi bởi commit mới. |

> **Ghi chú của chủ repo (19/09/2026):** nhánh chính (`main`) đang có công việc khác đang làm, nhưng khu vực Page chưa bị đụng tới bởi công việc đó; nhánh `preview` được dùng để review trước khi merge. Vì vậy F01–F15 được coi là áp dụng được cho khu vực Page, **nhưng agent vẫn phải tự xác nhận lại trên đúng nhánh sẽ code thật (không giả định là `main` hay `preview`)** trước khi sửa, vì nhánh chính có thể đã có commit mới hơn `174243b...` kể từ lúc review.
| G1 — Dependency | Đọc lockfile, catalog, manifest app; pin Excalidraw ổn định và kiểm tra React, Tiptap, SSR, build/license. | Ghi phiên bản thực tế và đường import; không tự nâng React/Tiptap hoặc dùng `--force` để che xung đột. |
| G2 — Model, quyền và asset | Kiểm tra toàn repo có whiteboard tương đương không; đọc BaseModel, ProjectPagePermission, migration head, asset model/service và task picker/create modal. | Có tên model/file/route cụ thể; mapping quyền và lifecycle rõ; tái sử dụng trước khi tạo mới. |
| G3 — Đủ call sites | Truy vết read-only editor, version restore, duplicate, copy/paste, Markdown/HTML/PDF, cache/offline, import và đường ghi API trực tiếp liên quan. **Bắt buộc bao gồm F15**: xác định frontend hiện tại lấy `project_id` nào để gọi API cho Page `is_global=True` hoặc thuộc nhiều project. | Bổ sung file/function và test cho những đường thực sự có trong checkout; không ghi “không có” chỉ vì chưa tìm thấy. F15 phải có câu trả lời cụ thể (tên file/function), không được bỏ qua. |
| G4 — Quyết định sản phẩm | D04, D08, D09, BOARD-07 **đã duyệt** (xem mục 2 và 3.2) — không cần review lại, không tự mở lại các lựa chọn khác. Mức hỗ trợ bảng dạng lưới trong canvas — **giữ nguyên là KHÔNG hỗ trợ ở v1**. | Các giới hạn v1 hiển thị rõ, không tự hứa tính năng ngang Lark hoặc full board history. |

Thiếu dữ liệu runtime thì đánh dấu `CHƯA XÁC MINH` và nêu ảnh hưởng. Không đoán database đang chạy từ model trong repo. Gate phải dựa vào bằng chứng, không chỉ đánh dấu checkbox.

---

## 9. Kế hoạch thực hiện sau khi được duyệt

| Bước | Đầu ra cần có | Điều kiện trước khi chuyển bước |
|---|---|---|
| P0 | Hoàn thành G0–G4, bổ sung file/call sites và duyệt thiết kế. | Không code tính năng trước khi có lệnh triển khai. |
| P1 | Fixture Page cũ/mới và test mô tả hành vi hiện có; cấu hình node/task reference, headless schema, sanitizer/HTML fallback. | Test round-trip và regression cũ; ghi lỗi có sẵn riêng. |
| P2 | Hoàn thiện `/task` trên service/node hiện hữu; phân biệt checklist; xử lý lỗi và quyền. | T02–T06 đạt trên môi trường test. |
| P3 | Schema/API whiteboard thêm mới, quyền, revision/idempotency, test DB. | Migration kiểm tra trên dữ liệu mẫu; không tác động nội dung Page cũ. |
| P4 | Node board, modal Excalidraw, lưu/tải, preview và asset adapter. | Mở lại được scene; save/conflict/close/error có bằng chứng. |
| P5 | Duplicate/remap, delete/undo, version semantics, read-only và export. | Không mất block hoặc lộ dữ liệu qua đường phụ. |
| P6 | Build/test liên ứng dụng; triển khai thử có feature flag; kiểm tra rollback. | Chỉ bật tạo mới khi các service/clients tham gia đã hỗ trợ node. |

Đây là thứ tự logic, không phải lịch ngày công. Có thể chia `/task` và `/board` thành hai đợt nhỏ; cả hai vẫn phải theo contract về dữ liệu/quyền.

---

## 10. Acceptance criteria và test đối chiếu

### Điều kiện nghiệm thu

| AC | Tiêu chí |
|---|---|
| AC01 | Người dùng chọn/tạo task thật; không thay checklist/mention; không chèn ID lỗi. |
| AC02 | Task block phản ánh thông tin có quyền truy cập; lỗi tạo/chèn không gây tạo trùng hay xóa task. |
| AC03 | Board lưu riêng, tải lại/khởi động lại vẫn khôi phục đúng nội dung trong phạm vi hỗ trợ. |
| AC04 | Binary, HTML và JSON giữ tham chiếu đúng; sanitizer vẫn chặn nội dung nguy hiểm. |
| AC05 | Page/task/board/preview/asset không vượt quyền, kể cả sau khi quyền bị thu hồi hoặc Page bị khóa. |
| AC06 | Lưu đồng thời không âm thầm ghi đè; lỗi mạng/đóng modal không báo đã lưu sai. |
| AC07 | Gỡ block/undo/duplicate/copy/restore đúng D07–D09, không mất hoặc chia sẻ nhầm dữ liệu. |
| AC08 | Read-only/PDF/HTML/Markdown không âm thầm bỏ block; giới hạn export được thể hiện rõ. |
| AC09 | Không phá luồng Page cũ hoặc các editor dùng chung; web/live build được; dependency không phát sinh React trùng. |
| AC10 | Có bằng chứng migration, regression, triển khai thử và rollback giữ dữ liệu; tài liệu khớp code bàn giao. |

### Danh mục test

**Trạng thái ban đầu của toàn bộ test: NOT RUN.** Danh sách dưới đây là test phải xây/chạy, không phải kết quả đã đạt.

| Test | Kịch bản và kết quả mong đợi | AC |
|---|---|---|
| T01 | Page cũ có headings, table, checklist, mentions, image: mở/sửa/lưu/reload không mất nội dung hoặc ý nghĩa. So sánh cấu trúc chuẩn hóa, không yêu cầu bytes Yjs giống hệt. | 01,09 |
| T02 | Chọn task có sẵn; đổi tên/trạng thái ở nơi khác; block đọc dữ liệu hiện tại; task bị hạn chế có trạng thái an toàn. | 01,02,05 |
| T03 | Tạo task thành công/thất bại/timeout; API thành công nhưng chèn Page thất bại; retry không tự tạo task lần hai. | 01,02 |
| T04 | Tìm `task`/`todo`/`checkbox`; work item và checklist dễ phân biệt; shortcut Markdown checklist không đổi. | 01,09 |
| T05 | Người khác sửa Page trong khi modal mở; vị trí chèn vẫn đúng. Điều hướng sang Page khác/mất quyền thì không chèn muộn vào Page sai. | 01,05,09 |
| T06 | Task/board node qua editor → binary → JSON/HTML → sanitizer → binary, reload và HTML fallback: ID/type/attrs được giữ. | 04 |
| T07 | Hai người sửa nội dung Page chứa board, reconnect và khởi động lại apps/live; không mất node, không biến thành realtime canvas ngoài phạm vi. | 04,09 |
| T08 | Tạo board, vẽ/chữ/đường nối, lưu, đóng/mở trong phiên mới và restart service; scene và ID khôi phục đúng. | 03 |
| T09 | Hai tab cùng revision; tab A lưu trước, tab B bị conflict; scene A nguyên vẹn và draft B còn để xử lý. | 06 |
| T10 | User/guest/owner, private Page, lock/archive/delete, project membership và cross-workspace ID; kiểm tra cả scene, task, preview và asset. | 05 |
| T11 | Mạng lỗi, retry, response đảo thứ tự, đóng modal khi đang lưu, hết phiên đăng nhập; không hiển thị Saved sai hoặc tự ghi đè. | 06 |
| T12 | Ảnh/preview trong phiên mới và khi URL ký hết hạn; đúng revision/quyền. Nếu chưa hỗ trợ ảnh, thao tác nhập ảnh phải bị chặn rõ ràng. | 03,05,06 |
| T13 | Delete block, undo, redo, gỡ nhiều reference, tạo board nhưng chưa chèn; không tự xóa task/scene. | 07 |
| T14 | Duplicate Page clone board và remap ID; chỉnh bản sao không đổi bản gốc. Copy khác Page đúng quy tắc được duyệt. | 07 |
| T15 | Mở/khôi phục version Page chứa board; hiển thị đúng giới hạn “scene mới nhất”, không giả là snapshot board lịch sử. | 07 |
| T16 | Read-only/PDF/HTML/Markdown chứa cả task/board: có nội dung hoặc fallback đọc được, không crash/blank silently; không lộ tài nguyên không có quyền. | 05,08 |
| T17 | Web/live build + smoke SSR/hydration, modal focus/keyboard, editor khác; đo kích thước bundle/tải Page trước-sau; canvas không bị import vào server. | 09 |
| T18 | Migration trên DB test có dữ liệu cũ; số Page và nội dung không đổi ngoài thao tác đã test; rollout/rollback vẫn đọc được node và giữ board. | 10 |
| T19 | Payload thiếu revision/sai UUID/sai scene/quá lớn; HTML/script/link nguy hiểm; không tắt sanitizer hoặc nới quyền để test qua. | 04,05,10 |

Khi chạy, ghi thêm: `test file hoặc thao tác`, `lệnh`, `môi trường`, `commit`, `kết quả`, `đường dẫn log/screenshot`. Không thay NOT RUN thành PASS chỉ vì code đã được viết.

Trong source đã đọc, package `live` có script `test` dùng Vitest và `check:types`; editor có `check:types`/`build`. [S20][S21] Ví dụ lệnh để đối chiếu sau khi cài môi trường đúng checkout:

```sh
pnpm --filter live test
pnpm --filter live check:types
pnpm --filter @plane/editor check:types
pnpm --filter @plane/editor build
```

Đây không thay thế test backend/browser. Agent phải xác định runner/lệnh backend và E2E thực tế, bổ sung test còn thiếu và báo giới hạn; không bịa lệnh dựa vào một framework đoán trước.

---

## 11. Triển khai và rollback

**Trước bật tính năng:** backup database và assets có kiểm chứng khả năng restore; migration thêm mới; triển khai API, shared editor schema, apps/live và web đọc được node mới. Đánh giá phiên client cũ/cache/offline trước khi cho ghi node mới.

**Bật có kiểm soát:** feature flag chỉ điều khiển tạo/chỉnh mới; tắt flag không được bỏ parser của node đã có. Với nhóm thử nhỏ, có thể dùng cửa sổ bảo trì/reload phiên để tránh client cũ cùng ghi. Không bật nếu vẫn có writer cũ có thể làm rơi node mà chưa có biện pháp bảo vệ.

**Quan sát:** tỷ lệ lỗi Page save, board save/conflict, lỗi sanitizer/converter, payload quá lớn, truy cập bị từ chối, preview mismatch và thời gian tải. Log dùng ID/revision/mã lỗi; không ghi raw scene, token hoặc nội dung nhạy cảm không cần thiết.

**Rollback ứng dụng:** tắt tạo mới, giữ đọc/parse node và bảng/scene/assets. Quay về bản tương thích định dạng mới, không mặc định quay về bất kỳ bản trước tính năng. Dừng ghi khi phát hiện mất/biến dạng nội dung; phục hồi từ backup phải cân nhắc các thay đổi phát sinh sau backup.

**Rollback DB:** migration thêm bảng có thể đảo về mặt kỹ thuật nhưng DROP TABLE sẽ xóa scene. Không coi down migration là rollback an toàn sau khi người dùng đã tạo board. Không tự thực hiện thao tác phá hủy dữ liệu; cần quyết định, backup/export và kế hoạch phục hồi riêng.

---

## 12. Quy tắc dùng tài liệu khi implementation

1. Đọc lại mục liên quan trước mỗi nhóm sửa; xác nhận HEAD và các thay đổi của người khác. Không reset hoặc sửa ngoài scope chỉ để làm sạch test.
2. Mỗi nhóm code phải map được tới `D/TASK/BOARD → IMP → AC → T`. Ghi file thực sửa và kết quả kiểm tra trong bảng bàn giao.
3. Phát hiện dependency mới trong phạm vi đã duyệt: bổ sung evidence/phạm vi trước khi sửa. Phát hiện thay đổi nghiệp vụ, API/DB contract, quyền, vòng đời hoặc mất dữ liệu: dừng phần đó và xin duyệt; tự sửa spec không phải tự cấp phép.
4. Source trái tài liệu: ghi khác biệt, không sửa code hiện có để ép cho đúng một giả định cũ. Giữ tách biệt “đã thiết kế”, “đã thực hiện” và “đã kiểm thử”.
5. Không tự deploy production, chạy migration trên dữ liệu thật, xóa board/task hoặc ghi secret vào tài liệu.
6. Cuối việc: review diff, cập nhật trạng thái thực tế, liệt kê test chưa chạy/lỗi có sẵn và phần chưa đạt. Không báo DONE khi AC chưa có bằng chứng.

### Nhật ký phát hiện khi code

| Ngày / commit | Phát hiện và bằng chứng | Ảnh hưởng ID | Quyết định / người duyệt | Trạng thái |
|---|---|---|---|---|
| 18/09/2026 / baseline | Lập bản phân tích tĩnh ban đầu; chưa code, chưa chạy test. | Toàn bộ | Chờ review | DRAFT |

### Bảng bàn giao đối chiếu

| Yêu cầu / IMP | File thực tế / commit | Test và bằng chứng | Chênh lệch với thiết kế | Kết luận |
|---|---|---|---|---|
| Chưa triển khai | — | NOT RUN | — | Chưa nghiệm thu |

---

## 13. Nguồn kiểm chứng

Các liên kết source dưới đây cố định commit để tránh tài liệu âm thầm thay đổi theo nhánh. Version/runtime triển khai vẫn phải xác minh tại G0. Nguồn thư viện là tài liệu công khai đã xem ngày 18/09/2026; đối chiếu API với package pin khi code.

| Nguồn | Nội dung |
|---|---|
| [S01] | Commit baseline; nhánh preview là nhánh được truy vấn khi review |
| [S02] | Page, ProjectPage và PageVersion |
| [S03] | PageEditorBody: điểm nối Page với collaborative editor |
| [S04] | WorkItemEmbedExtensionConfig: schema và HTML tag |
| [S05] | WorkItemEmbedExtension: React Node View và widget callback |
| [S06] | Schema extensions không phụ thuộc UI props |
| [S07] | Chuyển đổi Yjs, ProseMirror, HTML và JSON |
| [S08] | Hocuspocus fetchDocument/storeDocument |
| [S09] | PageCoreService: đọc/ghi description, resolve asset |
| [S10] | Page views: description, duplicate và vòng đời Page |
| [S11] | Page serializers và validation cập nhật nội dung |
| [S12] | nh3 sanitizer, custom tags/attributes và giới hạn nội dung |
| [S13] | Slash menu, additional options và từ khóa checklist |
| [S14] | IssueService: tạo, đọc và lấy nhóm work items |
| [S15] | Hook useExtendedEditorProps trong core |
| [S16] | DocumentEditorAdditionalExtensions registry |
| [S17] | Page transaction component map và PageLog |
| [S18] | PDF node renderers và fallback node chưa có renderer |
| [S19] | Dependency catalog, overrides và khai báo phiên bản |
| [S20] | Editor manifest, exports và build/check scripts |
| [S21] | Live manifest và Vitest/check scripts |
| [E01] | Excalidraw installation, dimensions và self-hosting fonts |
| [E02] | Excalidraw props: initialData, onChange, view mode và keyboard |
| [E03] | Excalidraw serialize/restore utilities; kiểm tra theo bản pin |
| [E04] | Tiptap React Node Views; áp dụng API phù hợp Tiptap 2 trong repo |
| [E05] | Giấy phép công bố của kho Excalidraw |

[S01]: https://github.com/cuoicungtui/plane/commit/174243b565e483e24f057cf9add9fe59a9f818c3 "Commit baseline; nhánh preview là nhánh được truy vấn khi review"
[S02]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/apps/api/plane/db/models/page.py "Page, ProjectPage và PageVersion"
[S03]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/apps/web/core/components/pages/editor/editor-body.tsx "PageEditorBody: điểm nối Page với collaborative editor"
[S04]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/packages/editor/src/extensions/work-item-embed/extension-config.ts "WorkItemEmbedExtensionConfig: schema và HTML tag"
[S05]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/packages/editor/src/extensions/work-item-embed/extension.tsx "WorkItemEmbedExtension: React Node View và widget callback"
[S06]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/packages/editor/src/extensions/core-without-props.ts "Schema extensions không phụ thuộc UI props"
[S07]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/packages/editor/src/helpers/yjs-utils.ts "Chuyển đổi Yjs, ProseMirror, HTML và JSON"
[S08]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/apps/live/src/extensions/database.ts "Hocuspocus fetchDocument/storeDocument"
[S09]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/apps/live/src/services/page/core.service.ts "PageCoreService: đọc/ghi description, resolve asset"
[S10]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/apps/api/plane/app/views/page/base.py "Page views: description, duplicate và vòng đời Page"
[S11]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/apps/api/plane/app/serializers/page.py "Page serializers và validation cập nhật nội dung"
[S12]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/apps/api/plane/utils/content_validator.py "nh3 sanitizer, custom tags/attributes và giới hạn nội dung"
[S13]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/packages/editor/src/extensions/slash-commands/command-items-list.tsx "Slash menu, additional options và từ khóa checklist"
[S14]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/apps/web/core/services/issue/issue.service.ts "IssueService: tạo, đọc và lấy nhóm work items"
[S15]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/apps/web/core/hooks/pages/use-extended-editor-extensions.ts "Hook useExtendedEditorProps trong core"
[S16]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/packages/editor/src/extensions/document-extensions.tsx "DocumentEditorAdditionalExtensions registry"
[S17]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/apps/api/plane/bgtasks/page_transaction_task.py "Page transaction component map và PageLog"
[S18]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/apps/live/src/lib/pdf/node-renderers.tsx "PDF node renderers và fallback node chưa có renderer"
[S19]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/pnpm-workspace.yaml "Dependency catalog, overrides và khai báo phiên bản"
[S20]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/packages/editor/package.json "Editor manifest, exports và build/check scripts"
[S21]: https://github.com/cuoicungtui/plane/blob/174243b565e483e24f057cf9add9fe59a9f818c3/apps/live/package.json "Live manifest và Vitest/check scripts"
[E01]: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation "Excalidraw installation, dimensions và self-hosting fonts"
[E02]: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/ "Excalidraw props: initialData, onChange, view mode và keyboard"
[E03]: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils "Excalidraw serialize/restore utilities; kiểm tra theo bản pin"
[E04]: https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react "Tiptap React Node Views; áp dụng API phù hợp Tiptap 2 trong repo"
[E05]: https://github.com/excalidraw/excalidraw/blob/master/LICENSE "Giấy phép công bố của kho Excalidraw"

---

## Cập nhật checkout và trạng thái triển khai — 19/09/2026

- Checkout triển khai: `main`, HEAD `bb37d5a61225fc08effa63bb1dd956692b8f15e8`, remote `origin` là `https://github.com/cuoicungtui/plane.git`.
- F15 đã xác minh trên source hiện tại: `apps/web/core/store/pages/project-page.ts`, constructor `ProjectPage`, lấy `page.project_ids?.[0]` cho toàn bộ Page API. Whiteboard v1 dùng cùng route project-scoped; Page global không có project hiện chưa có route hoạt động trong frontend hiện hữu.
- F09 đã xác minh và đã sửa: sanitizer thiếu `issue-embed-component`; nay allowlist giữ task embed và `whiteboard-embed-component` cùng các attrs bền vững.
- Đã triển khai một phần P1/P3/P5: schema headless cho board, `PageWhiteboard` + migration `0123`, Page-scoped API, idempotent creation key, optimistic revision, kiểm tra quyền qua `ProjectPagePermission`, kiểm tra asset ID Page đã upload, và clone/remap board khi duplicate Page.
- Chưa hoàn tất P2/P4/P6: picker/create task, modal Excalidraw, adapter asset/preview, copy/paste block guard, export/read-only renderer và end-to-end UI. Chưa bật UI tạo board.
- Xác minh: `python -m compileall` và `git diff --check` đã qua. Test Docker cô lập đã chạy với file `test_page_whiteboard_app.py`; log quan sát được hai case đầu PASS. Kết quả tổng đầy đủ cần chạy lại sau khi môi trường test ổn định. Không migration hay thay đổi Docker/volume dev.
