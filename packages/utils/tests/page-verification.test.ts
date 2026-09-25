/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { getPageVerificationStatus } from "../src/page";

const today = new Date(2026, 8, 26, 15, 30);

describe("getPageVerificationStatus", () => {
  it("is none for a page that was never verified", () => {
    expect(getPageVerificationStatus({ verified_at: null, verify_expires_at: null }, today)).toEqual({
      status: "none",
      daysLeft: null,
    });
    expect(getPageVerificationStatus({}, today).status).toBe("none");
  });

  it("never expires without an expiry date", () => {
    expect(getPageVerificationStatus({ verified_at: "2026-09-01T00:00:00Z", verify_expires_at: null }, today)).toEqual({
      status: "verified",
      daysLeft: null,
    });
  });

  it("counts whole days to the expiry date", () => {
    const page = { verified_at: "2026-09-01T00:00:00Z", verify_expires_at: "2026-10-26" };
    expect(getPageVerificationStatus(page, today)).toEqual({ status: "verified", daysLeft: 30 });
  });

  it("is still valid on the expiry date itself, whatever the time of day", () => {
    const page = { verified_at: "2026-09-01T00:00:00Z", verify_expires_at: "2026-09-26" };
    expect(getPageVerificationStatus(page, today)).toEqual({ status: "verified", daysLeft: 0 });
    expect(getPageVerificationStatus(page, new Date(2026, 8, 26, 23, 59)).status).toBe("verified");
  });

  it("expires the day after the expiry date", () => {
    const page = { verified_at: "2026-09-01T00:00:00Z", verify_expires_at: "2026-09-25" };
    expect(getPageVerificationStatus(page, today)).toEqual({ status: "expired", daysLeft: -1 });
  });

  it("counts across a month and year boundary", () => {
    const page = { verified_at: "2026-12-01T00:00:00Z", verify_expires_at: "2027-01-02" };
    expect(getPageVerificationStatus(page, new Date(2026, 11, 30, 8)).daysLeft).toBe(3);
  });
});
