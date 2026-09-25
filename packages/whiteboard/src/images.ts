import { PlaitBoard, toHostPoint, toViewBoxPoint } from "@plait/core";
import type { Point } from "@plait/core";
import { DrawTransforms } from "@plait/draw";
import { isAssetId } from "./asset-ids";

// Lives in ./asset-ids so the app can import it without loading the board; re-exported for the code
// inside this package that already reads it from here.
export { collectWhiteboardAssetIds, isAssetId } from "./asset-ids";

/** Why an image was not added. The app decides how to tell the user (see `WhiteboardImages.onError`). */
export type WhiteboardImageError = "unsupported" | "too_large" | "upload_failed";

/**
 * How the board stores, finds and adds images. Provided by the app, because uploads go through the
 * app's own asset API.
 *
 * The scene stores the bare asset ID as the image `url`; `resolveUrl` turns it into something the
 * browser can load at draw time. Nothing but the ID is ever persisted.
 */
export type WhiteboardImages = {
  /** URL to draw for a stored asset ID. Return `undefined` while it cannot be resolved yet. */
  resolveUrl: (assetId: string) => string | undefined;
  /**
   * Store the file and return its asset ID. Without it nothing can be added (a read-only export page
   * only draws), and pasted or dropped images are ignored.
   */
  upload?: (file: File) => Promise<string>;
  /** Largest accepted file, in bytes. No limit when omitted. */
  maxFileSize?: number;
  onError?: (kind: WhiteboardImageError) => void;
};

/** File types the board accepts. SVG is left out on purpose: an uploaded SVG can carry script. */
export const WHITEBOARD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/** New images are shown at most this many scene units on their longer side; the stored file is untouched. */
const MAX_INSERT_SIDE = 480;
/** Offset between images added by one drop or paste, so they do not sit exactly on top of each other. */
const STACK_OFFSET = 24;

/** Kept per board so the toolbar, the paste handler and the renderer all read the app's latest configuration. */
const BOARD_TO_IMAGES = new WeakMap<PlaitBoard, () => WhiteboardImages | undefined>();

export const setBoardImages = (board: PlaitBoard, getImages: () => WhiteboardImages | undefined): void => {
  BOARD_TO_IMAGES.set(board, getImages);
};

export const getBoardImages = (board: PlaitBoard): WhiteboardImages | undefined => BOARD_TO_IMAGES.get(board)?.();

/** Whether the board can take new images at all: it is editable and the app supplied `upload`. */
export const canInsertImages = (board: PlaitBoard): boolean =>
  !PlaitBoard.isReadonly(board) && typeof getBoardImages(board)?.upload === "function";

/** The image files of a clipboard or drag payload, in order. */
export const getImageFiles = (data: DataTransfer | null | undefined): File[] =>
  Array.from(data?.files ?? []).filter((file) => file.type.startsWith("image/"));

// Waits for `load` rather than `decode()`: the latter never settles while the tab is in the
// background (an upload started just before switching tabs would stall), and only the size is needed.
const readNaturalSize = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Not a readable image"));
    });
    image.src = objectUrl;
  });

const fitToInsertSize = ({ width, height }: { width: number; height: number }) => {
  const scale = Math.min(1, MAX_INSERT_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

/** Whether the board is still on the page. The upload takes a while and the board may have been closed or remounted. */
const isBoardMounted = (board: PlaitBoard): boolean => {
  try {
    return PlaitBoard.getBoardContainer(board).isConnected;
  } catch {
    return false;
  }
};

/** Top-left that puts an image of this size in the middle of the visible area (what Plait does when given no point). */
const centredTopLeft = (board: PlaitBoard, width: number, height: number): Point => {
  const container = PlaitBoard.getBoardContainer(board);
  const [cx, cy] = toViewBoxPoint(board, toHostPoint(board, container.clientWidth / 2, container.clientHeight / 2));
  return [cx - width / 2, cy - height / 2];
};

type PreparedImage = { assetId: string; width: number; height: number };

/** Check, measure and upload one file. Reports the reason through `onError` and returns null if it cannot be used. */
const prepareImage = async (
  images: WhiteboardImages,
  upload: (file: File) => Promise<string>,
  file: File
): Promise<PreparedImage | null> => {
  if (!WHITEBOARD_IMAGE_TYPES.includes(file.type)) {
    images.onError?.("unsupported");
    return null;
  }
  if (images.maxFileSize !== undefined && file.size > images.maxFileSize) {
    images.onError?.("too_large");
    return null;
  }

  let size: { width: number; height: number };
  try {
    size = await readNaturalSize(file);
  } catch {
    images.onError?.("unsupported");
    return null;
  }
  if (size.width < 1 || size.height < 1) {
    images.onError?.("unsupported");
    return null;
  }

  let assetId: string;
  try {
    assetId = await upload(file);
  } catch {
    images.onError?.("upload_failed");
    return null;
  }
  if (!isAssetId(assetId)) {
    images.onError?.("upload_failed");
    return null;
  }
  return { assetId, ...fitToInsertSize(size) };
};

/**
 * Upload each image file and add it to the board as a free-standing image element whose `url` is the
 * asset ID. Files are handled one after another so they land in the order given.
 *
 * `point` is the top-left of the first image in board coordinates. Without it the first image is
 * centred in the visible area. Each further image is shifted down and right so a batch fans out
 * instead of stacking exactly. A file that is not an accepted type, is too large, cannot be read
 * as an image or fails to upload is reported through `onError` and skipped: nothing half-built is
 * ever added to the board.
 */
export const insertWhiteboardImages = async (board: PlaitBoard, files: File[], point?: Point): Promise<void> => {
  const images = getBoardImages(board);
  const upload = images?.upload;
  if (!images || !upload || PlaitBoard.isReadonly(board)) return;

  for (const [index, file] of files.entries()) {
    // One at a time on purpose: the images must land in the order given, and one failing upload
    // should not start the ones after it against a server that is already refusing.
    // oxlint-disable-next-line no-await-in-loop
    const prepared = await prepareImage(images, upload, file);
    if (!prepared) continue;
    // The board may have been closed or rebuilt (read-only toggle) while the file was uploading.
    if (!isBoardMounted(board) || PlaitBoard.isReadonly(board)) return;

    const { assetId, width, height } = prepared;
    const [x, y] = point ?? centredTopLeft(board, width, height);
    const offset = index * STACK_OFFSET;
    DrawTransforms.insertImage(board, { url: assetId, width, height }, [x + offset, y + offset]);
  }
};
