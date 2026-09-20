# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

import json

from rest_framework import serializers

from plane.app.serializers.base import BaseSerializer
from plane.db.models import PageWhiteboard, WorkspaceWhiteboardLibrary


MAX_SCENE_BYTES = 5 * 1024 * 1024
MAX_LIBRARY_BYTES = 5 * 1024 * 1024


class PageWhiteboardSerializer(BaseSerializer):
    class Meta:
        model = PageWhiteboard
        fields = [
            "id",
            "workspace",
            "page",
            "engine",
            "schema_version",
            "scene",
            "asset_ids",
            "revision",
            "creation_key",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["id", "workspace", "page", "revision", "created_at", "updated_at", "created_by", "updated_by"]

    def validate_scene(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Scene must be an object.")
        if len(json.dumps(value, separators=(",", ":")).encode("utf-8")) > MAX_SCENE_BYTES:
            raise serializers.ValidationError("Scene exceeds the 5 MB limit.")
        return value

    def validate_asset_ids(self, value):
        if not isinstance(value, list) or not all(isinstance(asset_id, str) for asset_id in value):
            raise serializers.ValidationError("asset_ids must be a list of asset IDs.")
        return list(dict.fromkeys(value))


class WorkspaceWhiteboardLibrarySerializer(BaseSerializer):
    class Meta:
        model = WorkspaceWhiteboardLibrary
        fields = [
            "id",
            "workspace",
            "library_items",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["id", "workspace", "created_at", "updated_at", "created_by", "updated_by"]

    def validate_library_items(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("library_items must be a list.")
        if len(json.dumps(value, separators=(",", ":")).encode("utf-8")) > MAX_LIBRARY_BYTES:
            raise serializers.ValidationError("Library exceeds the 5 MB limit.")
        return value
