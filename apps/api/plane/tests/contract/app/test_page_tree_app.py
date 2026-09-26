# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Contract tests for the project page tree (Wiki).

Pages already had a parent column, but the API only served root pages: a
sub-page could not be opened, creating one answered 404 after the row was
written, and the parent was not checked against the project or workspace.
"""

import threading
import time
import uuid
from unittest.mock import patch

import pytest
from django.db import connections
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.app.views.page.base import is_page_or_ancestor
from plane.db.models import Page, Project, ProjectMember, ProjectPage, User, Workspace, WorkspaceMember

STEP = Page.DEFAULT_SORT_ORDER


def _pages_url(slug, project_id, page_id=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/pages/"
    return f"{base}{page_id}/" if page_id else base


def _position_url(slug, project_id, page_id):
    return f"{_pages_url(slug, project_id, page_id)}position/"


def _move(client, page, project, parent=None, prev=None):
    return client.post(
        _position_url(page.workspace.slug, project.id, page.id),
        {"parent_id": str(parent.id) if parent else None, "prev_sibling_id": str(prev.id) if prev else None},
        format="json",
    )


def _tree_order(project, parent):
    """Names under parent in tree order, as the client sorts them."""
    return list(
        Page.objects.filter(parent=parent, project_pages__project=project)
        .order_by("sort_order", "created_at", "id")
        .values_list("name", flat=True)
    )


def _make_project(workspace, identifier, **kwargs):
    return Project.objects.create(name=f"Project {identifier}", identifier=identifier, workspace=workspace, **kwargs)


def _make_page(workspace, project, owner, name="Page", access=Page.PUBLIC_ACCESS, parent=None, **kwargs):
    page = Page.objects.create(workspace=workspace, owned_by=owner, access=access, name=name, parent=parent, **kwargs)
    ProjectPage.objects.create(workspace=workspace, project=project, page=page)
    return page


def _make_user(prefix):
    suffix = uuid.uuid4().hex[:8]
    return User.objects.create(email=f"{prefix}_{suffix}@plane.so", username=f"{prefix}_{suffix}")


def _client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture(autouse=True)
def _no_background_tasks():
    with (
        patch("plane.app.views.page.base.page_transaction"),
        patch("plane.app.views.page.base.recent_visited_task"),
    ):
        yield


@pytest.fixture
def project(workspace, create_user):
    project = _make_project(workspace, "WIKI")
    ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=20)
    return project


@pytest.fixture
def other_user(workspace, project):
    user = _make_user("member")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=15)
    return user


@pytest.mark.contract
class TestPageTreeList:
    @pytest.mark.django_db
    def test_default_list_returns_only_root_pages(self, session_client, workspace, project, create_user):
        root = _make_page(workspace, project, create_user, "Root")
        _make_page(workspace, project, create_user, "Child", parent=root)

        response = session_client.get(_pages_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_200_OK
        assert [item["id"] for item in response.json()] == [str(root.id)]

    @pytest.mark.django_db
    def test_include_children_returns_sub_pages_with_parent_and_sort_order(
        self, session_client, workspace, project, create_user
    ):
        root = _make_page(workspace, project, create_user, "Root")
        child = _make_page(workspace, project, create_user, "Child", parent=root, sort_order=2 * STEP)
        grandchild = _make_page(workspace, project, create_user, "Grandchild", parent=child)

        response = session_client.get(_pages_url(workspace.slug, project.id), {"include_children": "true"})

        assert response.status_code == status.HTTP_200_OK
        by_id = {item["id"]: item for item in response.json()}
        assert set(by_id) == {str(root.id), str(child.id), str(grandchild.id)}
        assert by_id[str(root.id)]["parent"] is None
        assert by_id[str(child.id)]["parent"] == str(root.id)
        assert by_id[str(child.id)]["sort_order"] == 2 * STEP
        assert by_id[str(grandchild.id)]["parent"] == str(child.id)

    @pytest.mark.django_db
    def test_include_children_hides_private_sub_pages_of_other_users(
        self, session_client, workspace, project, create_user, other_user
    ):
        root = _make_page(workspace, project, create_user, "Root")
        own_private = _make_page(workspace, project, create_user, "Mine", access=Page.PRIVATE_ACCESS, parent=root)
        others_private = _make_page(workspace, project, other_user, "Theirs", access=Page.PRIVATE_ACCESS, parent=root)
        # A public page below someone else's private page stays visible (D13).
        public_below_private = _make_page(workspace, project, other_user, "Public", parent=others_private)

        response = session_client.get(_pages_url(workspace.slug, project.id), {"include_children": "true"})

        ids = {item["id"] for item in response.json()}
        assert ids == {str(root.id), str(own_private.id), str(public_below_private.id)}
        assert str(others_private.id) not in ids

    @pytest.mark.django_db
    def test_include_children_keeps_guest_restriction(self, workspace, project, create_user):
        guest = _make_user("guest")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(workspace=workspace, project=project, member=guest, role=5)
        root = _make_page(workspace, project, create_user, "Root")
        _make_page(workspace, project, create_user, "Child", parent=root)
        guest_child = _make_page(workspace, project, guest, "Guest child", parent=root)

        response = _client_for(guest).get(_pages_url(workspace.slug, project.id), {"include_children": "true"})

        assert response.status_code == status.HTTP_200_OK
        assert [item["id"] for item in response.json()] == [str(guest_child.id)]


@pytest.mark.contract
class TestPageTreeRetrieve:
    @pytest.mark.django_db
    def test_sub_page_can_be_opened(self, session_client, workspace, project, create_user):
        root = _make_page(workspace, project, create_user, "Root")
        child = _make_page(workspace, project, create_user, "Child", parent=root)

        response = session_client.get(_pages_url(workspace.slug, project.id, child.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["id"] == str(child.id)
        assert response.json()["parent"] == str(root.id)

    @pytest.mark.django_db
    def test_guest_gets_404_not_500_when_page_is_not_served(self, workspace, create_user):
        """The guest check used to read page.owned_by before the None check."""
        archived_project = _make_project(workspace, "ARCH", archived_at=timezone.now())
        guest = _make_user("guest")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(workspace=workspace, project=archived_project, member=guest, role=5)
        page = _make_page(workspace, archived_project, create_user, "Hidden")

        response = _client_for(guest).get(_pages_url(workspace.slug, archived_project.id, page.id))

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.contract
class TestPageTreeCreate:
    @pytest.mark.django_db
    def test_create_sub_page_returns_201_and_appends(self, session_client, workspace, project, create_user):
        root = _make_page(workspace, project, create_user, "Root")
        url = _pages_url(workspace.slug, project.id)

        first = session_client.post(url, {"name": "First", "parent": str(root.id)}, format="json")
        second = session_client.post(url, {"name": "Second", "parent": str(root.id)}, format="json")

        assert first.status_code == status.HTTP_201_CREATED
        assert first.json()["parent"] == str(root.id)
        assert first.json()["sort_order"] == STEP
        assert second.status_code == status.HTTP_201_CREATED
        assert second.json()["sort_order"] == 2 * STEP

    @pytest.mark.django_db
    def test_create_root_page_appends_after_existing_roots(self, session_client, workspace, project, create_user):
        _make_page(workspace, project, create_user, "Existing")

        response = session_client.post(_pages_url(workspace.slug, project.id), {"name": "New"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["parent"] is None
        assert response.json()["sort_order"] == 2 * STEP

    @pytest.mark.django_db
    def test_client_cannot_set_sort_order(self, session_client, workspace, project):
        response = session_client.post(
            _pages_url(workspace.slug, project.id), {"name": "New", "sort_order": 1}, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["sort_order"] == STEP

    @pytest.mark.django_db
    @pytest.mark.parametrize(
        "case",
        ["other_project", "other_workspace", "archived", "private_of_other_user", "removed_from_project"],
    )
    def test_invalid_parent_is_rejected_without_creating_the_page(
        self, case, session_client, workspace, project, create_user, other_user
    ):
        if case == "other_project":
            other_project = _make_project(workspace, "OTHR")
            ProjectMember.objects.create(workspace=workspace, project=other_project, member=create_user, role=20)
            parent = _make_page(workspace, other_project, create_user, "Parent")
        elif case == "other_workspace":
            foreign_workspace = Workspace.objects.create(name="Foreign", owner=other_user, slug="foreign-workspace")
            foreign_project = _make_project(foreign_workspace, "FRGN")
            parent = _make_page(foreign_workspace, foreign_project, other_user, "Parent")
        elif case == "archived":
            parent = _make_page(workspace, project, create_user, "Parent", archived_at=timezone.now())
        elif case == "private_of_other_user":
            parent = _make_page(workspace, project, other_user, "Parent", access=Page.PRIVATE_ACCESS)
        else:
            parent = _make_page(workspace, project, create_user, "Parent")
            ProjectPage.objects.filter(page=parent).update(deleted_at=timezone.now())

        response = session_client.post(
            _pages_url(workspace.slug, project.id), {"name": "Orphan", "parent": str(parent.id)}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Page.objects.filter(name="Orphan").exists()


@pytest.mark.contract
class TestPageTreeUpdateParent:
    @pytest.mark.django_db
    def test_move_under_new_parent_appends(self, session_client, workspace, project, create_user):
        target = _make_page(workspace, project, create_user, "Target")
        _make_page(workspace, project, create_user, "Existing child", parent=target)
        page = _make_page(workspace, project, create_user, "Page")

        response = session_client.patch(
            _pages_url(workspace.slug, project.id, page.id), {"parent": str(target.id)}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.parent_id == target.id
        assert page.sort_order == 2 * STEP

    @pytest.mark.django_db
    def test_move_to_root(self, session_client, workspace, project, create_user):
        root = _make_page(workspace, project, create_user, "Root")
        child = _make_page(workspace, project, create_user, "Child", parent=root)

        response = session_client.patch(
            _pages_url(workspace.slug, project.id, child.id), {"parent": None}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        child.refresh_from_db()
        assert child.parent_id is None
        assert child.sort_order == 2 * STEP

    @pytest.mark.django_db
    def test_other_fields_keep_parent_and_sort_order(self, session_client, workspace, project, create_user):
        root = _make_page(workspace, project, create_user, "Root")
        child = _make_page(workspace, project, create_user, "Child", parent=root, sort_order=3 * STEP)

        response = session_client.patch(
            _pages_url(workspace.slug, project.id, child.id),
            {"name": "Renamed", "parent": str(root.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        child.refresh_from_db()
        assert (child.name, child.parent_id, child.sort_order) == ("Renamed", root.id, 3 * STEP)

    @pytest.mark.django_db
    def test_page_cannot_be_its_own_parent(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user, "Page")

        response = session_client.patch(
            _pages_url(workspace.slug, project.id, page.id), {"parent": str(page.id)}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        page.refresh_from_db()
        assert page.parent_id is None

    @pytest.mark.django_db
    def test_page_cannot_move_under_its_descendant(self, session_client, workspace, project, create_user):
        root = _make_page(workspace, project, create_user, "Root")
        child = _make_page(workspace, project, create_user, "Child", parent=root)
        grandchild = _make_page(workspace, project, create_user, "Grandchild", parent=child)

        response = session_client.patch(
            _pages_url(workspace.slug, project.id, root.id), {"parent": str(grandchild.id)}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        root.refresh_from_db()
        assert root.parent_id is None

    @pytest.mark.django_db
    def test_parent_from_other_workspace_is_rejected(self, session_client, workspace, project, create_user, other_user):
        foreign_workspace = Workspace.objects.create(name="Foreign", owner=other_user, slug="foreign-workspace")
        foreign_parent = _make_page(foreign_workspace, _make_project(foreign_workspace, "FRGN"), other_user, "Parent")
        page = _make_page(workspace, project, create_user, "Page")

        response = session_client.patch(
            _pages_url(workspace.slug, project.id, page.id), {"parent": str(foreign_parent.id)}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        page.refresh_from_db()
        assert page.parent_id is None


@pytest.mark.contract
class TestPagePosition:
    @pytest.mark.django_db
    @pytest.mark.parametrize(
        ("prev_name", "expected"),
        [
            (None, ["X", "A", "B", "C"]),
            ("A", ["A", "X", "B", "C"]),
            ("C", ["A", "B", "C", "X"]),
        ],
    )
    def test_reorder_within_parent(self, prev_name, expected, session_client, workspace, project, create_user):
        root = _make_page(workspace, project, create_user, "Root")
        pages = {
            name: _make_page(workspace, project, create_user, name, parent=root, sort_order=order)
            for name, order in [("A", STEP), ("B", 2 * STEP), ("X", 2.5 * STEP), ("C", 3 * STEP)]
        }

        response = _move(session_client, pages["X"], project, parent=root, prev=pages.get(prev_name))

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["parent"] == str(root.id)
        assert _tree_order(project, root) == expected
        pages["X"].refresh_from_db()
        assert response.json()["sort_order"] == pages["X"].sort_order

    @pytest.mark.django_db
    def test_move_under_another_parent_after_a_sibling(self, session_client, workspace, project, create_user):
        source = _make_page(workspace, project, create_user, "Source")
        target = _make_page(workspace, project, create_user, "Target")
        existing = _make_page(workspace, project, create_user, "Y", parent=target)
        _make_page(workspace, project, create_user, "Z", parent=target, sort_order=3 * STEP)
        page = _make_page(workspace, project, create_user, "X", parent=source)

        response = _move(session_client, page, project, parent=target, prev=existing)

        assert response.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.parent_id == target.id
        assert _tree_order(project, target) == ["Y", "X", "Z"]
        assert _tree_order(project, source) == []

    @pytest.mark.django_db
    def test_move_to_root_first(self, session_client, workspace, project, create_user):
        root = _make_page(workspace, project, create_user, "Root")
        page = _make_page(workspace, project, create_user, "X", parent=root)

        response = _move(session_client, page, project)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["parent"] is None
        page.refresh_from_db()
        assert page.parent_id is None
        assert _tree_order(project, None) == ["X", "Root"]

    @pytest.mark.django_db
    def test_first_drop_among_legacy_pages_spaces_them_out(self, session_client, workspace, project, create_user):
        """Pages created before the tree all share sort_order 65535, so there is no gap to split."""
        root = _make_page(workspace, project, create_user, "Root")
        a, b, c, x = (_make_page(workspace, project, create_user, name, parent=root) for name in "ABCX")

        response = _move(session_client, x, project, parent=root, prev=a)

        assert response.status_code == status.HTTP_200_OK
        assert _tree_order(project, root) == ["A", "X", "B", "C"]
        body = response.json()
        assert body["renumbered"] == {str(b.id): 3 * STEP, str(c.id): 4 * STEP}
        stored = dict(Page.objects.filter(parent=root).values_list("id", "sort_order"))
        assert stored == {a.id: STEP, x.id: body["sort_order"], b.id: 3 * STEP, c.id: 4 * STEP}

    @pytest.mark.django_db
    def test_hidden_private_sibling_keeps_its_place(self, session_client, workspace, project, create_user, other_user):
        """The order is shared by everyone, so a sibling the caller cannot see still takes up its slot."""
        root = _make_page(workspace, project, create_user, "Root")
        a = _make_page(workspace, project, create_user, "A", parent=root, sort_order=STEP)
        _make_page(workspace, project, other_user, "P", access=Page.PRIVATE_ACCESS, parent=root, sort_order=2 * STEP)
        _make_page(workspace, project, create_user, "B", parent=root, sort_order=3 * STEP)
        x = _make_page(workspace, project, create_user, "X", parent=root, sort_order=4 * STEP)

        response = _move(session_client, x, project, parent=root, prev=a)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["sort_order"] == 1.5 * STEP
        assert _tree_order(project, root) == ["A", "X", "P", "B"]

    @pytest.mark.django_db
    def test_member_can_move_a_public_page_of_another_user(self, workspace, project, create_user, other_user):
        root = _make_page(workspace, project, create_user, "Root")
        page = _make_page(workspace, project, create_user, "X")

        response = _move(_client_for(other_user), page, project, parent=root)

        assert response.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.parent_id == root.id

    @pytest.mark.django_db
    @pytest.mark.parametrize("case", ["self", "descendant", "other_project", "private_of_other_user", "missing"])
    def test_invalid_parent_is_rejected(self, case, session_client, workspace, project, create_user, other_user):
        page = _make_page(workspace, project, create_user, "X")
        if case == "self":
            parent_id = page.id
        elif case == "descendant":
            child = _make_page(workspace, project, create_user, "Child", parent=page)
            parent_id = _make_page(workspace, project, create_user, "Grandchild", parent=child).id
        elif case == "other_project":
            other_project = _make_project(workspace, "OTHR")
            ProjectMember.objects.create(workspace=workspace, project=other_project, member=create_user, role=20)
            parent_id = _make_page(workspace, other_project, create_user, "Parent").id
        elif case == "private_of_other_user":
            parent_id = _make_page(workspace, project, other_user, "Parent", access=Page.PRIVATE_ACCESS).id
        else:
            parent_id = uuid.uuid4()

        response = session_client.post(
            _position_url(workspace.slug, project.id, page.id),
            {"parent_id": str(parent_id), "prev_sibling_id": None},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        page.refresh_from_db()
        assert (page.parent_id, page.sort_order) == (None, STEP)

    @pytest.mark.django_db
    @pytest.mark.parametrize("case", ["under_other_parent", "itself", "missing"])
    def test_prev_sibling_must_be_under_the_target_parent(self, case, session_client, workspace, project, create_user):
        root = _make_page(workspace, project, create_user, "Root")
        page = _make_page(workspace, project, create_user, "X", parent=root)
        if case == "under_other_parent":
            prev_id = _make_page(workspace, project, create_user, "Elsewhere").id
        elif case == "itself":
            prev_id = page.id
        else:
            prev_id = uuid.uuid4()

        response = session_client.post(
            _position_url(workspace.slug, project.id, page.id),
            {"parent_id": str(root.id), "prev_sibling_id": str(prev_id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        page.refresh_from_db()
        assert page.sort_order == STEP

    @pytest.mark.django_db
    @pytest.mark.parametrize("body", [{}, {"parent_id": "not-a-uuid", "prev_sibling_id": None}])
    def test_invalid_body_is_rejected(self, body, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user, "X")

        response = session_client.post(_position_url(workspace.slug, project.id, page.id), body, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    @pytest.mark.parametrize("field", ["is_locked", "archived_at"])
    def test_locked_or_archived_page_cannot_move(self, field, session_client, workspace, project, create_user):
        root = _make_page(workspace, project, create_user, "Root")
        value = True if field == "is_locked" else timezone.now()
        page = _make_page(workspace, project, create_user, "X", **{field: value})

        response = _move(session_client, page, project, parent=root)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        page.refresh_from_db()
        assert page.parent_id is None

    @pytest.mark.django_db
    def test_guest_cannot_move_even_their_own_page(self, workspace, project, create_user):
        guest = _make_user("guest")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(workspace=workspace, project=project, member=guest, role=5)
        root = _make_page(workspace, project, create_user, "Root")
        page = _make_page(workspace, project, guest, "X")

        response = _move(_client_for(guest), page, project, parent=root)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        page.refresh_from_db()
        assert page.parent_id is None

    @pytest.mark.django_db
    def test_private_page_of_another_user_cannot_move(self, session_client, workspace, project, other_user):
        page = _make_page(workspace, project, other_user, "X", access=Page.PRIVATE_ACCESS)

        response = _move(session_client, page, project)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db(transaction=True)
    def test_crossing_moves_cannot_build_a_cycle(self, workspace, project, create_user):
        """Moving A under B while B moves under A: each check alone sees no cycle, so they must not overlap."""
        a = _make_page(workspace, project, create_user, "A")
        b = _make_page(workspace, project, create_user, "B")
        barrier = threading.Barrier(2)
        statuses = []

        def slow_check(page_id, candidate_id):
            result = is_page_or_ancestor(page_id, candidate_id)
            # Hold the move open so the other request runs its check before this one writes
            time.sleep(0.5)
            return result

        def run(send):
            try:
                client = _client_for(create_user)
                barrier.wait()
                statuses.append(send(client).status_code)
            finally:
                connections.close_all()

        senders = [
            lambda client: _move(client, a, project, parent=b),
            lambda client: client.patch(
                _pages_url(workspace.slug, project.id, b.id), {"parent": str(a.id)}, format="json"
            ),
        ]
        with patch("plane.app.views.page.base.is_page_or_ancestor", side_effect=slow_check):
            threads = [threading.Thread(target=run, args=(send,)) for send in senders]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=30)

        assert sorted(statuses) == [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]
        a.refresh_from_db()
        b.refresh_from_db()
        assert not (a.parent_id == b.id and b.parent_id == a.id)


@pytest.mark.contract
class TestPageTreeDelete:
    @pytest.mark.django_db
    def test_unarchived_page_cannot_be_deleted(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user, "Page")

        response = session_client.delete(_pages_url(workspace.slug, project.id, page.id))

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert Page.objects.filter(pk=page.id).exists()

    @pytest.mark.django_db
    def test_delete_mid_tree_parent_reparents_children_into_its_slot(
        self, session_client, workspace, project, create_user
    ):
        now = timezone.now()
        grandparent = _make_page(workspace, project, create_user, "G")
        _make_page(workspace, project, create_user, "A", parent=grandparent, sort_order=STEP)
        parent = _make_page(
            workspace, project, create_user, "Parent", parent=grandparent, sort_order=2 * STEP, archived_at=now
        )
        _make_page(workspace, project, create_user, "B", parent=grandparent, sort_order=3 * STEP)
        c1 = _make_page(workspace, project, create_user, "c1", parent=parent, sort_order=STEP, archived_at=now)
        c2 = _make_page(workspace, project, create_user, "c2", parent=parent, sort_order=2 * STEP, archived_at=now)

        response = session_client.delete(_pages_url(workspace.slug, project.id, parent.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Page.objects.filter(pk=parent.id).exists()
        assert _tree_order(project, grandparent) == ["A", "c1", "c2", "B"]
        c1.refresh_from_db()
        c2.refresh_from_db()
        assert (c1.parent_id, c2.parent_id) == (grandparent.id, grandparent.id)

    @pytest.mark.django_db
    def test_delete_root_parent_children_become_roots_at_its_slot(
        self, session_client, workspace, project, create_user
    ):
        now = timezone.now()
        _make_page(workspace, project, create_user, "A", sort_order=STEP)
        parent = _make_page(workspace, project, create_user, "Parent", sort_order=2 * STEP, archived_at=now)
        _make_page(workspace, project, create_user, "B", sort_order=3 * STEP)
        c1 = _make_page(workspace, project, create_user, "c1", parent=parent, sort_order=STEP, archived_at=now)
        c2 = _make_page(workspace, project, create_user, "c2", parent=parent, sort_order=2 * STEP, archived_at=now)

        response = session_client.delete(_pages_url(workspace.slug, project.id, parent.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert _tree_order(project, None) == ["A", "c1", "c2", "B"]
        c1.refresh_from_db()
        c2.refresh_from_db()
        assert (c1.parent_id, c2.parent_id) == (None, None)

    @pytest.mark.django_db
    def test_delete_parent_among_legacy_siblings_renumbers_them(
        self, session_client, workspace, project, create_user
    ):
        """Existing pages share sort_order 65535, so deleting a page between them needs renumbering."""
        now = timezone.now()
        grandparent = _make_page(workspace, project, create_user, "G")
        a = _make_page(workspace, project, create_user, "A", parent=grandparent)
        parent = _make_page(workspace, project, create_user, "Parent", parent=grandparent, archived_at=now)
        b = _make_page(workspace, project, create_user, "B", parent=grandparent)
        c1 = _make_page(workspace, project, create_user, "c1", parent=parent, archived_at=now)
        c2 = _make_page(workspace, project, create_user, "c2", parent=parent, archived_at=now)

        response = session_client.delete(_pages_url(workspace.slug, project.id, parent.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert _tree_order(project, grandparent) == ["A", "c1", "c2", "B"]
        stored = dict(Page.objects.filter(parent=grandparent).values_list("id", "sort_order"))
        assert stored == {a.id: STEP, c1.id: 2 * STEP, c2.id: 3 * STEP, b.id: 4 * STEP}

    @pytest.mark.django_db
    def test_unarchive_after_parent_deleted_keeps_child_under_grandparent(
        self, session_client, workspace, project, create_user
    ):
        now = timezone.now()
        grandparent = _make_page(workspace, project, create_user, "G")
        parent = _make_page(workspace, project, create_user, "Parent", parent=grandparent, archived_at=now)
        child = _make_page(workspace, project, create_user, "Child", parent=parent, archived_at=now)

        delete_response = session_client.delete(_pages_url(workspace.slug, project.id, parent.id))
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT

        unarchive_response = session_client.delete(f"{_pages_url(workspace.slug, project.id, child.id)}archive/")

        assert unarchive_response.status_code == status.HTTP_204_NO_CONTENT
        child.refresh_from_db()
        assert child.parent_id == grandparent.id
        assert child.archived_at is None


@pytest.mark.contract
class TestPageArchive:
    @pytest.mark.django_db
    def test_locked_page_cannot_be_archived(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user, "Locked", is_locked=True)

        response = session_client.post(f"{_pages_url(workspace.slug, project.id, page.id)}archive/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        page.refresh_from_db()
        assert page.archived_at is None

    @pytest.mark.django_db
    def test_unlocked_page_can_be_archived(self, session_client, workspace, project, create_user):
        page = _make_page(workspace, project, create_user, "Open")

        response = session_client.post(f"{_pages_url(workspace.slug, project.id, page.id)}archive/")

        assert response.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.archived_at is not None


@pytest.mark.contract
class TestPageTreeDuplicate:
    @pytest.mark.django_db
    def test_duplicate_lands_right_after_source_same_parent(self, session_client, workspace, project, create_user):
        root = _make_page(workspace, project, create_user, "Root")
        source = _make_page(workspace, project, create_user, "Source", parent=root, sort_order=STEP)
        _make_page(workspace, project, create_user, "Next", parent=root, sort_order=2 * STEP)

        response = session_client.post(
            f"{_pages_url(workspace.slug, project.id, source.id)}duplicate/", format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        body = response.json()
        assert body["parent"] == str(root.id)
        assert body["name"] == "Source (Copy)"
        assert _tree_order(project, root) == ["Source", "Source (Copy)", "Next"]

    @pytest.mark.django_db
    def test_duplicate_root_page_lands_after_source_at_root(self, session_client, workspace, project, create_user):
        source = _make_page(workspace, project, create_user, "Source", sort_order=STEP)
        _make_page(workspace, project, create_user, "Next", sort_order=2 * STEP)

        response = session_client.post(
            f"{_pages_url(workspace.slug, project.id, source.id)}duplicate/", format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["parent"] is None
        assert _tree_order(project, None) == ["Source", "Source (Copy)", "Next"]

    @pytest.mark.django_db
    def test_duplicate_among_legacy_siblings_renumbers_them(self, session_client, workspace, project, create_user):
        root = _make_page(workspace, project, create_user, "Root")
        source = _make_page(workspace, project, create_user, "Source", parent=root)
        next_sibling = _make_page(workspace, project, create_user, "Next", parent=root)

        response = session_client.post(
            f"{_pages_url(workspace.slug, project.id, source.id)}duplicate/", format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert _tree_order(project, root) == ["Source", "Source (Copy)", "Next"]
        source.refresh_from_db()
        next_sibling.refresh_from_db()
        copy = Page.objects.exclude(pk=source.id).get(name="Source (Copy)")
        assert source.sort_order == STEP
        assert copy.sort_order == 2 * STEP
        assert next_sibling.sort_order == 3 * STEP

    @pytest.mark.django_db
    def test_duplicate_with_archived_parent_lands_at_root(self, session_client, workspace, project, create_user):
        parent = _make_page(workspace, project, create_user, "Parent", archived_at=timezone.now())
        source = _make_page(workspace, project, create_user, "Source", parent=parent)
        _make_page(workspace, project, create_user, "Existing", sort_order=STEP)

        response = session_client.post(
            f"{_pages_url(workspace.slug, project.id, source.id)}duplicate/", format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["parent"] is None
        copy = Page.objects.exclude(pk=source.id).get(name="Source (Copy)")
        assert copy.parent_id is None
        assert copy.sort_order == 2 * STEP


    @pytest.mark.django_db
    def test_duplicate_copies_visible_sub_pages_in_order(self, session_client, workspace, project, create_user):
        source = _make_page(workspace, project, create_user, "Source")
        child_b = _make_page(workspace, project, create_user, "B", parent=source, sort_order=2 * STEP)
        _make_page(workspace, project, create_user, "A", parent=source, sort_order=STEP)
        _make_page(workspace, project, create_user, "B1", parent=child_b, sort_order=STEP)
        _make_page(
            workspace, project, create_user, "Archived", parent=source, sort_order=3 * STEP, archived_at=timezone.now()
        )
        stranger = User.objects.create(email="stranger@plane.so", username="stranger")
        _make_page(workspace, project, stranger, "Someone else's private", parent=source, access=Page.PRIVATE_ACCESS)

        response = session_client.post(
            f"{_pages_url(workspace.slug, project.id, source.id)}duplicate/", format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        copy = Page.objects.get(pk=response.json()["id"])
        assert _tree_order(project, copy) == ["A", "B"]
        copied_b = Page.objects.get(parent=copy, name="B")
        assert _tree_order(project, copied_b) == ["B1"]
        assert copied_b.id != child_b.id
        assert set(_tree_order(project, source)) == {"A", "B", "Archived", "Someone else's private"}


@pytest.mark.contract
class TestPagePatchAfterMove:
    @pytest.mark.django_db
    def test_rename_after_a_concurrent_move_keeps_the_new_position(
        self, session_client, workspace, project, create_user
    ):
        """Mutation test: drop the select_for_update re-read in partial_update and this goes red.

        A plain serializer.save() rewrites every column from the (stale) in-memory
        instance, so a rename that overlaps a drag-and-drop move would silently
        revert the page back to wherever it was before the move.
        """
        root_a = _make_page(workspace, project, create_user, "A")
        root_b = _make_page(workspace, project, create_user, "B")
        page = _make_page(workspace, project, create_user, "Page", parent=root_a, sort_order=STEP)

        real_get = Page.objects.get

        def get_then_concurrently_move(*args, **kwargs):
            # Simulates the read at the top of partial_update() racing a drag-and-drop
            # move: the row returned here is already stale by the time this returns.
            result = real_get(*args, **kwargs)
            if kwargs.get("pk") == page.id:
                Page.objects.filter(pk=page.id).update(parent=root_b, sort_order=2 * STEP)
            return result

        with patch.object(Page.objects, "get", side_effect=get_then_concurrently_move):
            response = session_client.patch(
                _pages_url(workspace.slug, project.id, page.id), {"name": "Renamed"}, format="json"
            )

        assert response.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.name == "Renamed"
        assert page.parent_id == root_b.id
        assert page.sort_order == 2 * STEP
