/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// local imports
import { applyMention, filterMentionCandidates, getMentionQuery } from "./mention-utils";
import type { TMentionQuery } from "./mention-utils";

type Props = {
  focusOnMount?: boolean;
  initialValue?: string;
  placeholder?: string;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (body: string) => Promise<void>;
};

export const CommentComposer = observer(function CommentComposer(props: Props) {
  const { focusOnMount, initialValue = "", placeholder, submitLabel, onCancel, onSubmit } = props;
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const {
    getUserDetails,
    project: { getProjectMemberIds, fetchProjectMembers },
  } = useMember();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue);
  const [mention, setMention] = useState<(TMentionQuery & { caret: number }) | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = value.trim().length > 0 && !isSubmitting;
  const memberIds = projectId ? getProjectMemberIds(projectId.toString(), false) : undefined;
  const candidates = mention
    ? filterMentionCandidates(
        (memberIds ?? []).flatMap((id) => {
          const user = getUserDetails(id);
          return user?.display_name ? [{ id, display_name: user.display_name, avatar_url: user.avatar_url }] : [];
        }),
        mention.query
      )
    : [];
  const isPickerOpen = candidates.length > 0;

  useEffect(() => {
    if (focusOnMount) textareaRef.current?.focus();
  }, [focusOnMount]);

  useEffect(() => {
    if (!memberIds && workspaceSlug && projectId)
      void fetchProjectMembers(workspaceSlug.toString(), projectId.toString());
  }, [memberIds, workspaceSlug, projectId, fetchProjectMembers]);

  const updateMention = (nextValue: string, caret: number) => {
    const query = getMentionQuery(nextValue, caret);
    setMention(query ? { ...query, caret } : null);
    setActiveIndex(0);
  };

  const pickMention = (displayName: string) => {
    if (!mention) return;
    const next = applyMention(value, mention, mention.caret, displayName);
    setValue(next.value);
    setMention(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmit(value.trim());
      setValue("");
    } catch {
      // the caller reports the failure and the text stays so it can be retried
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative mt-1 space-y-1.5">
      {isPickerOpen && (
        <ul
          role="listbox"
          className="absolute right-0 bottom-full left-0 z-10 mb-1 max-h-48 overflow-y-auto rounded-md border border-subtle bg-surface-1 py-1 shadow-raised-200"
        >
          {candidates.map((candidate, index) => (
            <li key={candidate.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={cn("flex w-full items-center gap-2 px-2 py-1 text-left text-12", {
                  "bg-layer-transparent-hover": index === activeIndex,
                })}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickMention(candidate.display_name);
                }}
              >
                <Avatar
                  name={candidate.display_name}
                  src={getFileURL(candidate.avatar_url ?? "")}
                  size={18}
                  shape="circle"
                />
                <span className="truncate">{candidate.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={textareaRef}
        onFocus={(event) =>
          event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)
        }
        value={value}
        rows={2}
        maxLength={10000}
        placeholder={placeholder}
        className="w-full resize-none rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-13 outline-none focus:border-accent-strong"
        onChange={(event) => {
          setValue(event.target.value);
          updateMention(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) => updateMention(event.currentTarget.value, event.currentTarget.selectionStart)}
        onBlur={() => setMention(null)}
        onKeyDown={(event) => {
          if (isPickerOpen) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : candidates.length - 1;
              setActiveIndex((current) => (current + step) % candidates.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              pickMention(candidates[activeIndex].display_name);
              return;
            }
            if (event.key === "Escape") {
              event.stopPropagation();
              setMention(null);
              return;
            }
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
          if (event.key === "Escape" && onCancel) onCancel();
        }}
      />
      <div className="flex justify-end gap-1.5">
        {onCancel && (
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t("page_comments.cancel")}
          </Button>
        )}
        <Button variant="primary" size="sm" disabled={!canSubmit} onClick={() => void submit()}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
});
