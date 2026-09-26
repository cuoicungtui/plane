/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TMentionQuery = { query: string; start: number };

// the "@name" being typed right before the caret, if any (must start a word so an email address is not one)
export const getMentionQuery = (value: string, caret: number): TMentionQuery | null => {
  const match = /(?:^|\s)@([\w.-]*)$/.exec(value.slice(0, caret));
  if (!match) return null;
  return { query: match[1], start: caret - match[1].length - 1 };
};

export const filterMentionCandidates = <T extends { display_name: string }>(
  candidates: T[],
  query: string,
  limit = 6
): T[] => {
  const needle = query.toLowerCase();
  const matching = candidates.filter((candidate) => candidate.display_name.toLowerCase().includes(needle));
  const isPrefix = (candidate: T) => candidate.display_name.toLowerCase().startsWith(needle);
  return [...matching.filter(isPrefix), ...matching.filter((candidate) => !isPrefix(candidate))].slice(0, limit);
};

export const applyMention = (value: string, mention: TMentionQuery, caret: number, displayName: string) => {
  const inserted = `@${displayName} `;
  return {
    value: value.slice(0, mention.start) + inserted + value.slice(caret),
    caret: mention.start + inserted.length,
  };
};
