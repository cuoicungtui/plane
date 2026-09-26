// @ts-nocheck
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import type { TPageComment } from "@plane/types";
import {
  countOpenBoardElementThreads,
  countOpenThreadsByAnchor,
  filterCommentThreads,
  getThreadActorIds,
  groupCommentThreads,
} from "./thread-utils";

const comment = (overrides: Partial<TPageComment>): TPageComment =>
  ({
    id: "c",
    page: "p",
    parent: null,
    actor: "u",
    body: "text",
    anchor_type: "block",
    anchor_id: "b1",
    anchor_board_id: "",
    quote: "",
    resolved_at: null,
    resolved_by: null,
    edited_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }) as TPageComment;

describe("groupCommentThreads", () => {
  it("attaches replies to their root in order", () => {
    const threads = groupCommentThreads([
      comment({ id: "r1" }),
      comment({ id: "r2" }),
      comment({ id: "a", parent: "r1" }),
      comment({ id: "b", parent: "r1" }),
      comment({ id: "c", parent: "r2" }),
    ]);
    expect(threads.map((t) => t.root.id)).toEqual(["r1", "r2"]);
    expect(threads[0].replies.map((r) => r.id)).toEqual(["a", "b"]);
    expect(threads[1].replies.map((r) => r.id)).toEqual(["c"]);
  });

  it("ignores replies whose root is missing and handles an empty list", () => {
    expect(groupCommentThreads([])).toEqual([]);
    expect(groupCommentThreads([comment({ id: "x", parent: "gone" })])).toEqual([]);
  });
});

describe("countOpenThreadsByAnchor", () => {
  it("counts unresolved threads of the requested anchor type per anchor id", () => {
    const threads = groupCommentThreads([
      comment({ id: "1", anchor_id: "b1" }),
      comment({ id: "2", anchor_id: "b1" }),
      comment({ id: "3", anchor_id: "b2" }),
      comment({ id: "4", anchor_id: "b1", resolved_at: "2026-01-02T00:00:00Z" }),
      comment({ id: "5", anchor_type: "text", anchor_id: "t1" }),
      comment({ id: "6", parent: "1", anchor_id: "" }),
    ]);
    expect(countOpenThreadsByAnchor(threads, "block")).toEqual({ b1: 2, b2: 1 });
    expect(countOpenThreadsByAnchor(threads, "text")).toEqual({ t1: 1 });
    expect(countOpenThreadsByAnchor(threads, "board_element")).toEqual({});
  });
});

describe("countOpenBoardElementThreads", () => {
  it("groups unresolved element threads by whiteboard, ignoring other anchors and resolved threads", () => {
    const threads = groupCommentThreads([
      comment({ id: "1", anchor_type: "board_element", anchor_id: "e1", anchor_board_id: "boardA" }),
      comment({ id: "2", anchor_type: "board_element", anchor_id: "e1", anchor_board_id: "boardA" }),
      comment({ id: "3", anchor_type: "board_element", anchor_id: "e2", anchor_board_id: "boardB" }),
      comment({
        id: "4",
        anchor_type: "board_element",
        anchor_id: "e3",
        anchor_board_id: "boardA",
        resolved_at: "2026-01-02T00:00:00Z",
      }),
      comment({ id: "5", anchor_type: "block", anchor_id: "b1", anchor_board_id: "boardA" }),
    ]);
    expect(countOpenBoardElementThreads(threads)).toEqual({ boardA: { e1: 2 }, boardB: { e2: 1 } });
    expect(countOpenBoardElementThreads([])).toEqual({});
  });
});

describe("filterCommentThreads", () => {
  const threads = groupCommentThreads([
    comment({ id: "r1", actor: "ann", body: "Fix the Budget", quote: "Q3 numbers" }),
    comment({ id: "a", parent: "r1", actor: "bob", body: "done" }),
    comment({ id: "r2", actor: "bob", body: "Looks fine" }),
  ]);

  it("returns everything without a filter", () => {
    expect(filterCommentThreads(threads, { query: "  " })).toHaveLength(2);
  });

  it("matches a person who wrote the root or any reply", () => {
    expect(filterCommentThreads(threads, { actorId: "ann" }).map((t) => t.root.id)).toEqual(["r1"]);
    expect(filterCommentThreads(threads, { actorId: "bob" }).map((t) => t.root.id)).toEqual(["r1", "r2"]);
  });

  it("searches bodies, replies and the quote without regard to case", () => {
    expect(filterCommentThreads(threads, { query: "budget" }).map((t) => t.root.id)).toEqual(["r1"]);
    expect(filterCommentThreads(threads, { query: "DONE" }).map((t) => t.root.id)).toEqual(["r1"]);
    expect(filterCommentThreads(threads, { query: "q3" }).map((t) => t.root.id)).toEqual(["r1"]);
  });

  it("combines person and text", () => {
    expect(filterCommentThreads(threads, { actorId: "bob", query: "fine" }).map((t) => t.root.id)).toEqual(["r2"]);
    expect(filterCommentThreads(threads, { actorId: "ann", query: "fine" })).toEqual([]);
  });
});

describe("getThreadActorIds", () => {
  it("lists each writer once", () => {
    const threads = groupCommentThreads([
      comment({ id: "r1", actor: "ann" }),
      comment({ id: "a", parent: "r1", actor: "bob" }),
      comment({ id: "b", parent: "r1", actor: "ann" }),
    ]);
    expect(getThreadActorIds(threads)).toEqual(["ann", "bob"]);
  });
});
