import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guardNativeKeyDefaults } from "../src/native-key-guard";

/**
 * P1-7: the board's text fields are contenteditable elements nested in the page editor's own
 * contenteditable. Chrome treats the outermost one as the editing region, so a native Ctrl+A
 * inside a node selects the whole page and moves focus to the paragraph beside the board.
 */

const query = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`fixture is missing #${id}`);
  return element;
};

/** Dispatch a real keydown at `target` and run the guard the way React would for the scope div. */
const press = (target: HTMLElement, init: KeyboardEventInit): KeyboardEvent => {
  const scope = query("scope");
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  const listener = (native: Event) =>
    guardNativeKeyDefaults({
      ...(native as KeyboardEvent),
      ctrlKey: (native as KeyboardEvent).ctrlKey,
      metaKey: (native as KeyboardEvent).metaKey,
      key: (native as KeyboardEvent).key,
      target: native.target,
      currentTarget: scope,
      preventDefault: () => native.preventDefault(),
    } as unknown as ReactKeyboardEvent<HTMLElement>);
  scope.addEventListener("keydown", listener);
  target.dispatchEvent(event);
  scope.removeEventListener("keydown", listener);
  return event;
};

describe("guardNativeKeyDefaults", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="host" contenteditable="true">
        <p id="paragraph">page text</p>
        <div id="scope" tabindex="-1">
          <div id="canvas"></div>
          <div id="field" contenteditable="true"><span id="word">node text</span></div>
        </div>
      </div>`;
  });
  afterEach(() => {
    document.body.innerHTML = "";
    window.getSelection()?.removeAllRanges();
  });

  it("selects only the node text on Ctrl+A inside a board text field", () => {
    const event = press(query("word"), { key: "a", ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    const selection = window.getSelection();
    expect(selection?.toString()).toBe("node text");
    expect(query("field").contains(selection?.anchorNode ?? null)).toBe(true);
  });

  it("also handles Cmd+A", () => {
    const event = press(query("word"), { key: "A", metaKey: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves Ctrl+A alone when no board text field owns it", () => {
    const event = press(query("canvas"), { key: "a", ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(window.getSelection()?.toString()).toBe("");
  });

  it("does not treat the enclosing page editor as a board text field", () => {
    document.getElementById("field")?.removeAttribute("contenteditable");
    const event = press(query("word"), { key: "a", ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
  });

  it("keeps blocking native undo and redo outside board text", () => {
    expect(press(query("canvas"), { key: "z", ctrlKey: true }).defaultPrevented).toBe(true);
    expect(press(query("canvas"), { key: "y", ctrlKey: true }).defaultPrevented).toBe(true);
  });

  it("lets undo and redo through inside a board text field", () => {
    expect(press(query("word"), { key: "z", ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it("ignores keys without a modifier", () => {
    expect(press(query("word"), { key: "a" }).defaultPrevented).toBe(false);
    expect(press(query("canvas"), { key: "z" }).defaultPrevented).toBe(false);
  });
});
