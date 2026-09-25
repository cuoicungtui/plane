# @plane/whiteboard

The [Plait](https://github.com/worktile/plait) whiteboard canvas used by Page embeds.

This package ships **source only** (`exports` points at `./src`). It is compiled by the consuming app's Vite build, because the vendored code below imports SCSS and ESM-only Slate packages that tsdown has not been verified against. Only `apps/web` uses it.

## Public API

| Export                                  | Purpose                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `WhiteboardCanvas`                      | The board. Fill its container (`width`/`height` 100%); give the container a size.               |
| `setWhiteboardTool(board, tool)`        | Switch tool (select, hand, shapes, arrow, mind map). Use the `board` from `onReady`.            |
| `exportWhiteboardPng` / `…Svg`          | Render the whole board to an image from a live board, including a read-only one with no editor. |
| `WhiteboardScene`, `isWhiteboardScene`  | The persisted shape (schema v2) and a guard that rejects legacy Excalidraw scenes.              |
| `WhiteboardLabels` (`labels` prop)      | Placeholder text of new elements. English by default; the app passes its translations.          |
| `WHITEBOARD_ENGINE`, `…_SCHEMA_VERSION` | Values for `PageWhiteboard.engine` / `schema_version` (`"plait"`, `2`).                         |
| `WhiteboardImages` (`images` prop)      | How images are drawn and added: `resolveUrl`, `upload`, `maxFileSize`, `onError`.               |
| `insertWhiteboardImages(board, files)`  | Upload image files and add them (what the app's "Add image" button calls).                      |
| `collectWhiteboardAssetIds(elements)`   | Asset IDs a scene refers to, for the `asset_ids` sent with each save.                           |
| `WHITEBOARD_IMAGE_TYPES`                | The accepted MIME types (PNG, JPEG, GIF, WebP), e.g. for a file input's `accept`.               |

The toolbar and persistence (autosave, `expected_revision`) live in `apps/web`, not here.

## Behaviour worth knowing

- `initialScene` is read once. The canvas owns the live state; changing the prop later does nothing.
- `onSceneChange` fires for content and colour-mode changes, not for selection, scroll or zoom alone.
- Plait hard-codes Chinese placeholders ("文本", "中心主题", "概要"). The canvas replaces them through `labels`. One is left: an empty mind-map node pasted onto the bare canvas becomes a map titled "思维导图" (no i18n hook upstream).
- Changing `readOnly` remounts the board (Plait reads its options once) and keeps the unsaved content.
- Ctrl/Cmd+Z and Y are blocked from reaching the surrounding rich-text editor unless a text field inside the board owns the key.

### Images

- An image element stores the **asset ID** (a UUID) as its `url`, never a URL: the stored scene must not depend on a host, and a signed or `blob:` URL would stop working. `images.resolveUrl` turns the ID into a URL each time the image is drawn. A `url` that is not a UUID is drawn as is.
- Images come from the app's button (`insertWhiteboardImages`), from paste and from drag and drop. Each file is checked (PNG, JPEG, GIF or WebP; SVG is refused because it can carry script), sized, uploaded through `images.upload` and only then inserted, so a failed upload leaves nothing on the board. Problems are reported through `images.onError` (`unsupported`, `too_large`, `upload_failed`).
- Without `images.upload`, or on a read-only board, pasted and dropped image files are ignored. They are never inserted as `blob:` images.
- A pasted board fragment keeps the asset IDs of the images in it. Pasting into a board of another page of the same project shows the image (assets are served by project, not by page) but the app leaves the ID out of `asset_ids`, because the API only accepts assets uploaded for that page. Into another project it shows a broken image. The asset is not copied, so deleting the source page can leave that image broken (`duplicateEditorAsset` in `apps/web` could be used to copy on paste later).
- PNG/SVG export fetches each image; an image that cannot be fetched must not hang the export, so callers wrap it in a timeout.

## Vendored code

`src/react-board` and `src/react-text` are copied from [Drawnix](https://github.com/plait-board/drawnix) (branch `develop`, MIT, see `LICENSE-drawnix`). They are the React bindings for Plait. They are vendored, not installed, so we can patch them and keep them on the same Plait version as the rest of the board (they were verified against React 18.3.1 in the Phase 0 spike).

Local patches (search for `vendor patch`):

- `react-board/board.tsx`: the inline `overflow: auto` on `.viewport-container` is removed so `.disabled-scroll` can turn scrolling off on an unfocused board.
- `react-board/hooks/use-plugin-event.tsx`: Plait's `window`-level `keydown`/`keyup`/`copy`/`cut`/`paste` handlers only check that the board has a selection, so text typed or pasted elsewhere on the page edited the board. They now run only when the event target is inside the board's `[data-whiteboard-scope]` element (set by `WhiteboardCanvas`) or is the page itself (`document`/`body`). Keys typed while focus is on a toolbar button outside the canvas therefore do not reach the board.
- `react-board/hooks/use-plugin-event.tsx` (paste and drop): image files on the clipboard or dropped on the board are uploaded and inserted as stored images (see Images above). Plait's own path would insert a `blob:` URL that is gone after a reload, and its `drop` handler does nothing.
- `with-image.ts` is not a patch but a plugin: Plait's `renderImage` throws unless a plugin supplies it (Drawnix does, in its app code). Ours draws an `<img>` and re-resolves the asset ID on every update. It also strips `files` from clipboard data given to `insertFragment`, so no other path can insert a `blob:` image.

## Versions

Every `@plait/*` package is pinned to the same version in the workspace `catalog` (`pnpm-workspace.yaml`). Plait keeps module-level registries, so two copies of `@plait/core` in `pnpm-lock.yaml` would silently break the board. Bump all of them together and check the lockfile has exactly one `@plait/core`.
