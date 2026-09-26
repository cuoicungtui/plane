// @ts-nocheck
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { applyMention, filterMentionCandidates, getMentionQuery } from "./mention-utils";

describe("getMentionQuery", () => {
  it("finds the name typed right before the caret", () => {
    expect(getMentionQuery("hi @al", 6)).toEqual({ query: "al", start: 3 });
    expect(getMentionQuery("@", 1)).toEqual({ query: "", start: 0 });
  });

  it("ignores an email address, a finished mention and text after the caret", () => {
    expect(getMentionQuery("me@bob", 6)).toBeNull();
    expect(getMentionQuery("hi @bob there", 13)).toBeNull();
    expect(getMentionQuery("hi @bob", 3)).toBeNull();
  });
});

describe("filterMentionCandidates", () => {
  const people = [{ display_name: "carol" }, { display_name: "alice" }, { display_name: "Malice" }];

  it("matches case-insensitively and lists prefix matches first", () => {
    expect(filterMentionCandidates(people, "ali").map((p) => p.display_name)).toEqual(["alice", "Malice"]);
  });

  it("returns everyone for an empty query, capped by the limit", () => {
    expect(filterMentionCandidates(people, "", 2)).toHaveLength(2);
  });
});

describe("applyMention", () => {
  it("replaces the typed @query with the full name and moves the caret after it", () => {
    const mention = getMentionQuery("hi @al there", 6)!;
    expect(applyMention("hi @al there", mention, 6, "alice")).toEqual({ value: "hi @alice  there", caret: 10 });
  });
});
