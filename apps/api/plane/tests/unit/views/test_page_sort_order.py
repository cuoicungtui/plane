# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Unit tests for the sort order a page gets when it is dropped among its siblings.

Every page created before the Wiki tree has sort_order 65535, so the first drop
between two of them has no gap to split and must space the siblings out again.
"""

import pytest

from plane.app.views.page.base import sort_order_at, sort_orders_at
from plane.db.models import Page

STEP = Page.DEFAULT_SORT_ORDER


def _siblings(*orders):
    return [(f"s{index}", order) for index, order in enumerate(orders)]


@pytest.mark.unit
class TestSortOrderAt:
    def test_only_child_gets_the_default(self):
        assert sort_order_at([], 0) == (STEP, {})

    def test_first_slot_goes_one_step_before_the_first_sibling(self):
        assert sort_order_at(_siblings(STEP, 2 * STEP), 0) == (0, {})

    def test_last_slot_goes_one_step_after_the_last_sibling(self):
        assert sort_order_at(_siblings(STEP, 2 * STEP), 2) == (3 * STEP, {})

    def test_middle_slot_splits_the_gap(self):
        assert sort_order_at(_siblings(STEP, 2 * STEP), 1) == (1.5 * STEP, {})

    def test_equal_neighbours_are_spaced_out_leaving_the_slot(self):
        sort_order, renumbered = sort_order_at(_siblings(STEP, STEP, STEP), 1)

        assert sort_order == 2 * STEP
        # s0 already sits at STEP, so only the siblings after the slot move
        assert renumbered == {"s1": 3 * STEP, "s2": 4 * STEP}

    def test_gap_below_the_minimum_is_spaced_out(self):
        sort_order, renumbered = sort_order_at(_siblings(STEP, STEP + 1e-7, 5 * STEP), 1)

        assert sort_order == 2 * STEP
        assert renumbered == {"s1": 3 * STEP, "s2": 4 * STEP}

    def test_renumbered_order_keeps_the_page_between_its_neighbours(self):
        siblings = _siblings(10.0, 10.0, 10.0, 10.0)
        sort_order, renumbered = sort_order_at(siblings, 2)
        final = {sibling_id: renumbered.get(sibling_id, order) for sibling_id, order in siblings}

        assert final["s1"] < sort_order < final["s2"]
        assert sorted(final.values()) == [final["s0"], final["s1"], final["s2"], final["s3"]]


@pytest.mark.unit
class TestSortOrdersAt:
    """sort_orders_at(siblings, index, count) places `count` new pages at once (D12/D14)."""

    def test_only_children_get_evenly_spaced_defaults(self):
        assert sort_orders_at([], 0, 3) == ([STEP, 2 * STEP, 3 * STEP], {})

    def test_inserting_at_the_start_stays_before_the_first_sibling(self):
        sort_orders, renumbered = sort_orders_at(_siblings(STEP, 2 * STEP), 0, 2)

        assert sort_orders == [-STEP, 0]
        assert renumbered == {}

    def test_inserting_at_the_end_continues_after_the_last_sibling(self):
        sort_orders, renumbered = sort_orders_at(_siblings(STEP, 2 * STEP), 2, 2)

        assert sort_orders == [3 * STEP, 4 * STEP]
        assert renumbered == {}

    def test_inserting_in_the_middle_splits_the_gap_between_the_new_pages_too(self):
        sort_orders, renumbered = sort_orders_at(_siblings(STEP, 2 * STEP), 1, 2)

        assert sort_orders[0] < sort_orders[1]
        assert STEP < sort_orders[0] < sort_orders[1] < 2 * STEP
        assert renumbered == {}

    def test_legacy_equal_neighbours_are_renumbered_to_fit_every_new_page(self):
        """Deleting a parent between two legacy (65535) siblings must fit all its children in one slot."""
        sort_orders, renumbered = sort_orders_at(_siblings(STEP, STEP, STEP), 1, 2)

        assert sort_orders == [2 * STEP, 3 * STEP]
        # s0 already sits at STEP; s1 and everything after the slot move to make room for both new pages
        assert renumbered == {"s1": 4 * STEP, "s2": 5 * STEP}

    def test_renumbered_order_keeps_every_new_page_between_its_neighbours(self):
        siblings = _siblings(10.0, 10.0, 10.0, 10.0)
        sort_orders, renumbered = sort_orders_at(siblings, 2, 3)
        final = {sibling_id: renumbered.get(sibling_id, order) for sibling_id, order in siblings}

        assert sort_orders == sorted(sort_orders)
        assert final["s1"] < sort_orders[0]
        assert sort_orders[-1] < final["s3"]
