/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Extension, InputRule } from "@tiptap/core";

// Typing `[[` becomes `@`, which opens the mention menu so a page can be linked with the Wiki-style shortcut.
export const WikiLinkShortcutExtension = Extension.create({
  name: "wikiLinkShortcut",

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[$/,
        handler: ({ state, range }) => {
          state.tr.insertText("@", range.from, range.to);
        },
      }),
    ];
  },
});
