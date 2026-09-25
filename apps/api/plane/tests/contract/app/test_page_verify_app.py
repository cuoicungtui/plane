# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for verifying a Wiki page for a limited time."""

import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Page, Project, ProjectMember, ProjectPage, User, WorkspaceMember


def _url(slug, project_id, page_id, suffix=""):
    return f"/api/workspaces/{slug}/projects/{project_id}/pages/{page_id}/{suffix}"


def _verify(client, workspace, project, page, payload=None):
    return client.post(_url(workspace.slug, project.id, page.id, "verify/"), payload or {}, format="json")


def _make_page(workspace, project, owner, name="Page", **kwargs):
    page = Page.objects.create(workspace=workspace, owned_by=owner, name=name, **kwargs)
    ProjectPage.objects.create(workspace=workspace, project=project, page=page)
    return page


def _member(workspace, project, prefix, role):
    suffix = uuid.uuid4().hex[:8]
    user = User.objects.create(email=f"{prefix}_{suffix}@plane.so", username=f"{prefix}_{suffix}")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=min(role, 15))
    ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=role)
    client = APIClient()
    client.force_authenticate(user=user)
    return user, client


def _in_days(days):
    return (timezone.localdate() + timedelta(days=days)).isoformat()


def _verification(page):
    page.refresh_from_db()
    return page.verified_at, page.verified_by_id, page.verify_expires_at


@pytest.fixture(autouse=True)
def _no_background_tasks():
    with (
        patch("plane.app.views.page.base.page_transaction"),
        patch("plane.app.views.page.base.recent_visited_task"),
    ):
        yield


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Project VER", identifier="VER", workspace=workspace)
    ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=20)
    return project


@pytest.mark.contract
class TestPageVerify:
    @pytest.mark.django_db
    def test_verify_records_who_when_and_expiry(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user)

        response = _verify(session_client, workspace, project, page, {"expires_at": _in_days(30)})

        assert response.status_code == status.HTTP_200_OK
        verified_at, verified_by, expires_at = _verification(page)
        assert verified_at is not None
        assert verified_by == create_user.id
        assert expires_at.isoformat() == _in_days(30)
        body = response.json()
        assert body["verified_by"] == str(create_user.id)
        assert body["verify_expires_at"] == _in_days(30)

    @pytest.mark.django_db
    def test_verify_without_expiry_never_expires(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user)

        response = _verify(session_client, workspace, project, page)

        assert response.status_code == status.HTTP_200_OK
        verified_at, _, expires_at = _verification(page)
        assert verified_at is not None
        assert expires_at is None

    @pytest.mark.django_db
    def test_verify_again_extends_the_expiry_and_takes_the_new_verifier(
        self, session_client, workspace, project, create_user
    ):
        page = _make_page(workspace, project, create_user)
        _verify(session_client, workspace, project, page, {"expires_at": _in_days(7)})
        second, second_client = _member(workspace, project, "second", role=15)

        response = _verify(second_client, workspace, project, page, {"expires_at": _in_days(90)})

        assert response.status_code == status.HTTP_200_OK
        _, verified_by, expires_at = _verification(page)
        assert expires_at.isoformat() == _in_days(90)
        assert verified_by == second.id

    @pytest.mark.django_db
    @pytest.mark.parametrize("days", [-1, 0])
    def test_expiry_must_be_after_today(self, session_client, workspace, project, create_user, days):
        page = _make_page(workspace, project, create_user)

        response = _verify(session_client, workspace, project, page, {"expires_at": _in_days(days)})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert _verification(page) == (None, None, None)

    @pytest.mark.django_db
    @pytest.mark.parametrize("value", ["not-a-date", "2026-13-40", 12345])
    def test_expiry_must_be_a_date(self, session_client, workspace, project, create_user, value):
        page = _make_page(workspace, project, create_user)

        response = _verify(session_client, workspace, project, page, {"expires_at": value})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert _verification(page) == (None, None, None)

    @pytest.mark.django_db
    def test_archived_page_cannot_be_verified(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user, archived_at=timezone.localdate())

        response = _verify(session_client, workspace, project, page)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert _verification(page) == (None, None, None)

    @pytest.mark.django_db
    def test_guest_cannot_verify_or_unverify(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user)
        _, guest_client = _member(workspace, project, "guest", role=5)

        assert _verify(guest_client, workspace, project, page).status_code == status.HTTP_403_FORBIDDEN
        assert _verification(page) == (None, None, None)

        _verify(session_client, workspace, project, page)
        unverify = guest_client.delete(_url(workspace.slug, project.id, page.id, "verify/"))
        assert unverify.status_code == status.HTTP_403_FORBIDDEN
        assert _verification(page)[0] is not None

    @pytest.mark.django_db
    def test_other_users_private_page_cannot_be_verified(self, workspace, project, create_user):
        page = _make_page(workspace, project, create_user, access=Page.PRIVATE_ACCESS)
        _, member_client = _member(workspace, project, "member", role=15)

        response = _verify(member_client, workspace, project, page)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert _verification(page) == (None, None, None)

    @pytest.mark.django_db
    def test_page_of_another_project_is_not_reachable(self, session_client, workspace, project, create_user):
        other = Project.objects.create(name="Project OTH", identifier="OTH", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=other, member=create_user, role=20)
        page = _make_page(workspace, other, create_user)

        response = _verify(session_client, workspace, project, page)

        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)
        assert _verification(page) == (None, None, None)

    @pytest.mark.django_db
    def test_unverify_clears_all_three_fields(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user)
        _verify(session_client, workspace, project, page, {"expires_at": _in_days(30)})

        response = session_client.delete(_url(workspace.slug, project.id, page.id, "verify/"))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert _verification(page) == (None, None, None)

    @pytest.mark.django_db
    def test_patch_cannot_set_verification_fields(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user)

        session_client.patch(
            _url(workspace.slug, project.id, page.id),
            {
                "verified_at": timezone.now().isoformat(),
                "verified_by": str(create_user.id),
                "verify_expires_at": _in_days(5),
            },
            format="json",
        )

        assert _verification(page) == (None, None, None)

    @pytest.mark.django_db
    def test_editing_a_verified_page_keeps_it_verified(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user)
        _verify(session_client, workspace, project, page, {"expires_at": _in_days(30)})

        session_client.patch(_url(workspace.slug, project.id, page.id), {"name": "Renamed"}, format="json")

        page.refresh_from_db()
        assert page.name == "Renamed"
        assert page.verified_at is not None

    @pytest.mark.django_db
    def test_list_and_detail_expose_verification(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user)
        _verify(session_client, workspace, project, page, {"expires_at": _in_days(30)})

        listed = session_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/").json()
        detail = session_client.get(_url(workspace.slug, project.id, page.id)).json()

        for item in (listed[0], detail):
            assert item["verified_by"] == str(create_user.id)
            assert item["verify_expires_at"] == _in_days(30)
            assert item["verified_at"] is not None

    @pytest.mark.django_db
    def test_duplicate_is_not_verified(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user)
        _verify(session_client, workspace, project, page)

        response = session_client.post(_url(workspace.slug, project.id, page.id, "duplicate/"), format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert _verification(Page.objects.get(pk=response.json()["id"])) == (None, None, None)
