# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ProjectPagePermission
from plane.app.serializers import PageWhiteboardSerializer
from plane.db.models import FileAsset, Page, PageWhiteboard

from ..base import BaseAPIView


class PageWhiteboardEndpoint(BaseAPIView):
    """CRUD for a whiteboard scoped to a Page and a project membership."""

    permission_classes = [ProjectPagePermission]

    def _page(self, slug, project_id, page_id):
        return Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            project_pages__project_id=project_id,
            project_pages__deleted_at__isnull=True,
        )

    def get(self, request, slug, project_id, page_id, board_id=None):
        page = self._page(slug, project_id, page_id)
        boards = PageWhiteboard.objects.filter(page=page, workspace__slug=slug)
        if board_id is None:
            return Response(PageWhiteboardSerializer(boards, many=True).data)
        board = boards.get(pk=board_id)
        return Response(PageWhiteboardSerializer(board).data)

    def post(self, request, slug, project_id, page_id):
        page = self._page(slug, project_id, page_id)
        if page.is_locked or page.archived_at:
            return Response({"detail": "This page cannot be changed."}, status=status.HTTP_403_FORBIDDEN)
        serializer = PageWhiteboardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self._validate_assets(serializer.validated_data.get("asset_ids", []), slug, project_id, page)
        creation_key = serializer.validated_data.get("creation_key")
        with transaction.atomic():
            if creation_key:
                existing = PageWhiteboard.objects.select_for_update().filter(page=page, creation_key=creation_key).first()
                if existing:
                    return Response(PageWhiteboardSerializer(existing).data, status=status.HTTP_200_OK)
            board = serializer.save(workspace=page.workspace, page=page, created_by=request.user, updated_by=request.user)
        return Response(PageWhiteboardSerializer(board).data, status=status.HTTP_201_CREATED)

    def patch(self, request, slug, project_id, page_id, board_id):
        page = self._page(slug, project_id, page_id)
        if page.is_locked or page.archived_at:
            return Response({"detail": "This page cannot be changed."}, status=status.HTTP_403_FORBIDDEN)
        expected_revision = request.data.get("expected_revision")
        # bool is a subclass of int in Python. Revisions must be JSON numbers.
        if type(expected_revision) is not int:
            return Response({"detail": "expected_revision is required."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            board = PageWhiteboard.objects.select_for_update().get(pk=board_id, page=page, workspace__slug=slug)
            if board.revision != expected_revision:
                return Response(
                    {"detail": "Whiteboard changed in another session.", "revision": board.revision},
                    status=status.HTTP_409_CONFLICT,
                )
            serializer = PageWhiteboardSerializer(board, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            self._validate_assets(serializer.validated_data.get("asset_ids", board.asset_ids), slug, project_id, page)
            board = serializer.save(revision=board.revision + 1, updated_by=request.user)
        return Response(PageWhiteboardSerializer(board).data)

    @staticmethod
    def _validate_assets(asset_ids, slug, project_id, page):
        """Only retain durable Page asset IDs, never URLs or inline file data."""
        if not asset_ids:
            return
        valid_count = FileAsset.objects.filter(
            id__in=asset_ids,
            workspace__slug=slug,
            project_id=project_id,
            page=page,
            entity_type=FileAsset.EntityTypeContext.PAGE_DESCRIPTION,
            is_uploaded=True,
        ).count()
        if valid_count != len(asset_ids):
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"asset_ids": "Each asset must be an uploaded asset belonging to this Page."})
