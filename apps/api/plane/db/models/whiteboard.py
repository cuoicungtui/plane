# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

from django.db import models

from .base import BaseModel


class PageWhiteboard(BaseModel):
    """A Page-owned Excalidraw scene.

    The Page document only stores this model's ID. Keeping the scene here
    prevents large canvas payloads, data URLs and temporary asset URLs from
    entering the Page Yjs/HTML persistence pipeline.
    """

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="page_whiteboards")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="whiteboards")
    engine = models.CharField(max_length=32, default="excalidraw")
    schema_version = models.PositiveSmallIntegerField(default=1)
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
    """The shared Excalidraw Library for a workspace.

    One row per workspace: every whiteboard embed in that workspace loads
    and contributes to this same set of library items.
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
