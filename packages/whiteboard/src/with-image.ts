import type { ImageComponentRef, ImageProps, PlaitImageBoard } from "@plait/common";
import type { PlaitBoard } from "@plait/core";
import { isAssetId, setBoardImages } from "./images";
import type { WhiteboardImages } from "./images";

// A stored image that cannot be loaded (deleted asset, offline). Plait still draws its frame and
// selection handles, so it stays selectable and deletable.
const BROKEN_BACKGROUND = "rgba(128, 128, 128, 0.14)";

const sourceOf = (url: string, getImages: () => WhiteboardImages | undefined): string | undefined =>
  isAssetId(url) ? getImages()?.resolveUrl(url) : url;

/**
 * Draws images and keeps them out of Plait's own image intake.
 *
 * `@plait/common` declares `board.renderImage` but ships no implementation (calling it throws), so
 * this plugin supplies one: an `<img>` filling Plait's foreignObject. The scene holds the asset ID
 * as `url`; the browser URL is looked up here, at draw time, and never stored.
 *
 * Plait's paste path would also turn a pasted image into a `blob:` URL that dies with the page.
 * Pasted and dropped image files are handled by `insertWhiteboardImages` instead (see the
 * react-board event hook); as a second line of defence, files are stripped from any fragment that
 * still reaches `insertFragment`.
 *
 * The plugin must come after `withDraw` and `withMind` so that its `renderImage` and
 * `insertFragment` wrap theirs.
 */
export const createWithImage =
  (getImages: () => WhiteboardImages | undefined) =>
  (board: PlaitBoard): PlaitBoard => {
    setBoardImages(board, getImages);

    const imageBoard = board as PlaitBoard & PlaitImageBoard;
    imageBoard.renderImage = (container, props): ImageComponentRef => {
      const image = document.createElement("img");
      image.alt = "";
      image.draggable = false;
      image.style.cssText = "display:block;width:100%;height:100%;object-fit:fill;pointer-events:none;user-select:none";
      image.addEventListener("error", () => {
        image.style.background = BROKEN_BACKGROUND;
      });
      image.addEventListener("load", () => {
        image.style.background = "";
      });

      let currentSource: string | undefined;
      const show = (url: string) => {
        // Plait calls `update` on every change of the element (moving, resizing). Setting `src` again,
        // even to the same value, can make the browser reload the image and flicker.
        const source = sourceOf(url, getImages);
        if (source === currentSource) return;
        currentSource = source;
        if (source) image.src = source;
        else image.removeAttribute("src");
      };
      show(props.imageItem.url);
      container.append(image);

      return {
        destroy: () => image.remove(),
        // Plait also calls this with only `{ isFocus }`, so any field may be missing.
        update: (next: Partial<ImageProps>) => {
          if (next.imageItem) show(next.imageItem.url);
        },
      };
    };

    const { insertFragment } = board;
    board.insertFragment = (clipboardData, targetPoint, operationType) => {
      if (!clipboardData?.files) {
        insertFragment(clipboardData, targetPoint, operationType);
        return;
      }
      const withoutFiles = { ...clipboardData, files: undefined };
      if (withoutFiles.elements || withoutFiles.medias || withoutFiles.text) {
        insertFragment(withoutFiles, targetPoint, operationType);
      }
    };

    return board;
  };
