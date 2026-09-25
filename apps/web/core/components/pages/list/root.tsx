/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// types
import type { TPageNavigationTabs } from "@plane/types";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
// local imports
import { PagesTreeRoot } from "../tree/root";

type TPagesListRoot = {
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
};

export const PagesListRoot = observer(function PagesListRoot(props: TPagesListRoot) {
  const { pageType, storeType } = props;
  const { projectId } = useParams();

  return <PagesTreeRoot key={projectId?.toString()} pageType={pageType} storeType={storeType} />;
});
