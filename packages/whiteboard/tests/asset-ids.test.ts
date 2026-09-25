import type { PlaitElement } from "@plait/core";
import { describe, expect, it } from "vitest";
import { collectWhiteboardAssetIds, isAssetId } from "../src/images";

const A = "3f2b6c1e-0a4d-4b8e-9c1f-5d6e7a8b9c0d";
const B = "0b7a9d2c-51e3-4f60-8a1b-2c3d4e5f6a7b";
const C = "c9d8e7f6-a5b4-4c3d-92e1-f0a1b2c3d4e5";

const elements = (...list: unknown[]) => list as PlaitElement[];

describe("isAssetId", () => {
  it("accepts a UUID in either case", () => {
    expect(isAssetId(A)).toBe(true);
    expect(isAssetId(A.toUpperCase())).toBe(true);
  });

  it.each([
    ["an http URL", "https://example.com/a.png"],
    ["a blob URL", "blob:https://example.com/3f2b6c1e-0a4d-4b8e-9c1f-5d6e7a8b9c0d"],
    ["a UUID with text around it", ` ${A}`],
    ["a truncated UUID", A.slice(0, 30)],
    ["an empty string", ""],
    ["a number", 42],
    ["undefined", undefined],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(isAssetId(value)).toBe(false);
  });
});

describe("collectWhiteboardAssetIds", () => {
  it("returns nothing for an empty board", () => {
    expect(collectWhiteboardAssetIds([])).toEqual([]);
  });

  it("finds the ID of a free-standing image", () => {
    expect(collectWhiteboardAssetIds(elements({ id: "img-1", type: "image", url: A }))).toEqual([A]);
  });

  it("finds an image attached to a mind map node, at any depth", () => {
    const tree = elements({
      id: "mind",
      type: "mindmap",
      data: { image: { url: A } },
      children: [
        {
          id: "n1",
          data: { image: { url: B } },
          children: [{ id: "n2", children: [{ id: "n3", data: { image: { url: C } } }] }],
        },
      ],
    });
    expect(collectWhiteboardAssetIds(tree).toSorted()).toEqual([A, B, C].toSorted());
  });

  it("lists an image used several times once", () => {
    const tree = elements(
      { id: "i1", url: A },
      { id: "i2", url: A },
      { id: "m", data: { image: { url: A } }, children: [{ id: "i3", url: A }] }
    );
    expect(collectWhiteboardAssetIds(tree)).toEqual([A]);
  });

  it("ignores images that are not stored assets, so no outside URL ends up in asset_ids", () => {
    const tree = elements(
      { id: "i1", url: "https://example.com/a.png" },
      { id: "i2", url: "blob:https://example.com/x" },
      { id: "m", data: { image: { url: "data:image/png;base64,AAAA" } } }
    );
    expect(collectWhiteboardAssetIds(tree)).toEqual([]);
  });

  it("copes with elements that have no url, no data or an odd shape", () => {
    const tree = elements(
      { id: "plain" },
      { id: "no-image", data: {} },
      { id: "null-image", data: { image: null } },
      { id: "numeric-url", url: 12 },
      { id: "bad-children", children: "not-an-array" },
      null,
      "text"
    );
    expect(collectWhiteboardAssetIds(tree)).toEqual([]);
  });
});
