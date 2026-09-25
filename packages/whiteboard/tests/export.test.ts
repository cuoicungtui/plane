import * as plait from "@plait/core";
import type { PlaitBoard } from "@plait/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WHITEBOARD_EXPORT_TIMEOUT_MS, exportWhiteboardPng, exportWhiteboardSvg } from "../src/export";

vi.mock("@plait/core", () => ({
  findElements: vi.fn(() => []),
  getRectangleByElements: vi.fn(),
  toImage: vi.fn(),
  toSvgData: vi.fn(),
}));

const board = {} as PlaitBoard;
const toImage = vi.mocked(plait.toImage);
const toSvgData = vi.mocked(plait.toSvgData);
const rectangle = vi.mocked(plait.getRectangleByElements);

const boardSized = (width: number, height: number) => {
  rectangle.mockReturnValue({ x: 0, y: 0, width, height });
};

const ratioUsed = (): number => {
  const options = toImage.mock.calls[0]?.[1];
  if (typeof options?.ratio !== "number") throw new Error("toImage was not called with a ratio");
  return options.ratio;
};

beforeEach(() => {
  vi.useFakeTimers();
  toImage.mockResolvedValue("data:image/png;base64,AAAA");
  toSvgData.mockResolvedValue("<svg></svg>");
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("exportWhiteboardPng", () => {
  it("renders at pixel ratio 2 with a white background when the board is small", async () => {
    boardSized(400, 300);
    await expect(exportWhiteboardPng(board)).resolves.toBe("data:image/png;base64,AAAA");
    expect(toImage).toHaveBeenCalledWith(
      board,
      expect.objectContaining({
        ratio: 2,
        fillStyle: "white",
        padding: 20,
        inlineStyleClassNames: ".extend,.emojis,.text",
      })
    );
  });

  it("keeps a lower ratio the caller asked for", async () => {
    boardSized(400, 300);
    await exportWhiteboardPng(board, { ratio: 1 });
    expect(ratioUsed()).toBe(1);
  });

  it("lowers the ratio so a big board stays under 16 million pixels", async () => {
    // 8000 x 8000 at ratio 2 would be 256 million pixels; the browser would return an empty image.
    boardSized(8000, 8000);
    await exportWhiteboardPng(board);
    const ratio = ratioUsed();
    expect(ratio).toBeCloseTo(0.5, 5);
    expect(8000 * ratio * (8000 * ratio)).toBeLessThanOrEqual(16_000_000 + 1);
  });

  it("does not lower the ratio for a board that fits just under the limit", async () => {
    // 2000 x 2000 at ratio 2 is exactly 16 million pixels.
    boardSized(2000, 2000);
    await exportWhiteboardPng(board);
    expect(ratioUsed()).toBeCloseTo(2, 5);
  });

  it("uses the wanted ratio for an empty board instead of dividing by zero", async () => {
    boardSized(0, 0);
    await exportWhiteboardPng(board);
    expect(ratioUsed()).toBe(2);
  });

  it("passes through an undefined result when the browser could not draw the image", async () => {
    boardSized(400, 300);
    toImage.mockResolvedValue(undefined);
    await expect(exportWhiteboardPng(board)).resolves.toBeUndefined();
  });

  it("rejects instead of hanging when Plait never settles (an image that cannot be fetched)", async () => {
    boardSized(400, 300);
    toImage.mockReturnValue(new Promise(() => {}));
    const result = exportWhiteboardPng(board, { timeoutMs: 50 });
    const assertion = expect(result).rejects.toThrow("Whiteboard export timed out after 50 ms");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it("times out after the default period when no timeout is given", async () => {
    boardSized(400, 300);
    toImage.mockReturnValue(new Promise(() => {}));
    const result = exportWhiteboardPng(board);
    const assertion = expect(result).rejects.toThrow(`timed out after ${WHITEBOARD_EXPORT_TIMEOUT_MS} ms`);
    await vi.advanceTimersByTimeAsync(WHITEBOARD_EXPORT_TIMEOUT_MS);
    await assertion;
  });

  it("leaves no timer running once an export has finished", async () => {
    boardSized(400, 300);
    await exportWhiteboardPng(board);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("exportWhiteboardSvg", () => {
  it("returns the SVG document", async () => {
    await expect(exportWhiteboardSvg(board)).resolves.toBe("<svg></svg>");
    expect(toSvgData).toHaveBeenCalledWith(board, expect.objectContaining({ fillStyle: "white", padding: 20 }));
  });

  it("lets the caller override the fill colour and padding", async () => {
    await exportWhiteboardSvg(board, { fillStyle: "transparent", padding: 0 });
    expect(toSvgData).toHaveBeenCalledWith(board, expect.objectContaining({ fillStyle: "transparent", padding: 0 }));
  });

  it("rejects instead of hanging when Plait never settles", async () => {
    toSvgData.mockReturnValue(new Promise(() => {}));
    const result = exportWhiteboardSvg(board, { timeoutMs: 25 });
    const assertion = expect(result).rejects.toThrow("Whiteboard export timed out after 25 ms");
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
