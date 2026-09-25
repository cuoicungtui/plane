/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";

const INTERNAL_LINK_EVENT = "plane:internal-link";

export function EditorInternalLinkHandler() {
  const router = useAppRouter();

  useEffect(() => {
    const handler = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path;
      if (!path) return;
      event.preventDefault();
      router.push(path);
    };
    window.addEventListener(INTERNAL_LINK_EVENT, handler);
    return () => window.removeEventListener(INTERNAL_LINK_EVENT, handler);
  }, [router]);

  return null;
}
