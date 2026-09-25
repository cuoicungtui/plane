import { BasicShapes, FlowchartSymbols } from "@plait/draw";
import { describe, expect, it } from "vitest";
import { WHITEBOARD_BASIC_SHAPES, WHITEBOARD_FLOWCHART_SHAPES, isWhiteboardShape } from "../src/tools";

describe("whiteboard shapes", () => {
  it("offers every basic shape except the text box, which has its own tool", () => {
    expect(WHITEBOARD_BASIC_SHAPES).toHaveLength(Object.values(BasicShapes).length - 1);
    expect(WHITEBOARD_BASIC_SHAPES).not.toContain(BasicShapes.text);
  });

  it("offers every flowchart symbol", () => {
    expect(WHITEBOARD_FLOWCHART_SHAPES).toHaveLength(Object.values(FlowchartSymbols).length);
  });

  it("recognises shape tools and rejects the others", () => {
    expect(isWhiteboardShape("rectangle")).toBe(true);
    expect(isWhiteboardShape(FlowchartSymbols.process)).toBe(true);
    expect(isWhiteboardShape("select")).toBe(false);
    expect(isWhiteboardShape("elbowArrow")).toBe(false);
    expect(isWhiteboardShape("text")).toBe(false);
  });
});
