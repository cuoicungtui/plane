import { BOARD_TO_ELEMENT_HOST } from "@plait/core";
import type { PlaitBoard } from "@plait/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isEventForBoard } from "../src/react-board/board-event-scope";

/**
 * P0-08: Plait listens for keyboard and clipboard events on `window`, so an embedded board would
 * react to a Delete typed in the paragraph beside it. `isEventForBoard` is the gate that stops that.
 */

const query = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`fixture is missing #${id}`);
  return element;
};

/** Dispatch a real keydown at `target` and return what the gate decides for it. */
const verdictFor = (board: PlaitBoard, target: EventTarget): boolean => {
  let verdict: boolean | undefined;
  const listener = (event: Event) => {
    verdict = isEventForBoard(board, event);
  };
  target.addEventListener("keydown", listener);
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
  target.removeEventListener("keydown", listener);
  if (verdict === undefined) throw new Error("the event never reached the listener");
  return verdict;
};

/** Register `container` as the board's container, the way Plait does when the board mounts. */
const boardWithContainer = (container: HTMLElement): PlaitBoard => {
  const board = {} as PlaitBoard;
  BOARD_TO_ELEMENT_HOST.set(board, { container } as unknown as NonNullable<
    ReturnType<typeof BOARD_TO_ELEMENT_HOST.get>
  >);
  return board;
};

describe("isEventForBoard", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <p id="paragraph">text next to the board</p>
      <div id="scope" data-whiteboard-scope>
        <div id="toolbar"><button id="tool">Pen</button></div>
        <div id="container"><svg id="canvas"></svg><span id="inside">label</span></div>
      </div>
      <div id="bare-container"><span id="bare-inside"></span></div>
      <p id="bare-outside">text after the bare board</p>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("board inside a [data-whiteboard-scope] wrapper", () => {
    it("accepts events aimed inside the board container", () => {
      const board = boardWithContainer(query("container"));
      expect(verdictFor(board, query("inside"))).toBe(true);
      expect(verdictFor(board, query("canvas"))).toBe(true);
      expect(verdictFor(board, query("container"))).toBe(true);
    });

    it("accepts events aimed at the board's own toolbar, which sits in the scope but outside the container", () => {
      const board = boardWithContainer(query("container"));
      expect(verdictFor(board, query("tool"))).toBe(true);
      expect(verdictFor(board, query("toolbar"))).toBe(true);
    });

    it("rejects events aimed at the paragraph beside the board", () => {
      const board = boardWithContainer(query("container"));
      expect(verdictFor(board, query("paragraph"))).toBe(false);
    });
  });

  describe("board without a scope wrapper", () => {
    it("falls back to the board container", () => {
      const board = boardWithContainer(query("bare-container"));
      expect(verdictFor(board, query("bare-inside"))).toBe(true);
      expect(verdictFor(board, query("bare-outside"))).toBe(false);
      // The scope of the other board is not this board's scope.
      expect(verdictFor(board, query("inside"))).toBe(false);
    });
  });

  describe("events aimed at the page itself", () => {
    it.each([
      ["document", () => document],
      ["body", () => document.body],
      ["the root element", () => document.documentElement],
    ])("accepts events aimed at %s", (_label, getTarget) => {
      const board = boardWithContainer(query("container"));
      expect(verdictFor(board, getTarget())).toBe(true);
    });

    it("accepts events whose target is not a DOM node, such as window", () => {
      const board = boardWithContainer(query("container"));
      expect(verdictFor(board, window)).toBe(true);
    });
  });
});
