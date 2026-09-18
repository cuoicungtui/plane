/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
// local imports
import { DEPENDENCY_COLORS } from "./dependency-overlay";

export function IssueGanttDependencyLegend() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside
      aria-label="Chú giải quan hệ công việc"
      className="absolute right-4 bottom-4 z-10 text-12"
    >
      <button
        type="button"
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1/95 px-2.5 py-1.5 font-medium text-secondary shadow-sm backdrop-blur hover:bg-layer-1"
        onClick={() => setIsOpen((value) => !value)}
      >
        <Info size={14} />
        <span>Quan hệ task</span>
        {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {isOpen && (
        <div className="mt-2 w-72 rounded-md border border-subtle bg-surface-1/95 px-3 py-2.5 shadow-sm backdrop-blur">
          <p className="font-medium text-primary">Ý nghĩa mũi tên</p>
          <p className="mt-1 leading-5 text-secondary">
            <strong>Task A → Task B:</strong> A đang chặn B. B nên bắt đầu sau
            khi A hoàn thành.
          </p>
          <div className="mt-2 flex items-center gap-2 text-secondary">
            <span
              className="h-0.5 w-5 rounded-full"
              style={{ backgroundColor: DEPENDENCY_COLORS.blocking }}
            />
            <span>Đường đỏ: quan hệ chặn.</span>
          </div>
        </div>
      )}
    </aside>
  );
}
