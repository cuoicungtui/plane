# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

import json
import math
import uuid

from rest_framework import serializers

from plane.app.serializers.base import BaseSerializer
from plane.db.models import PageWhiteboard, WorkspaceWhiteboardLibrary


MAX_SCENE_BYTES = 5 * 1024 * 1024
MAX_LIBRARY_BYTES = 5 * 1024 * 1024

# Plait scene, schema v2: ``children`` is the board's element tree. ``viewport``
# keeps only the zoom (the scroll origin is recomputed on load) and ``theme``
# the colour mode. Anything else is rejected so that stored scenes stay
# predictable; bump ``PageWhiteboard.CURRENT_SCHEMA_VERSION`` to add keys.
SCENE_KEYS = {"children", "viewport", "theme"}
MAX_ZOOM = 10
MAX_THEME_MODE_LENGTH = 32

LEGACY_ENGINE_MESSAGE = "This whiteboard was created with an engine that is no longer supported and is read-only."


def _is_number(value):
    # bool is a subclass of int in Python; JSON booleans are not numbers here.
    return type(value) in (int, float) and math.isfinite(value)


def validate_plait_scene(scene):
    """Check the shape of a Plait v2 scene. Raises ``serializers.ValidationError``."""
    if not isinstance(scene, dict):
        raise serializers.ValidationError("Scene must be an object.")
    unknown = set(scene) - SCENE_KEYS
    if unknown:
        raise serializers.ValidationError(f"Scene has unsupported keys: {', '.join(sorted(unknown))}.")

    children = scene.get("children")
    if not isinstance(children, list):
        raise serializers.ValidationError("Scene must have a 'children' list.")
    for element in children:
        if not isinstance(element, dict) or not isinstance(element.get("id"), str) or not element["id"]:
            raise serializers.ValidationError("Every element in 'children' must be an object with a string 'id'.")

    viewport = scene.get("viewport")
    if viewport is not None:
        if not isinstance(viewport, dict) or set(viewport) - {"zoom"}:
            raise serializers.ValidationError("'viewport' may only contain 'zoom'.")
        zoom = viewport.get("zoom")
        if zoom is not None and not (_is_number(zoom) and 0 < zoom <= MAX_ZOOM):
            raise serializers.ValidationError(f"'viewport.zoom' must be a number greater than 0 and at most {MAX_ZOOM}.")

    theme = scene.get("theme")
    if theme is not None:
        if not isinstance(theme, dict) or set(theme) - {"themeColorMode"}:
            raise serializers.ValidationError("'theme' may only contain 'themeColorMode'.")
        mode = theme.get("themeColorMode")
        if mode is not None and not (isinstance(mode, str) and 0 < len(mode) <= MAX_THEME_MODE_LENGTH):
            raise serializers.ValidationError("'theme.themeColorMode' must be a short string.")


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

    def validate_engine(self, value):
        if value != PageWhiteboard.ENGINE_PLAIT:
            raise serializers.ValidationError(f"engine must be '{PageWhiteboard.ENGINE_PLAIT}'.")
        return value

    def validate_schema_version(self, value):
        if value != PageWhiteboard.CURRENT_SCHEMA_VERSION:
            raise serializers.ValidationError(f"schema_version must be {PageWhiteboard.CURRENT_SCHEMA_VERSION}.")
        return value

    def validate_scene(self, value):
        validate_plait_scene(value)
        if len(json.dumps(value, separators=(",", ":")).encode("utf-8")) > MAX_SCENE_BYTES:
            raise serializers.ValidationError("Scene exceeds the 5 MB limit.")
        return value

    def validate_asset_ids(self, value):
        if not isinstance(value, list) or not all(isinstance(asset_id, str) for asset_id in value):
            raise serializers.ValidationError("asset_ids must be a list of asset IDs.")
        for asset_id in value:
            try:
                uuid.UUID(asset_id)
            except ValueError:
                raise serializers.ValidationError("asset_ids must be a list of asset IDs.") from None
        return list(dict.fromkeys(value))

    def validate(self, attrs):
        if self.instance is None:
            # The model default (an empty object) is not a valid v2 scene.
            attrs.setdefault("scene", {"children": []})
        elif self.instance.engine != PageWhiteboard.ENGINE_PLAIT:
            # Boards written by the previous (Excalidraw) engine cannot be
            # edited; the client shows them as unsupported and never saves.
            raise serializers.ValidationError(LEGACY_ENGINE_MESSAGE)
        return attrs


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
