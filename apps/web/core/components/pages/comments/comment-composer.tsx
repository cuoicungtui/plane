/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";

type Props = {
  focusOnMount?: boolean;
  initialValue?: string;
  placeholder?: string;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (body: string) => Promise<void>;
};

export function CommentComposer(props: Props) {
  const { focusOnMount, initialValue = "", placeholder, submitLabel, onCancel, onSubmit } = props;
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = value.trim().length > 0 && !isSubmitting;

  useEffect(() => {
    if (focusOnMount) textareaRef.current?.focus();
  }, [focusOnMount]);

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
    <div className="mt-1 space-y-1.5">
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
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
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
}
