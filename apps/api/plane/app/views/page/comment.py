# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Q
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE
from plane.app.serializers import PageCommentSerializer
from plane.db.models import Page, PageComment, Project, ProjectMember

from ..base import BaseAPIView


class PageCommentEndpoint(BaseAPIView):
    """Comment threads on a page, anchored to a block, a piece of text or a whiteboard element.

    Whoever can see the page can read its comments. Guests are limited to pages they own when the
    project hides features from guests, the same rule the page itself applies.
    """

    def _context(self, request, slug, project_id, page_id):
        """Return ``(page, role)`` for a page the user may see, else ``(None, None)``."""
        member = ProjectMember.objects.filter(
            workspace__slug=slug, project_id=project_id, member=request.user, is_active=True
        ).first()
        if member is None:
            return None, None
        page = (
            Page.objects.filter(
                pk=page_id,
                workspace__slug=slug,
                project_pages__project_id=project_id,
                project_pages__deleted_at__isnull=True,
            )
            .filter(Q(owned_by=request.user) | Q(access=Page.PUBLIC_ACCESS))
            .distinct()
            .first()
        )
        if page is None:
            return None, None
        if member.role == ROLE.GUEST.value and page.owned_by_id != request.user.id:
            if not Project.objects.filter(pk=project_id, guest_view_all_features=True).exists():
                return None, None
        return page, member.role

    def _not_found(self):
        return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

    def get(self, request, slug, project_id, page_id):
        page, _ = self._context(request, slug, project_id, page_id)
        if page is None:
            return self._not_found()
        comments = PageComment.objects.filter(page=page, workspace__slug=slug).order_by("created_at")
        return Response(PageCommentSerializer(comments, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, slug, project_id, page_id):
        page, _ = self._context(request, slug, project_id, page_id)
        if page is None:
            return self._not_found()
        if page.archived_at:
            return Response({"error": "This page is archived."}, status=status.HTTP_403_FORBIDDEN)

        serializer = PageCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        parent_id = request.data.get("parent")
        if parent_id:
            parent = PageComment.objects.filter(pk=parent_id, page=page, parent__isnull=True).first()
            if parent is None:
                return Response({"error": "Parent comment not found"}, status=status.HTTP_400_BAD_REQUEST)
            comment = PageComment.objects.create(
                workspace=page.workspace, page=page, parent=parent, actor=request.user, body=data["body"]
            )
        else:
            anchor_type = data.get("anchor_type")
            anchor_id = data.get("anchor_id")
            if not anchor_type or not anchor_id:
                return Response({"error": "A comment needs an anchor."}, status=status.HTTP_400_BAD_REQUEST)
            anchor_board_id = data.get("anchor_board_id", "")
            if (anchor_type == PageComment.BOARD_ELEMENT) != bool(anchor_board_id):
                return Response(
                    {"error": "anchor_board_id is required for, and only for, whiteboard elements."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            comment = PageComment.objects.create(
                workspace=page.workspace,
                page=page,
                actor=request.user,
                body=data["body"],
                anchor_type=anchor_type,
                anchor_id=anchor_id,
                anchor_board_id=anchor_board_id,
                quote=data.get("quote", ""),
            )
        return Response(PageCommentSerializer(comment).data, status=status.HTTP_201_CREATED)

    def patch(self, request, slug, project_id, page_id, pk):
        page, _ = self._context(request, slug, project_id, page_id)
        if page is None:
            return self._not_found()
        comment = PageComment.objects.filter(pk=pk, page=page).first()
        if comment is None:
            return self._not_found()
        if comment.actor_id != request.user.id:
            return Response({"error": "Only the author can edit a comment."}, status=status.HTTP_403_FORBIDDEN)
        serializer = PageCommentSerializer(data={"body": request.data.get("body")})
        serializer.is_valid(raise_exception=True)
        comment.body = serializer.validated_data["body"]
        comment.edited_at = timezone.now()
        comment.save(update_fields=["body", "edited_at", "updated_at"])
        return Response(PageCommentSerializer(comment).data, status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id, page_id, pk):
        page, role = self._context(request, slug, project_id, page_id)
        if page is None:
            return self._not_found()
        comment = PageComment.objects.filter(pk=pk, page=page).first()
        if comment is None:
            return self._not_found()
        if comment.actor_id != request.user.id and role != ROLE.ADMIN.value:
            return Response(
                {"error": "Only the author or a project admin can delete a comment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Soft deletion does not cascade, so a thread's replies are removed with it.
        comment.replies.all().delete()
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PageCommentResolveEndpoint(PageCommentEndpoint):
    """Resolve (POST) or reopen (DELETE) a top-level comment thread."""

    def _thread(self, request, slug, project_id, page_id, pk):
        page, _ = self._context(request, slug, project_id, page_id)
        if page is None:
            return None
        return PageComment.objects.filter(pk=pk, page=page, parent__isnull=True).first()

    def post(self, request, slug, project_id, page_id, pk):
        thread = self._thread(request, slug, project_id, page_id, pk)
        if thread is None:
            return self._not_found()
        thread.resolved_at = timezone.now()
        thread.resolved_by = request.user
        thread.save(update_fields=["resolved_at", "resolved_by", "updated_at"])
        return Response(PageCommentSerializer(thread).data, status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id, page_id, pk):
        thread = self._thread(request, slug, project_id, page_id, pk)
        if thread is None:
            return self._not_found()
        thread.resolved_at = None
        thread.resolved_by = None
        thread.save(update_fields=["resolved_at", "resolved_by", "updated_at"])
        return Response(PageCommentSerializer(thread).data, status=status.HTTP_200_OK)
