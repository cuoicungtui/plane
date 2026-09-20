# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

from rest_framework.response import Response

from plane.app.permissions import WorkspaceEntityPermission
from plane.app.serializers import WorkspaceWhiteboardLibrarySerializer
from plane.db.models import Workspace, WorkspaceWhiteboardLibrary

from ..base import BaseAPIView


class WorkspaceWhiteboardLibraryEndpoint(BaseAPIView):
    """The shared Excalidraw Library for a workspace, one row per workspace."""

    permission_classes = [WorkspaceEntityPermission]

    def _workspace(self, slug):
        return Workspace.objects.get(slug=slug)

    def get(self, request, slug):
        library, _ = WorkspaceWhiteboardLibrary.objects.get_or_create(workspace=self._workspace(slug))
        return Response(WorkspaceWhiteboardLibrarySerializer(library).data)

    def put(self, request, slug):
        library, _ = WorkspaceWhiteboardLibrary.objects.get_or_create(workspace=self._workspace(slug))
        serializer = WorkspaceWhiteboardLibrarySerializer(library, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        library = serializer.save(updated_by=request.user)
        return Response(WorkspaceWhiteboardLibrarySerializer(library).data)
