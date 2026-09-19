/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { CalendarClock, ExternalLink, Trash2 } from "lucide-react";
import { renderFormattedPayloadDate, shouldHighlightIssueDueDate } from "@plane/utils";
import { AlertModalCore } from "@plane/ui";

import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useProjectState } from "@/hooks/store/use-project-state";
import { IssueService } from "@/services/issue";
import { useTaskItemIssue } from "./use-task-item-issue";

const issueService = new IssueService();

type Props = {
  issueId: string;
  projectId: string;
  workspaceSlug: string;
  readOnly: boolean;
  // D18.2: see task-item-state.tsx — the checkbox patches state directly,
  // bypassing this component's own fetched copy, so a change refetches to
  // keep the overdue highlight (which depends on the issue's state group)
  // truthful.
  checked: boolean;
  // D18.2: bound to this node's own `deleteNode` — call only once the work
  // item has actually been deleted, never on its own (deleting the checklist
  // *text* must never delete the work item; that stays a deliberate action
  // behind the confirm dialog below).
  onDeleted: () => void;
};

// D18: rendered next to a checklist item that has already been promoted to a
// real work item — a compact one-line trailer (assignee + dates + open link +
// delete), never title/state (the checklist text and the state dropdown at
// the head of the line already cover those). Reuses the same dropdown
// components as the rest of the app.
export const TaskItemMeta = observer(function TaskItemMeta({
  issueId,
  projectId,
  workspaceSlug,
  readOnly,
  checked,
  onDeleted,
}: Props) {
  const { getStateById, getProjectStates, fetchProjectStates } = useProjectState();
  const { issue, status, patch, refetch } = useTaskItemIssue(workspaceSlug, projectId, issueId);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!getProjectStates(projectId)) void fetchProjectStates(workspaceSlug, projectId);
  }, [projectId, workspaceSlug, getProjectStates, fetchProjectStates]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    // See task-item-state.tsx — the checkbox's own patch is fire-and-forget,
    // so wait it out before refetching to avoid reloading the stale state.
    const timer = setTimeout(refetch, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  if (status !== "ready" || !issue) return null;

  const stateDetails = getStateById(issue.state_id);
  const overdue = shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group);
  const href = `/${workspaceSlug}/projects/${projectId}/issues/${issue.id}`;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await issueService.deleteIssue(workspaceSlug, projectId, issueId);
      onDeleted();
    } catch {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  };

  return (
    <>
      <span className="text-xs inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
        <MemberDropdown
          value={issue.assignee_ids}
          onChange={(ids) => void patch({ assignee_ids: ids })}
          projectId={projectId}
          multiple
          disabled={readOnly}
          buttonVariant={issue.assignee_ids?.length ? "transparent-without-text" : "border-without-text"}
        />
        {/* Start and due each carry their own icon (CalendarClock vs the
            default CalendarDays) so which is which stays clear even when only
            one — or neither — is set; showTooltip spells it out on hover. */}
        <DateDropdown
          icon={<CalendarClock className="h-3 w-3 flex-shrink-0" />}
          value={issue.start_date}
          onChange={(date) => void patch({ start_date: date ? renderFormattedPayloadDate(date) : null })}
          disabled={readOnly}
          placeholder="Start date"
          showTooltip
          buttonVariant={issue.start_date ? "border-with-text" : "border-without-text"}
        />
        <DateDropdown
          value={issue.target_date}
          onChange={(date) => void patch({ target_date: date ? renderFormattedPayloadDate(date) : null })}
          disabled={readOnly}
          placeholder="Due date"
          showTooltip
          buttonVariant={issue.target_date ? "border-with-text" : "border-without-text"}
          buttonClassName={overdue ? "text-danger-primary" : ""}
        />
        <a href={href} className="shrink-0 text-tertiary hover:text-primary" title="Open work item">
          <ExternalLink className="size-3.5" />
        </a>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="shrink-0 text-tertiary hover:text-danger-primary"
            title="Delete task"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </span>
      <AlertModalCore
        isOpen={isDeleteOpen}
        handleClose={() => setIsDeleteOpen(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title="Delete task"
        content="Are you sure you want to delete this task? The linked work item will be permanently deleted. This action cannot be undone."
      />
    </>
  );
});
