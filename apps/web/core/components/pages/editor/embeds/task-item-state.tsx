/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";

import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useTaskItemIssue } from "./use-task-item-issue";

type Props = {
  issueId: string;
  projectId: string;
  workspaceSlug: string;
  readOnly: boolean;
  // D18.2: the checklist checkbox's own local checked attribute — the
  // checkbox patches state directly on toggle (see onToggle in
  // use-extended-editor-extensions.tsx), bypassing this component's own
  // fetched copy of the issue, so a change here triggers a refetch to stay
  // truthful about which state is actually selected.
  checked: boolean;
  onStateGroupChange: (isCompleted: boolean) => void;
};

// D18.2: rendered at the head of a promoted checklist item, right after the
// checkbox and before the title — the actual work item state (Todo/In
// Progress/Done/...), distinct from the checkbox's own local checked/unchecked.
export const TaskItemState = observer(function TaskItemState({
  issueId,
  projectId,
  workspaceSlug,
  readOnly,
  checked,
  onStateGroupChange,
}: Props) {
  const { getStateById } = useProjectState();
  const { issue, status, patch, refetch } = useTaskItemIssue(workspaceSlug, projectId, issueId);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    // The checkbox's own state patch (see onToggle in
    // use-extended-editor-extensions.tsx) is fire-and-forget, so refetching
    // immediately on the attribute change can race ahead of it and reload
    // the state that's about to be replaced — wait it out first.
    const timer = setTimeout(refetch, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  if (status !== "ready" || !issue) return null;

  return (
    <StateDropdown
      value={issue.state_id}
      projectId={projectId}
      disabled={readOnly}
      showTooltip
      buttonVariant="border-with-text"
      className="text-xs"
      onChange={(stateId) => {
        void patch({ state_id: stateId });
        onStateGroupChange(getStateById(stateId)?.group === "completed");
      }}
    />
  );
});
