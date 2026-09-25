import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * P1-8: hideScrollbar makes Plait oversize .viewport-container by 20px. If the board container is a
 * scroll container (overflow: hidden) it can be scrolled by focus or code, shifting the content while
 * Plait measures selection frames from the unscrolled rect. `overflow: clip` cannot be scrolled.
 */
const styles = readFileSync(resolve(__dirname, "../src/react-board/styles/index.scss"), "utf8");

const containerRule = (): string => {
  const start = styles.indexOf(".plait-board-container {");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = styles.indexOf(".viewport-container {", start);
  return styles.slice(start, end);
};

describe("plait board container styles", () => {
  it("clips instead of scrolling, keeping hidden as the fallback before it", () => {
    const rule = containerRule();
    const hidden = rule.indexOf("overflow: hidden;");
    const clip = rule.indexOf("overflow: clip;");
    expect(hidden).toBeGreaterThanOrEqual(0);
    expect(clip).toBeGreaterThan(hidden);
  });
});
