# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import uuid
from datetime import datetime
from copy import deepcopy
from bs4 import BeautifulSoup
from django.core.serializers.json import DjangoJSONEncoder

# Django imports
from django.db import connection, transaction
from django.db.models import (
    Exists,
    OuterRef,
    Q,
    Value,
    UUIDField,
    Count,
    Case,
    When,
    IntegerField,
)
from django.http import StreamingHttpResponse
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models.functions import Coalesce

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    PageSerializer,
    PageDetailSerializer,
    PageBinaryUpdateSerializer,
)
from plane.db.models import (
    Page,
    PageLog,
    UserFavorite,
    ProjectMember,
    ProjectPage,
    Project,
    PageWhiteboard,
    UserRecentVisit,
)
from plane.utils.error_codes import ERROR_CODES

# Local imports
from ..base import BaseAPIView, BaseViewSet
from plane.bgtasks.page_transaction_task import page_transaction
from plane.bgtasks.page_version_task import track_page_version
from plane.bgtasks.recent_visited_task import recent_visited_task
from plane.bgtasks.copy_s3_object import stage_assets, persist_staged_assets, cleanup_copied_assets
from plane.app.permissions import ProjectPagePermission


def unarchive_archive_page_and_descendants(page_id, archived_at):
    # Your SQL query
    sql = """
    WITH RECURSIVE descendants AS (
        SELECT id FROM pages WHERE id = %s
        UNION ALL
        SELECT pages.id FROM pages, descendants WHERE pages.parent_id = descendants.id
    )
    UPDATE pages SET archived_at = %s WHERE id IN (SELECT id FROM descendants);
    """

    # Execute the SQL query
    with connection.cursor() as cursor:
        cursor.execute(sql, [page_id, archived_at])


class PageViewSet(BaseViewSet):
    serializer_class = PageSerializer
    model = Page
    permission_classes = [ProjectPagePermission]
    search_fields = ["name"]

    def get_queryset(self):
        subquery = UserFavorite.objects.filter(
            user=self.request.user,
            entity_type="page",
            entity_identifier=OuterRef("pk"),
            workspace__slug=self.kwargs.get("slug"),
        )
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(
                projects__project_projectmember__member=self.request.user,
                projects__project_projectmember__is_active=True,
                projects__archived_at__isnull=True,
            )
            .filter(parent__isnull=True)
            .filter(Q(owned_by=self.request.user) | Q(access=0))
            .prefetch_related("projects")
            .select_related("workspace")
            .select_related("owned_by")
            .annotate(is_favorite=Exists(subquery))
            .order_by(self.request.GET.get("order_by", "-created_at"))
            .prefetch_related("labels")
            .order_by("-is_favorite", "-created_at")
            .annotate(
                project=Exists(
                    ProjectPage.objects.filter(page_id=OuterRef("id"), project_id=self.kwargs.get("project_id"))
                )
            )
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "page_labels__label_id",
                        distinct=True,
                        filter=~Q(page_labels__label_id__isnull=True),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                project_ids=Coalesce(
                    ArrayAgg("projects__id", distinct=True, filter=~Q(projects__id=True)),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .filter(project=True)
            .distinct()
        )

    def create(self, request, slug, project_id):
        serializer = PageSerializer(
            data=request.data,
            context={
                "project_id": project_id,
                "owned_by_id": request.user.id,
                "description_json": request.data.get("description_json", {}),
                "description_binary": request.data.get("description_binary", None),
                "description_html": request.data.get("description_html", "<p></p>"),
            },
        )

        if serializer.is_valid():
            serializer.save()
            # capture the page transaction
            page_transaction.delay(
                new_description_html=request.data.get("description_html", "<p></p>"),
                old_description_html=None,
                page_id=serializer.data["id"],
            )
            page = self.get_queryset().get(pk=serializer.data["id"])
            serializer = PageDetailSerializer(page)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, project_id, page_id):
        try:
            page = Page.objects.get(
                pk=page_id,
                workspace__slug=slug,
                projects__id=project_id,
                project_pages__deleted_at__isnull=True,
            )

            if page.is_locked:
                return Response({"error": "Page is locked"}, status=status.HTTP_400_BAD_REQUEST)

            parent = request.data.get("parent", None)
            if parent:
                _ = Page.objects.get(
                    pk=parent,
                    workspace__slug=slug,
                    projects__id=project_id,
                    project_pages__deleted_at__isnull=True,
                )

            # Only update access if the page owner is the requesting  user
            if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
                return Response(
                    {"error": "Access cannot be updated since this page is owned by someone else"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer = PageDetailSerializer(page, data=request.data, partial=True)
            page_description = page.description_html
            if serializer.is_valid():
                serializer.save()
                # capture the page transaction
                if request.data.get("description_html"):
                    page_transaction.delay(
                        new_description_html=request.data.get("description_html", "<p></p>"),
                        old_description_html=page_description,
                        page_id=page_id,
                    )

                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Page.DoesNotExist:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def retrieve(self, request, slug, project_id, page_id=None):
        page = self.get_queryset().filter(pk=page_id).first()
        project = Project.objects.get(pk=project_id)
        track_visit = request.query_params.get("track_visit", "true").lower() == "true"

        """
        if the role is guest and guest_view_all_features is false and owned by is not
        the requesting user then dont show the page
        """

        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
            and not page.owned_by == request.user
        ):
            return Response(
                {"error": "You are not allowed to view this page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
        else:
            issue_ids = PageLog.objects.filter(page_id=page_id, entity_name="issue").values_list(
                "entity_identifier", flat=True
            )
            data = PageDetailSerializer(page).data
            data["issue_ids"] = issue_ids
            if track_visit:
                recent_visited_task.delay(
                    slug=slug,
                    entity_name="page",
                    entity_identifier=page_id,
                    user_id=request.user.id,
                    project_id=project_id,
                )
            return Response(data, status=status.HTTP_200_OK)

    def lock(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        page.is_locked = True
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def unlock(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        page.is_locked = False
        page.save()

        return Response(status=status.HTTP_204_NO_CONTENT)

    def access(self, request, slug, project_id, page_id):
        access = request.data.get("access", 0)
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        # Only update access if the page owner is the requesting user
        if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        page.access = access
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def list(self, request, slug, project_id):
        queryset = self.get_queryset()
        project = Project.objects.get(pk=project_id)
        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
        ):
            queryset = queryset.filter(owned_by=request.user)
        pages = PageSerializer(queryset, many=True).data
        return Response(pages, status=status.HTTP_200_OK)

    def archive(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        # only the owner or admin can archive the page
        if (
            ProjectMember.objects.filter(
                project_id=project_id, member=request.user, is_active=True, role__lte=15
            ).exists()
            and request.user.id != page.owned_by_id
        ):
            return Response(
                {"error": "Only the owner or admin can archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        UserFavorite.objects.filter(
            entity_type="page",
            entity_identifier=page_id,
            project_id=project_id,
            workspace__slug=slug,
        ).delete()

        unarchive_archive_page_and_descendants(page_id, datetime.now())

        return Response({"archived_at": str(datetime.now())}, status=status.HTTP_200_OK)

    def unarchive(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        # only the owner or admin can un archive the page
        if (
            ProjectMember.objects.filter(
                project_id=project_id, member=request.user, is_active=True, role__lte=15
            ).exists()
            and request.user.id != page.owned_by_id
        ):
            return Response(
                {"error": "Only the owner or admin can un archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # if parent archived then page will be un archived breaking hierarchy
        if page.parent_id and page.parent.archived_at:
            page.parent = None
            page.save(update_fields=["parent"])

        unarchive_archive_page_and_descendants(page_id, None)

        return Response(status=status.HTTP_204_NO_CONTENT)

    def destroy(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        if page.archived_at is None:
            return Response(
                {"error": "The page should be archived before deleting"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.owned_by_id != request.user.id and (
            not ProjectMember.objects.filter(
                workspace__slug=slug,
                member=request.user,
                role=20,
                project_id=project_id,
                is_active=True,
            ).exists()
        ):
            return Response(
                {"error": "Only admin or owner can delete the page"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # remove parent from all the children
        _ = Page.objects.filter(
            parent_id=page_id,
            projects__id=project_id,
            workspace__slug=slug,
            project_pages__deleted_at__isnull=True,
        ).update(parent=None)

        page.delete()
        # Delete the user favorite page
        UserFavorite.objects.filter(
            project=project_id,
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_type="page",
        ).delete()
        # Delete the page from recent visit
        UserRecentVisit.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_name="page",
        ).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def summary(self, request, slug, project_id):
        queryset = (
            Page.objects.filter(workspace__slug=slug)
            .filter(
                projects__project_projectmember__member=self.request.user,
                projects__project_projectmember__is_active=True,
                projects__archived_at__isnull=True,
            )
            .filter(parent__isnull=True)
            .filter(Q(owned_by=request.user) | Q(access=0))
            .annotate(
                project=Exists(
                    ProjectPage.objects.filter(page_id=OuterRef("id"), project_id=self.kwargs.get("project_id"))
                )
            )
            .filter(project=True)
            .distinct()
        )

        project = Project.objects.get(pk=project_id)
        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=ROLE.GUEST.value,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
        ):
            queryset = queryset.filter(owned_by=request.user)

        stats = queryset.aggregate(
            public_pages=Count(
                Case(
                    When(access=Page.PUBLIC_ACCESS, archived_at__isnull=True, then=1),
                    output_field=IntegerField(),
                )
            ),
            private_pages=Count(
                Case(
                    When(access=Page.PRIVATE_ACCESS, archived_at__isnull=True, then=1),
                    output_field=IntegerField(),
                )
            ),
            archived_pages=Count(Case(When(archived_at__isnull=False, then=1), output_field=IntegerField())),
        )

        return Response(stats, status=status.HTTP_200_OK)


class PageFavoriteViewSet(BaseViewSet):
    model = UserFavorite

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, page_id):
        _ = UserFavorite.objects.create(
            project_id=project_id,
            entity_identifier=page_id,
            entity_type="page",
            user=request.user,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, page_id):
        page_favorite = UserFavorite.objects.get(
            project=project_id,
            user=request.user,
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_type="page",
        )
        page_favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PagesDescriptionViewSet(BaseViewSet):
    permission_classes = [ProjectPagePermission]

    def retrieve(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            Q(owned_by=self.request.user) | Q(access=0),
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )
        binary_data = page.description_binary

        def stream_data():
            if binary_data:
                yield binary_data
            else:
                yield b""

        response = StreamingHttpResponse(stream_data(), content_type="application/octet-stream")
        response["Content-Disposition"] = 'attachment; filename="page_description.bin"'
        return response

    def partial_update(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            Q(owned_by=self.request.user) | Q(access=0),
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        if page.is_locked:
            return Response(
                {
                    "error_code": ERROR_CODES["PAGE_LOCKED"],
                    "error_message": "PAGE_LOCKED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.archived_at:
            return Response(
                {
                    "error_code": ERROR_CODES["PAGE_ARCHIVED"],
                    "error_message": "PAGE_ARCHIVED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Store the old description_html before saving (needed for both tasks)
        old_description_html = page.description_html

        # Serialize the existing instance
        existing_instance = json.dumps({"description_html": old_description_html}, cls=DjangoJSONEncoder)

        # Use serializer for validation and update
        serializer = PageBinaryUpdateSerializer(page, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()

            # Capture the page transaction
            if request.data.get("description_html"):
                page_transaction.delay(
                    new_description_html=request.data.get("description_html", "<p></p>"),
                    old_description_html=old_description_html,
                    page_id=page_id,
                )

            # Run background tasks
            track_page_version.delay(
                page_id=page_id,
                existing_instance=existing_instance,
                user_id=request.user.id,
            )
            return Response({"message": "Updated successfully"})
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PageDuplicateEndpoint(BaseAPIView):
    permission_classes = [ProjectPagePermission]

    @staticmethod
    def _remap_value(value, identifiers):
        if isinstance(value, dict):
            return {key: PageDuplicateEndpoint._remap_value(item, identifiers) for key, item in value.items()}
        if isinstance(value, list):
            return [PageDuplicateEndpoint._remap_value(item, identifiers) for item in value]
        return identifiers.get(str(value), value)

    def post(self, request, slug, project_id, page_id):
        # Snapshot only referenced boards. The row locks make this a consistent
        # scene snapshot without holding a lock while objects are copied to S3.
        with transaction.atomic():
            source = Page.objects.select_for_update().get(
                pk=page_id, workspace__slug=slug, projects__id=project_id, project_pages__deleted_at__isnull=True
            )
            if source.access == Page.PRIVATE_ACCESS and source.owned_by_id != request.user.id:
                return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
            source_html = source.description_html
            source_json = deepcopy(source.description_json)
            project_ids = list(ProjectPage.objects.filter(page_id=source.id).values_list("project_id", flat=True))
            soup = BeautifulSoup(source_html, "html.parser")
            referenced_ids = {node.get("board_identifier") for node in soup.find_all("whiteboard-embed-component") if node.get("board_identifier")}
            source_boards = list(PageWhiteboard.objects.select_for_update().filter(page=source, id__in=referenced_ids))

        inline_asset_ids = [node.get("src") for node in soup.find_all("image-component") if node.get("src")]
        board_asset_ids = [asset_id for board in source_boards for asset_id in board.asset_ids]
        asset_ids = list(dict.fromkeys(inline_asset_ids + board_asset_ids))
        # Stage and verify every object before creating a Page or FileAsset row.
        staged_assets = stage_assets(source.workspace, project_id, asset_ids)
        try:
            with transaction.atomic():
                page = Page.objects.create(
                    id=uuid.uuid4(), workspace=source.workspace, name=f"{source.name} (Copy)", description_html=source_html,
                    description_json=source_json, description_binary=None, owned_by=request.user,
                    access=source.access, color=source.color, view_props=deepcopy(source.view_props),
                    logo_props=deepcopy(source.logo_props), created_by=request.user, updated_by=request.user,
                )
                for destination_project_id in project_ids:
                    ProjectPage.objects.create(
                        workspace_id=page.workspace_id, project_id=destination_project_id, page=page,
                        created_by=request.user, updated_by=request.user,
                    )

                duplicated_assets = persist_staged_assets(page, page.id, project_id, request.user.id, staged_assets)
                asset_map = {item["old_asset_id"]: item["new_asset_id"] for item in duplicated_assets}
                if len(asset_map) != len(asset_ids):
                    raise ValueError("Could not stage every Page asset for duplication.")

                board_map = {}
                for source_board in source_boards:
                    copied = PageWhiteboard.objects.create(
                        workspace=page.workspace, page=page, engine=source_board.engine,
                        schema_version=source_board.schema_version,
                        scene=self._remap_value(deepcopy(source_board.scene), asset_map),
                        asset_ids=[asset_map.get(str(asset_id), str(asset_id)) for asset_id in source_board.asset_ids],
                        revision=1, created_by=request.user, updated_by=request.user,
                    )
                    board_map[str(source_board.id)] = str(copied.id)

                for image in soup.find_all("image-component"):
                    if image.get("src") in asset_map:
                        image["src"] = asset_map[image["src"]]
                for node in soup.find_all("whiteboard-embed-component"):
                    board_id = node.get("board_identifier")
                    if board_id in board_map:
                        node["board_identifier"] = board_map[board_id]
                        node["page_identifier"] = str(page.id)
                page.description_html = str(soup)
                page.description_json = self._remap_value(source_json, {**asset_map, **board_map, str(source.id): str(page.id)})
                page.save()
        except Exception:
            cleanup_copied_assets(source, staged_assets)
            raise

        page_transaction.delay(new_description_html=page.description_html, old_description_html=None, page_id=page.id)
        page = Page.objects.filter(pk=page.id).annotate(
            project_ids=Coalesce(ArrayAgg("projects__id", distinct=True, filter=~Q(projects__id=True)), Value([], output_field=ArrayField(UUIDField())))
        ).first()
        return Response(PageDetailSerializer(page).data, status=status.HTTP_201_CREATED)
