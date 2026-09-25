# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

import uuid
from unittest.mock import Mock

import pytest
from rest_framework import status

from plane.db.models import Page, PageWhiteboard, Project, ProjectMember, ProjectPage


def _url(slug, project_id, page_id, board_id=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/pages/{page_id}/whiteboards/"
    return f"{base}{board_id}/" if board_id else base


def _page_for(workspace, user):
    project = Project.objects.create(
        name="Whiteboards",
        identifier=f"WB{uuid.uuid4().hex[:6].upper()}",
        workspace=workspace,
    )
    ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=20)
    page = Page.objects.create(workspace=workspace, owned_by=user, name="Canvas")
    ProjectPage.objects.create(workspace=workspace, project=project, page=page)
    return project, page


@pytest.mark.contract
@pytest.mark.django_db
class TestPageWhiteboardEndpoint:
    def test_creation_key_is_idempotent(self, session_client, workspace, create_user):
        project, page = _page_for(workspace, create_user)
        payload = {"creation_key": str(uuid.uuid4()), "scene": {"children": []}, "asset_ids": []}

        first = session_client.post(_url(workspace.slug, project.id, page.id), payload, content_type="application/json")
        second = session_client.post(_url(workspace.slug, project.id, page.id), payload, content_type="application/json")

        assert first.status_code == status.HTTP_201_CREATED
        assert second.status_code == status.HTTP_200_OK
        assert first.json()["id"] == second.json()["id"]
        assert PageWhiteboard.objects.filter(page=page).count() == 1

    def test_created_board_is_plait_schema_v2(self, session_client, workspace, create_user):
        project, page = _page_for(workspace, create_user)

        response = session_client.post(_url(workspace.slug, project.id, page.id), {}, content_type="application/json")

        assert response.status_code == status.HTTP_201_CREATED
        body = response.json()
        assert body["engine"] == "plait"
        assert body["schema_version"] == 2
        assert body["scene"] == {"children": []}
        assert body["revision"] == 1

    @pytest.mark.parametrize(
        "payload",
        [
            {"engine": "excalidraw"},
            {"schema_version": 1},
            {"scene": {"elements": []}},
            {"scene": {"children": [{"type": "geometry"}]}},
            {"asset_ids": ["not-a-uuid"]},
        ],
    )
    def test_create_rejects_invalid_payloads(self, session_client, workspace, create_user, payload):
        project, page = _page_for(workspace, create_user)

        response = session_client.post(_url(workspace.slug, project.id, page.id), payload, content_type="application/json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert PageWhiteboard.objects.filter(page=page).count() == 0

    def test_update_saves_scene_and_bumps_revision(self, session_client, workspace, create_user):
        project, page = _page_for(workspace, create_user)
        board = PageWhiteboard.objects.create(workspace=workspace, page=page, scene={"children": []})
        scene = {"children": [{"id": "n1", "type": "geometry"}], "viewport": {"zoom": 2}, "theme": {"themeColorMode": "default"}}

        response = session_client.patch(
            _url(workspace.slug, project.id, page.id, board.id),
            {"expected_revision": 1, "scene": scene},
            content_type="application/json",
        )

        assert response.status_code == status.HTTP_200_OK
        board.refresh_from_db()
        assert board.revision == 2
        assert board.scene == scene

    def test_update_rejects_invalid_scene_and_engine_change(self, session_client, workspace, create_user):
        project, page = _page_for(workspace, create_user)
        board = PageWhiteboard.objects.create(workspace=workspace, page=page, scene={"children": []})
        url = _url(workspace.slug, project.id, page.id, board.id)

        bad_scene = session_client.patch(
            url, {"expected_revision": 1, "scene": {"elements": []}}, content_type="application/json"
        )
        engine_change = session_client.patch(
            url, {"expected_revision": 1, "engine": "excalidraw"}, content_type="application/json"
        )

        assert bad_scene.status_code == status.HTTP_400_BAD_REQUEST
        assert engine_change.status_code == status.HTTP_400_BAD_REQUEST
        board.refresh_from_db()
        assert (board.revision, board.engine, board.scene) == (1, "plait", {"children": []})

    def test_legacy_excalidraw_board_is_readable_but_read_only(self, session_client, workspace, create_user):
        project, page = _page_for(workspace, create_user)
        legacy_scene = {"elements": [{"id": "old"}], "files": {}}
        board = PageWhiteboard.objects.create(
            workspace=workspace, page=page, engine="excalidraw", schema_version=1, scene=legacy_scene
        )
        url = _url(workspace.slug, project.id, page.id, board.id)

        read = session_client.get(url)
        write = session_client.patch(
            url, {"expected_revision": 1, "scene": {"children": []}}, content_type="application/json"
        )

        assert read.status_code == status.HTTP_200_OK
        assert read.json()["engine"] == "excalidraw"
        assert read.json()["scene"] == legacy_scene
        assert write.status_code == status.HTTP_400_BAD_REQUEST
        board.refresh_from_db()
        assert (board.revision, board.engine, board.scene) == (1, "excalidraw", legacy_scene)

    def test_update_requires_matching_revision(self, session_client, workspace, create_user):
        project, page = _page_for(workspace, create_user)
        board = PageWhiteboard.objects.create(workspace=workspace, page=page, scene={"children": []})

        response = session_client.patch(
            _url(workspace.slug, project.id, page.id, board.id),
            {"expected_revision": 0, "scene": {"children": [{"id": "late"}]}},
            content_type="application/json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT

    def test_update_rejects_boolean_revision(self, session_client, workspace, create_user):
        project, page = _page_for(workspace, create_user)
        board = PageWhiteboard.objects.create(workspace=workspace, page=page, scene={"children": []})
        response = session_client.patch(
            _url(workspace.slug, project.id, page.id, board.id),
            {"expected_revision": True, "scene": {"children": []}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        board.refresh_from_db()
        assert board.revision == 1

    def test_project_scope_denies_a_board_from_another_project(self, session_client, workspace, create_user):
        project, page = _page_for(workspace, create_user)
        other = Project.objects.create(name="Other", identifier=f"OT{uuid.uuid4().hex[:6].upper()}", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=other, member=create_user, role=20)
        board = PageWhiteboard.objects.create(workspace=workspace, page=page, scene={"children": []})

        response = session_client.get(_url(workspace.slug, other.id, page.id, board.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_duplicate_clones_referenced_whiteboard_and_remaps_scene(self, session_client, workspace, create_user, monkeypatch):
        project, page = _page_for(workspace, create_user)
        old_asset, new_asset = str(uuid.uuid4()), str(uuid.uuid4())
        board = PageWhiteboard.objects.create(
            workspace=workspace,
            page=page,
            scene={
                "children": [
                    {"id": "img", "type": "image", "url": old_asset, "points": [[0, 0], [10, 10]]},
                    # An image attached to a mind map node sits deeper in the scene.
                    {
                        "id": "mind",
                        "type": "mindmap",
                        "data": {"topic": {"children": [{"text": "Root"}]}, "image": {"url": old_asset, "width": 8, "height": 8}},
                        "children": [],
                    },
                ]
            },
            asset_ids=[old_asset],
        )
        page.description_html = (
            f'<whiteboard-embed-component board_identifier="{board.id}" '
            f'page_identifier="{page.id}"></whiteboard-embed-component>'
        )
        page.description_json = {"content": [{"attrs": {"board_identifier": str(board.id), "fileId": old_asset}}]}
        page.save(update_fields=["description_html", "description_json"])

        monkeypatch.setattr("plane.app.views.page.base.stage_assets", lambda *_args: [{"new_asset_key": "copy/key"}])
        monkeypatch.setattr(
            "plane.app.views.page.base.persist_staged_assets",
            lambda *_args: [{"old_asset_id": old_asset, "new_asset_id": new_asset, "new_asset_key": "copy/key"}],
        )
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{page.id}/duplicate/", format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        copied_page = Page.objects.exclude(id=page.id).get(name="Canvas (Copy)")
        copied_board = PageWhiteboard.objects.get(page=copied_page)
        assert copied_board.id != board.id
        assert copied_board.asset_ids == [new_asset]
        assert copied_board.engine == board.engine
        assert copied_board.schema_version == board.schema_version
        assert copied_board.scene["children"][0]["url"] == new_asset
        assert copied_board.scene["children"][1]["data"]["image"]["url"] == new_asset
        assert old_asset not in str(copied_board.scene)
        assert str(copied_board.id) in copied_page.description_html
        assert new_asset in str(copied_page.description_json)
        assert str(board.id) not in str(copied_page.description_json)

    def test_duplicate_cleans_staged_objects_and_rolls_back_page_on_database_error(
        self, session_client, workspace, create_user, monkeypatch
    ):
        project, page = _page_for(workspace, create_user)
        staged_assets = [{"new_asset_key": "copied/object"}]
        cleanup = Mock()
        monkeypatch.setattr("plane.app.views.page.base.stage_assets", lambda *_args: staged_assets)
        monkeypatch.setattr("plane.app.views.page.base.persist_staged_assets", Mock(side_effect=RuntimeError("database failure")))
        monkeypatch.setattr("plane.app.views.page.base.cleanup_copied_assets", cleanup)
        session_client.raise_request_exception = False

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{page.id}/duplicate/", format="json"
        )

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert Page.objects.filter(workspace=workspace).count() == 1
        assert PageWhiteboard.objects.filter(page=page).count() == 0
        cleanup.assert_called_once_with(page, staged_assets)
