# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

from django.db import models

from .base import BaseModel


class PageWhiteboard(BaseModel):
    """A Page-owned Plait scene.

    The Page document only stores this model's ID. Keeping the scene here
    prevents large canvas payloads, data URLs and temporary asset URLs from
    entering the Page Yjs/HTML persistence pipeline.

    Rows created before the Plait migration have ``engine="excalidraw"`` and
    ``schema_version=1``. They are kept untouched and are read-only: the API
    still returns them, but rejects writes to them.
    """

    ENGINE_PLAIT = "plait"
    ENGINE_EXCALIDRAW = "excalidraw"  # legacy, read-only
    CURRENT_SCHEMA_VERSION = 2

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="page_whiteboards")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="whiteboards")
    engine = models.CharField(max_length=32, default=ENGINE_PLAIT)
    schema_version = models.PositiveSmallIntegerField(default=CURRENT_SCHEMA_VERSION)
    scene = models.JSONField(default=dict)
    asset_ids = models.JSONField(default=list, blank=True)
    revision = models.PositiveIntegerField(default=1)
    creation_key = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "page_whiteboards"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["page", "creation_key"],
                condition=models.Q(creation_key__isnull=False),
                name="page_whiteboard_unique_creation_key",
            )
        ]

    def __str__(self):
        return f"{self.page_id} <{self.id}>"


class WorkspaceWhiteboardLibrary(BaseModel):
    """The shared shape library for a workspace.

    One row per workspace. The Plait whiteboard UI does not read or write it
    (the Excalidraw library format is not portable); the table and endpoint
    stay in place so existing data is kept until the template feature lands.
    """

    workspace = models.OneToOneField(
        "db.Workspace", on_delete=models.CASCADE, related_name="whiteboard_library"
    )
    library_items = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "workspace_whiteboard_libraries"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace_id} <{self.id}>"
