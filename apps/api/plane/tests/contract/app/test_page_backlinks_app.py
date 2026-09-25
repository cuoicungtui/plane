# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the pages that mention a Wiki page (backlinks)."""

import uuid
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.bgtasks.page_transaction_task import page_transaction
from plane.db.models import Page, PageLog, Project, ProjectMember, ProjectPage, User, WorkspaceMember


def _backlinks_url(slug, project_id, page_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/pages/{page_id}/backlinks/"


def _make_page(workspace, project, owner, name="Page", **kwargs):
    page = Page.objects.create(workspace=workspace, owned_by=owner, name=name, **kwargs)
    ProjectPage.objects.create(workspace=workspace, project=project, page=page)
    return page


def _mention(workspace, source, target):
    return PageLog.objects.create(
        workspace=workspace,
        page=source,
        entity_name="page",
        entity_identifier=target.id,
        transaction=uuid.uuid4(),
    )


def _member(workspace, project, prefix, role):
    suffix = uuid.uuid4().hex[:8]
    user = User.objects.create(email=f"{prefix}_{suffix}@plane.so", username=f"{prefix}_{suffix}")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=min(role, 15))
    ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=role)
    client = APIClient()
    client.force_authenticate(user=user)
    return user, client


def _names(response):
    return sorted(item["name"] for item in response.json())


@pytest.fixture(autouse=True)
def _no_background_tasks():
    with (
        patch("plane.app.views.page.base.page_transaction"),
        patch("plane.app.views.page.base.recent_visited_task"),
    ):
        yield


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Project BAK", identifier="BAK", workspace=workspace)
    ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=20)
    return project


@pytest.mark.contract
class TestPageBacklinks:
    @pytest.mark.django_db
    def test_lists_pages_that_mention_the_page(self, session_client, workspace, project, create_user):
        target = _make_page(workspace, project, create_user, "Target")
        first = _make_page(workspace, project, create_user, "First")
        second = _make_page(workspace, project, create_user, "Second")
        _make_page(workspace, project, create_user, "Unrelated")
        _mention(workspace, first, target)
        _mention(workspace, second, target)

        response = session_client.get(_backlinks_url(workspace.slug, project.id, target.id))

        assert response.status_code == status.HTTP_200_OK
        assert _names(response) == ["First", "Second"]
        assert set(response.json()[0]) == {"id", "name", "logo_props", "updated_at"}

    @pytest.mark.django_db
    def test_page_mentioned_twice_is_listed_once(self, session_client, workspace, project, create_user):
        target = _make_page(workspace, project, create_user, "Target")
        source = _make_page(workspace, project, create_user, "Source")
        _mention(workspace, source, target)
        _mention(workspace, source, target)

        response = session_client.get(_backlinks_url(workspace.slug, project.id, target.id))

        assert _names(response) == ["Source"]

    @pytest.mark.django_db
    def test_page_without_mentions_has_no_backlinks(self, session_client, workspace, project, create_user):
        target = _make_page(workspace, project, create_user, "Target")

        response = session_client.get(_backlinks_url(workspace.slug, project.id, target.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []

    @pytest.mark.django_db
    def test_a_page_mentioning_itself_is_not_its_own_backlink(self, session_client, workspace, project, create_user):
        target = _make_page(workspace, project, create_user, "Target")
        _mention(workspace, target, target)

        response = session_client.get(_backlinks_url(workspace.slug, project.id, target.id))

        assert response.json() == []

    @pytest.mark.django_db
    def test_other_kinds_of_mentions_are_not_backlinks(self, session_client, workspace, project, create_user):
        target = _make_page(workspace, project, create_user, "Target")
        source = _make_page(workspace, project, create_user, "Source")
        PageLog.objects.create(
            workspace=workspace,
            page=source,
            entity_name="user_mention",
            entity_identifier=target.id,
            transaction=uuid.uuid4(),
        )

        response = session_client.get(_backlinks_url(workspace.slug, project.id, target.id))

        assert response.json() == []

    @pytest.mark.django_db
    def test_archived_source_is_hidden(self, session_client, workspace, project, create_user):
        target = _make_page(workspace, project, create_user, "Target")
        live = _make_page(workspace, project, create_user, "Live")
        archived = _make_page(workspace, project, create_user, "Archived", archived_at=timezone.localdate())
        _mention(workspace, live, target)
        _mention(workspace, archived, target)

        response = session_client.get(_backlinks_url(workspace.slug, project.id, target.id))

        assert _names(response) == ["Live"]

    @pytest.mark.django_db
    def test_other_users_private_source_is_hidden_but_own_private_source_is_shown(
        self, session_client, workspace, project, create_user
    ):
        target = _make_page(workspace, project, create_user, "Target")
        _, member_client = _member(workspace, project, "member", role=15)
        member = User.objects.get(email__startswith="member_")
        theirs = _make_page(workspace, project, member, "Theirs", access=Page.PRIVATE_ACCESS)
        mine = _make_page(workspace, project, create_user, "Mine", access=Page.PRIVATE_ACCESS)
        _mention(workspace, theirs, target)
        _mention(workspace, mine, target)

        as_owner = session_client.get(_backlinks_url(workspace.slug, project.id, target.id))
        as_member = member_client.get(_backlinks_url(workspace.slug, project.id, target.id))

        assert _names(as_owner) == ["Mine"]
        assert _names(as_member) == ["Theirs"]

    @pytest.mark.django_db
    def test_source_from_another_project_is_hidden(self, session_client, workspace, project, create_user):
        other = Project.objects.create(name="Project OTH", identifier="OTH", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=other, member=create_user, role=20)
        target = _make_page(workspace, project, create_user, "Target")
        elsewhere = _make_page(workspace, other, create_user, "Elsewhere")
        _mention(workspace, elsewhere, target)

        response = session_client.get(_backlinks_url(workspace.slug, project.id, target.id))

        assert response.json() == []

    @pytest.mark.django_db
    def test_other_users_private_target_is_not_reachable(self, workspace, project, create_user):
        target = _make_page(workspace, project, create_user, "Target", access=Page.PRIVATE_ACCESS)
        _, member_client = _member(workspace, project, "member", role=15)

        response = member_client.get(_backlinks_url(workspace.slug, project.id, target.id))

        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

    @pytest.mark.django_db
    def test_guest_only_sees_own_pages_when_guest_view_is_off(self, session_client, workspace, project, create_user):
        project.guest_view_all_features = False
        project.save(update_fields=["guest_view_all_features"])
        guest, guest_client = _member(workspace, project, "guest", role=5)
        target = _make_page(workspace, project, create_user, "Target")
        own_target = _make_page(workspace, project, guest, "Guest target")
        by_member = _make_page(workspace, project, create_user, "By member")
        by_guest = _make_page(workspace, project, guest, "By guest")
        _mention(workspace, by_member, own_target)
        _mention(workspace, by_guest, own_target)
        _mention(workspace, by_guest, target)

        denied = guest_client.get(_backlinks_url(workspace.slug, project.id, target.id))
        allowed = guest_client.get(_backlinks_url(workspace.slug, project.id, own_target.id))

        assert denied.status_code == status.HTTP_400_BAD_REQUEST
        assert _names(allowed) == ["By guest"]

    @pytest.mark.django_db
    def test_requires_project_membership(self, workspace, project, create_user):
        target = _make_page(workspace, project, create_user, "Target")
        outsider = User.objects.create(email="outsider@plane.so", username="outsider")
        client = APIClient()
        client.force_authenticate(user=outsider)

        response = client.get(_backlinks_url(workspace.slug, project.id, target.id))

        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)


@pytest.mark.contract
class TestPageMentionLogging:
    @pytest.mark.django_db
    def test_saving_a_page_mention_creates_a_backlink_and_removing_it_deletes_it(
        self, session_client, workspace, project, create_user
    ):
        target = _make_page(workspace, project, create_user, "Target")
        source = _make_page(workspace, project, create_user, "Source")
        mention_id = str(uuid.uuid4())
        html = (
            f'<p>See <mention-component id="{mention_id}" entity_identifier="{target.id}" '
            f'entity_name="page"></mention-component></p>'
        )

        page_transaction(html, "<p></p>", str(source.id))
        listed = session_client.get(_backlinks_url(workspace.slug, project.id, target.id))
        assert _names(listed) == ["Source"]

        page_transaction("<p></p>", html, str(source.id))
        listed = session_client.get(_backlinks_url(workspace.slug, project.id, target.id))
        assert listed.json() == []
