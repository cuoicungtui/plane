/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";

import { useTranslation } from "@plane/i18n";
import { PlusIcon } from "@plane/propel/icons";
// plane imports
import type { TIssueServiceType } from "@plane/types";
import { CustomMenu } from "@plane/ui";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { useTimeLineRelationOptions } from "@/components/relations";
// types
import type { TIssueRelationTypes } from "@plane/types";

type Props = {
  issueId: string;
  customButton?: React.ReactNode;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

const RELATION_DESCRIPTIONS: Record<TIssueRelationTypes, string> = {
  relates_to: "Hai task có liên quan, nhưng không phụ thuộc tiến độ của nhau.",
  duplicate: "Hai task cùng một nội dung. Dùng để tránh xử lý trùng lặp.",
  blocked_by: "Task hiện tại phải chờ task được chọn hoàn thành.",
  blocking: "Task được chọn phải chờ task hiện tại hoàn thành.",
};

export const RelationActionButton = observer(function RelationActionButton(
  props: Props,
) {
  const { customButton, issueId, disabled = false, issueServiceType } = props;
  const { t } = useTranslation();
  // store hooks
  const { toggleRelationModal, setRelationKey } =
    useIssueDetail(issueServiceType);

  const ISSUE_RELATION_OPTIONS = useTimeLineRelationOptions();

  // handlers
  const handleOnClick = (relationKey: TIssueRelationTypes) => {
    setRelationKey(relationKey);
    toggleRelationModal(issueId, relationKey);
  };

  // button element
  const customButtonElement = customButton ? (
    <>{customButton}</>
  ) : (
    <PlusIcon className="h-4 w-4" />
  );

  return (
    <CustomMenu
      customButton={customButtonElement}
      placement="bottom-start"
      disabled={disabled}
      maxHeight="lg"
      closeOnSelect
    >
      {Object.values(ISSUE_RELATION_OPTIONS).map((item, index) => {
        if (!item) return <></>;

        return (
          <CustomMenu.MenuItem
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            onClick={() => {
              handleOnClick(item.key);
            }}
          >
            <div className="flex w-72 items-start gap-2">
              <span className="mt-0.5">{item.icon(12)}</span>
              <div>
                <p>{t(item.i18n_label)}</p>
                <p className="mt-0.5 text-11 text-tertiary">
                  {RELATION_DESCRIPTIONS[item.key]}
                </p>
              </div>
            </div>
          </CustomMenu.MenuItem>
        );
      })}
    </CustomMenu>
  );
});
