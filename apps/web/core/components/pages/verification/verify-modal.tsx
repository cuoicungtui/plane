/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { format } from "date-fns";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalWidth, ModalCore } from "@plane/ui";
import { cn, getPageName, renderFormattedDate } from "@plane/utils";
// store
import type { TPageInstance } from "@/store/pages/base-page";

export const VERIFY_DURATIONS_IN_DAYS = [7, 30, 90, 180, 365] as const;
type TDuration = (typeof VERIFY_DURATIONS_IN_DAYS)[number] | "never";
const DEFAULT_DURATION: TDuration = 90;

const getExpiryDate = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  page: TPageInstance;
};

export const VerifyPageModal = observer(function VerifyPageModal({ isOpen, onClose, page }: Props) {
  const { t } = useTranslation();
  const [duration, setDuration] = useState<TDuration>(DEFAULT_DURATION);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    if (isSubmitting) return;
    setDuration(DEFAULT_DURATION);
    onClose();
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await page.verify(duration === "never" ? null : format(getExpiryDate(duration), "yyyy-MM-dd"));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("page_verification.toast.success_title"),
        message: t("page_verification.toast.verified"),
      });
      setDuration(DEFAULT_DURATION);
      onClose();
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("page_verification.toast.error_title"),
        message: t("page_verification.toast.verify_error"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const options: { value: TDuration; label: string; hint?: string }[] = [
    ...VERIFY_DURATIONS_IN_DAYS.map((days) => ({
      value: days,
      label: t("page_verification.duration_days", { count: days }),
      hint: t("page_verification.until", { date: renderFormattedDate(getExpiryDate(days)) }),
    })),
    { value: "never", label: t("page_verification.no_expiry") },
  ];

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.LG}>
      <div className="p-5">
        <h3 className="text-16 font-medium">{t("page_verification.modal_title")}</h3>
        <p className="mt-1 text-13 text-secondary">
          {t("page_verification.modal_description", { name: getPageName(page.name) })}
        </p>
        <div role="radiogroup" aria-label={t("page_verification.modal_title")} className="mt-4 flex flex-col gap-1">
          {options.map((option) => {
            const isSelected = option.value === duration;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setDuration(option.value)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-13 transition-colors",
                  isSelected
                    ? "border-accent-strong bg-accent-primary/10 text-primary"
                    : "border-subtle text-secondary hover:bg-layer-transparent-hover"
                )}
              >
                <span className="font-medium">{option.label}</span>
                {option.hint && <span className="text-12 text-tertiary">{option.hint}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t-[0.5px] border-subtle px-5 py-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={handleClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} loading={isSubmitting}>
          {t("page_verification.confirm")}
        </Button>
      </div>
    </ModalCore>
  );
});
