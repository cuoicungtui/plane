# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import pytest
from rest_framework import serializers

from plane.app.serializers.whiteboard import PageWhiteboardSerializer, validate_plait_scene
from plane.db.models import PageWhiteboard


def _element(element_id="a"):
    return {"id": element_id, "type": "geometry", "shape": "rectangle", "points": [[0, 0], [10, 10]]}


@pytest.mark.unit
class TestValidatePlaitScene:
    def test_accepts_minimal_and_full_scenes(self):
        validate_plait_scene({"children": []})
        validate_plait_scene(
            {
                "children": [_element("a"), {"id": "b", "data": {"topic": {}}, "children": [], "isRoot": True}],
                "viewport": {"zoom": 1.5},
                "theme": {"themeColorMode": "default"},
            }
        )

    @pytest.mark.parametrize(
        "scene",
        [
            [],
            "scene",
            {},
            {"elements": []},  # the old Excalidraw shape
            {"children": {}},
            {"children": [], "files": {}},
            {"children": ["not-an-object"]},
            {"children": [{"type": "geometry"}]},
            {"children": [{"id": ""}]},
            {"children": [{"id": 1}]},
            {"children": [], "viewport": []},
            {"children": [], "viewport": {"zoom": 1, "origination": [0, 0]}},
            {"children": [], "viewport": {"zoom": 0}},
            {"children": [], "viewport": {"zoom": -1}},
            {"children": [], "viewport": {"zoom": 11}},
            {"children": [], "viewport": {"zoom": True}},
            {"children": [], "viewport": {"zoom": "1"}},
            {"children": [], "theme": "default"},
            {"children": [], "theme": {"themeColorMode": ""}},
            {"children": [], "theme": {"themeColorMode": "x" * 33}},
            {"children": [], "theme": {"themeColorMode": "default", "extra": 1}},
        ],
    )
    def test_rejects_malformed_scenes(self, scene):
        with pytest.raises(serializers.ValidationError):
            validate_plait_scene(scene)


@pytest.mark.unit
class TestPageWhiteboardSerializer:
    def test_create_defaults_to_plait_v2_with_an_empty_scene(self):
        serializer = PageWhiteboardSerializer(data={})
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["scene"] == {"children": []}

    def test_create_rejects_a_legacy_engine_or_schema_version(self):
        assert not PageWhiteboardSerializer(data={"engine": "excalidraw"}).is_valid()
        assert not PageWhiteboardSerializer(data={"schema_version": 1}).is_valid()
        assert PageWhiteboardSerializer(data={"engine": "plait", "schema_version": 2}).is_valid()

    def test_create_rejects_an_excalidraw_scene(self):
        assert not PageWhiteboardSerializer(data={"scene": {"elements": []}}).is_valid()

    def test_asset_ids_must_be_uuids_and_are_deduplicated(self):
        good = str(uuid.uuid4())
        serializer = PageWhiteboardSerializer(data={"asset_ids": [good, good]})
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["asset_ids"] == [good]
        assert not PageWhiteboardSerializer(data={"asset_ids": ["not-a-uuid"]}).is_valid()
        assert not PageWhiteboardSerializer(data={"asset_ids": [1]}).is_valid()

    def test_update_of_a_legacy_board_is_rejected(self):
        legacy = PageWhiteboard(engine="excalidraw", schema_version=1, scene={"elements": []})
        serializer = PageWhiteboardSerializer(legacy, data={"scene": {"children": []}}, partial=True)
        assert not serializer.is_valid()
        assert "no longer supported" in str(serializer.errors)

    def test_update_of_a_plait_board_is_accepted(self):
        board = PageWhiteboard(scene={"children": []})
        serializer = PageWhiteboardSerializer(board, data={"scene": {"children": [_element()]}}, partial=True)
        assert serializer.is_valid(), serializer.errors
