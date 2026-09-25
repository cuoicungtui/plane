/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
import type { TLogoProps } from "@plane/types";

type Props = {
  logoProps: TLogoProps | null | undefined;
  size?: number;
};

export function PageMentionIcon({ logoProps, size = 14 }: Props) {
  if (logoProps?.in_use) return <Logo logo={logoProps} size={size} type="lucide" />;
  return <PageIcon className="size-3.5 text-tertiary" />;
}
