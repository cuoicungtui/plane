# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for comments on a Wiki page, anchored to a block, text or a whiteboard element."""

import uuid

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Notification,
    Page,
    PageComment,
    Project,
    ProjectMember,
    ProjectPage,
    User,
    WorkspaceMember,
)


def _url(slug, project_id, page_id, comment_id=None, resolve=False):
    base = f"/api/workspaces/{slug}/projects/{project_id}/pages/{page_id}/comments/"
    if comment_id:
        base += f"{comment_id}/"
        if resolve:
            base += "resolve/"
    return base


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


def _block(body="Looks good", block_id="block-1"):
    return {"body": body, "anchor_type": "block", "anchor_id": block_id}


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Project CMT", identifier="CMT", workspace=workspace)
    ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=20)
    return project


@pytest.fixture
def page(workspace, project, create_user):
    return _make_page(workspace, project, create_user, "Commented")


@pytest.mark.contract
class TestCreateAndList:
    @pytest.mark.django_db
    def test_creates_a_block_comment_and_lists_it(self, session_client, workspace, project, page, create_user):
        response = session_client.post(_url(workspace.slug, project.id, page.id), _block(), format="json")

        assert response.status_code == status.HTTP_201_CREATED
        body = response.json()
        assert body["anchor_type"] == "block"
        assert body["anchor_id"] == "block-1"
        assert body["parent"] is None
        assert body["actor"] == str(create_user.id)
        assert body["resolved_at"] is None

        listed = session_client.get(_url(workspace.slug, project.id, page.id)).json()
        assert [item["id"] for item in listed] == [body["id"]]

    @pytest.mark.django_db
    def test_text_comment_keeps_the_quote(self, session_client, workspace, project, page):
        payload = {"body": "Typo?", "anchor_type": "text", "anchor_id": str(uuid.uuid4()), "quote": "the quick fox"}

        response = session_client.post(_url(workspace.slug, project.id, page.id), payload, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["quote"] == "the quick fox"

    @pytest.mark.django_db
    def test_board_element_comment_needs_the_board_id(self, session_client, workspace, project, page):
        url = _url(workspace.slug, project.id, page.id)
        element = {"body": "Move this", "anchor_type": "board_element", "anchor_id": "el-1"}

        missing = session_client.post(url, element, format="json")
        ok = session_client.post(url, {**element, "anchor_board_id": str(uuid.uuid4())}, format="json")
        stray = session_client.post(url, {**_block(), "anchor_board_id": "b-1"}, format="json")

        assert missing.status_code == status.HTTP_400_BAD_REQUEST
        assert ok.status_code == status.HTTP_201_CREATED
        assert stray.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_top_level_comment_needs_an_anchor_and_a_body(self, session_client, workspace, project, page):
        url = _url(workspace.slug, project.id, page.id)

        no_anchor = session_client.post(url, {"body": "Hi"}, format="json")
        blank = session_client.post(url, _block(body="   "), format="json")
        bad_type = session_client.post(url, {**_block(), "anchor_type": "page"}, format="json")

        assert no_anchor.status_code == status.HTTP_400_BAD_REQUEST
        assert blank.status_code == status.HTTP_400_BAD_REQUEST
        assert bad_type.status_code == status.HTTP_400_BAD_REQUEST
        assert PageComment.objects.count() == 0

    @pytest.mark.django_db
    def test_reply_inherits_the_thread_and_cannot_nest(self, session_client, workspace, project, page):
        url = _url(workspace.slug, project.id, page.id)
        root = session_client.post(url, _block(), format="json").json()

        reply = session_client.post(url, {"body": "Agreed", "parent": root["id"]}, format="json")
        nested = session_client.post(url, {"body": "Deeper", "parent": reply.json()["id"]}, format="json")

        assert reply.status_code == status.HTTP_201_CREATED
        assert reply.json()["parent"] == root["id"]
        assert reply.json()["anchor_type"] == ""
        assert nested.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_reply_to_a_thread_on_another_page_is_rejected(self, session_client, workspace, project, page, create_user):
        other = _make_page(workspace, project, create_user, "Other")
        elsewhere = session_client.post(_url(workspace.slug, project.id, other.id), _block(), format="json").json()

        response = session_client.post(
            _url(workspace.slug, project.id, page.id), {"body": "Hi", "parent": elsewhere["id"]}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_archived_page_cannot_get_new_comments(self, session_client, workspace, project, create_user):
        archived = _make_page(workspace, project, create_user, "Old", archived_at=timezone.localdate())

        response = session_client.post(_url(workspace.slug, project.id, archived.id), _block(), format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_comments_of_other_pages_are_not_listed(self, session_client, workspace, project, page, create_user):
        other = _make_page(workspace, project, create_user, "Other")
        session_client.post(_url(workspace.slug, project.id, other.id), _block(), format="json")

        listed = session_client.get(_url(workspace.slug, project.id, page.id)).json()

        assert listed == []


@pytest.mark.contract
class TestVisibility:
    @pytest.mark.django_db
    def test_private_page_comments_are_hidden_from_other_members(self, session_client, workspace, project, create_user):
        private = _make_page(workspace, project, create_user, "Mine", access=Page.PRIVATE_ACCESS)
        session_client.post(_url(workspace.slug, project.id, private.id), _block(), format="json")
        _, member_client = _member(workspace, project, "member", role=15)

        read = member_client.get(_url(workspace.slug, project.id, private.id))
        write = member_client.post(_url(workspace.slug, project.id, private.id), _block(), format="json")

        assert read.status_code == status.HTTP_404_NOT_FOUND
        assert write.status_code == status.HTTP_404_NOT_FOUND
        assert PageComment.objects.count() == 1

    @pytest.mark.django_db
    def test_members_and_guests_can_comment_on_a_public_page(self, workspace, project, page):
        project.guest_view_all_features = True
        project.save(update_fields=["guest_view_all_features"])
        _, member_client = _member(workspace, project, "member", role=15)
        _, guest_client = _member(workspace, project, "guest", role=5)

        member = member_client.post(_url(workspace.slug, project.id, page.id), _block("From member"), format="json")
        guest = guest_client.post(_url(workspace.slug, project.id, page.id), _block("From guest"), format="json")

        assert member.status_code == status.HTTP_201_CREATED
        assert guest.status_code == status.HTTP_201_CREATED

    @pytest.mark.django_db
    def test_guest_is_limited_to_own_pages_when_guest_view_is_off(self, workspace, project, page):
        project.guest_view_all_features = False
        project.save(update_fields=["guest_view_all_features"])
        guest, guest_client = _member(workspace, project, "guest", role=5)
        own = _make_page(workspace, project, guest, "Guest page")

        denied = guest_client.get(_url(workspace.slug, project.id, page.id))
        allowed = guest_client.get(_url(workspace.slug, project.id, own.id))

        assert denied.status_code == status.HTTP_404_NOT_FOUND
        assert allowed.status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_requires_project_membership(self, workspace, project, page):
        outsider = User.objects.create(email="outsider@plane.so", username="outsider")
        client = APIClient()
        client.force_authenticate(user=outsider)

        response = client.get(_url(workspace.slug, project.id, page.id))

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_page_from_another_project_is_not_reachable(self, session_client, workspace, project, create_user):
        other = Project.objects.create(name="Project OTH", identifier="OTH", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=other, member=create_user, role=20)
        elsewhere = _make_page(workspace, other, create_user, "Elsewhere")

        response = session_client.get(_url(workspace.slug, project.id, elsewhere.id))

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.contract
class TestEditDeleteResolve:
    @pytest.mark.django_db
    def test_only_the_author_can_edit(self, session_client, workspace, project, page):
        comment = session_client.post(_url(workspace.slug, project.id, page.id), _block(), format="json").json()
        _, member_client = _member(workspace, project, "member", role=15)

        other = member_client.patch(
            _url(workspace.slug, project.id, page.id, comment["id"]), {"body": "Hijack"}, format="json"
        )
        mine = session_client.patch(
            _url(workspace.slug, project.id, page.id, comment["id"]), {"body": "Edited"}, format="json"
        )

        assert other.status_code == status.HTTP_403_FORBIDDEN
        assert mine.status_code == status.HTTP_200_OK
        assert mine.json()["body"] == "Edited"
        assert mine.json()["edited_at"] is not None

    @pytest.mark.django_db
    def test_author_or_admin_can_reattach_a_thread_to_another_anchor(self, session_client, workspace, project, page):
        member, member_client = _member(workspace, project, "member", role=15)
        _, other_client = _member(workspace, project, "other", role=15)
        comment = member_client.post(_url(workspace.slug, project.id, page.id), _block(), format="json").json()
        detail = _url(workspace.slug, project.id, page.id, comment["id"])
        target = {"anchor_type": "text", "anchor_id": "mark-9", "quote": "moved words"}

        denied = other_client.patch(detail, target, format="json")
        by_author = member_client.patch(detail, target, format="json")
        by_admin = session_client.patch(
            detail,
            {"anchor_type": "board_element", "anchor_id": "el-1", "anchor_board_id": "board-1"},
            format="json",
        )

        assert denied.status_code == status.HTTP_403_FORBIDDEN
        assert by_author.status_code == status.HTTP_200_OK
        assert by_author.json()["anchor_type"] == "text"
        assert by_author.json()["anchor_id"] == "mark-9"
        assert by_author.json()["quote"] == "moved words"
        assert by_author.json()["body"] == "Looks good"
        assert by_author.json()["edited_at"] is None
        assert by_admin.status_code == status.HTTP_200_OK
        assert by_admin.json()["anchor_board_id"] == "board-1"
        assert by_admin.json()["quote"] == ""

    @pytest.mark.django_db
    def test_reattach_needs_a_valid_anchor_and_a_root_thread(self, session_client, workspace, project, page):
        url = _url(workspace.slug, project.id, page.id)
        root = session_client.post(url, _block(), format="json").json()
        reply = session_client.post(url, {"body": "Reply", "parent": root["id"]}, format="json").json()

        missing_board = session_client.patch(
            _url(workspace.slug, project.id, page.id, root["id"]),
            {"anchor_type": "board_element", "anchor_id": "el-1"},
            format="json",
        )
        stray_board = session_client.patch(
            _url(workspace.slug, project.id, page.id, root["id"]),
            {"anchor_type": "block", "anchor_id": "b2", "anchor_board_id": "board-1"},
            format="json",
        )
        no_id = session_client.patch(
            _url(workspace.slug, project.id, page.id, root["id"]), {"anchor_type": "block"}, format="json"
        )
        on_reply = session_client.patch(
            _url(workspace.slug, project.id, page.id, reply["id"]),
            {"anchor_type": "block", "anchor_id": "b2"},
            format="json",
        )

        assert missing_board.status_code == status.HTTP_400_BAD_REQUEST
        assert stray_board.status_code == status.HTTP_400_BAD_REQUEST
        assert no_id.status_code == status.HTTP_400_BAD_REQUEST
        assert on_reply.status_code == status.HTTP_400_BAD_REQUEST
        assert PageComment.objects.get(pk=root["id"]).anchor_id == "block-1"

    @pytest.mark.django_db
    def test_editing_needs_a_body(self, session_client, workspace, project, page):
        comment = session_client.post(_url(workspace.slug, project.id, page.id), _block(), format="json").json()

        response = session_client.patch(_url(workspace.slug, project.id, page.id, comment["id"]), {}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_author_and_admin_can_delete_but_other_members_cannot(self, session_client, workspace, project, page):
        member, member_client = _member(workspace, project, "member", role=15)
        _, other_client = _member(workspace, project, "other", role=15)
        comment = member_client.post(_url(workspace.slug, project.id, page.id), _block(), format="json").json()
        detail = _url(workspace.slug, project.id, page.id, comment["id"])

        denied = other_client.delete(detail)
        by_admin = session_client.delete(detail)

        assert denied.status_code == status.HTTP_403_FORBIDDEN
        assert by_admin.status_code == status.HTTP_204_NO_CONTENT
        assert PageComment.objects.filter(pk=comment["id"]).count() == 0

        again = member_client.post(_url(workspace.slug, project.id, page.id), _block(), format="json").json()
        by_author = member_client.delete(_url(workspace.slug, project.id, page.id, again["id"]))
        assert by_author.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.django_db
    def test_deleting_a_thread_removes_its_replies(self, session_client, workspace, project, page):
        url = _url(workspace.slug, project.id, page.id)
        root = session_client.post(url, _block(), format="json").json()
        session_client.post(url, {"body": "Reply", "parent": root["id"]}, format="json")

        session_client.delete(_url(workspace.slug, project.id, page.id, root["id"]))

        assert session_client.get(url).json() == []

    @pytest.mark.django_db
    def test_resolve_and_reopen_a_thread(self, session_client, workspace, project, page, create_user):
        root = session_client.post(_url(workspace.slug, project.id, page.id), _block(), format="json").json()
        resolve = _url(workspace.slug, project.id, page.id, root["id"], resolve=True)

        resolved = session_client.post(resolve)
        reopened = session_client.delete(resolve)

        assert resolved.status_code == status.HTTP_200_OK
        assert resolved.json()["resolved_at"] is not None
        assert resolved.json()["resolved_by"] == str(create_user.id)
        assert reopened.status_code == status.HTTP_200_OK
        assert reopened.json()["resolved_at"] is None
        assert reopened.json()["resolved_by"] is None

    @pytest.mark.django_db
    def test_a_reply_cannot_be_resolved(self, session_client, workspace, project, page):
        url = _url(workspace.slug, project.id, page.id)
        root = session_client.post(url, _block(), format="json").json()
        reply = session_client.post(url, {"body": "Reply", "parent": root["id"]}, format="json").json()

        response = session_client.post(_url(workspace.slug, project.id, page.id, reply["id"], resolve=True))

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_comments_are_unreachable_once_the_page_is_deleted(self, session_client, workspace, project, page):
        session_client.post(_url(workspace.slug, project.id, page.id), _block(), format="json")

        page.delete()

        assert session_client.get(_url(workspace.slug, project.id, page.id)).status_code == status.HTTP_404_NOT_FOUND


def _named_member(workspace, project, name, role=15):
    user, client = _member(workspace, project, name, role)
    user.display_name = name
    user.save(update_fields=["display_name"])
    return user, client


def _notes(user):
    return list(Notification.objects.filter(receiver=user, entity_name="page_comment"))


@pytest.mark.contract
class TestNotifications:
    @pytest.mark.django_db
    def test_reply_notifies_the_thread_participants_but_not_the_replier(self, workspace, project, page):
        author, author_client = _named_member(workspace, project, "alice")
        early, early_client = _named_member(workspace, project, "bob")
        late, late_client = _named_member(workspace, project, "carol")
        bystander, _ = _named_member(workspace, project, "dave")
        url = _url(workspace.slug, project.id, page.id)
        root = author_client.post(url, _block("Root"), format="json").json()
        early_client.post(url, {"body": "First", "parent": root["id"]}, format="json")

        late_client.post(url, {"body": "Second", "parent": root["id"]}, format="json")

        assert [n.data["kind"] for n in _notes(author)] == ["reply", "reply"]
        assert [n.data["kind"] for n in _notes(early)] == ["reply"]
        assert _notes(late) == []
        assert _notes(bystander) == []
        note = _notes(early)[0]
        assert note.data["page"]["id"] == str(page.id)
        assert note.data["comment"]["root_id"] == root["id"]
        assert note.triggered_by == late
        assert note.message_stripped == "Second"

    @pytest.mark.django_db
    def test_a_new_thread_alone_notifies_nobody(self, workspace, project, page):
        _, client = _named_member(workspace, project, "alice")
        client.post(_url(workspace.slug, project.id, page.id), _block("Hello"), format="json")

        assert Notification.objects.filter(entity_name="page_comment").count() == 0

    @pytest.mark.django_db
    def test_mention_notifies_the_named_member_under_the_mentions_sender(self, workspace, project, page):
        alice, alice_client = _named_member(workspace, project, "alice")
        bob, _ = _named_member(workspace, project, "bob")

        alice_client.post(_url(workspace.slug, project.id, page.id), _block("Please check @bob."), format="json")
        alice_client.post(_url(workspace.slug, project.id, page.id), _block("mail me at me@bob.com"), format="json")

        notes = _notes(bob)
        assert len(notes) == 1
        assert notes[0].data["kind"] == "mention"
        assert "mentioned" in notes[0].sender
        assert _notes(alice) == []

    @pytest.mark.django_db
    def test_self_mention_and_mention_of_a_reply_participant_are_not_doubled(self, workspace, project, page):
        alice, alice_client = _named_member(workspace, project, "alice")
        bob, bob_client = _named_member(workspace, project, "bob")
        url = _url(workspace.slug, project.id, page.id)
        root = alice_client.post(url, _block("Root"), format="json").json()

        bob_client.post(url, {"body": "hi @alice and @bob", "parent": root["id"]}, format="json")

        assert [n.data["kind"] for n in _notes(alice)] == ["mention"]
        assert _notes(bob) == []

    @pytest.mark.django_db
    def test_private_page_only_notifies_its_owner(self, session_client, workspace, project, create_user):
        create_user.display_name = "owner"
        create_user.save(update_fields=["display_name"])
        private = _make_page(workspace, project, create_user, "Mine", access=Page.PRIVATE_ACCESS)
        other, _ = _named_member(workspace, project, "other")

        session_client.post(_url(workspace.slug, project.id, private.id), _block("psst @other"), format="json")

        assert _notes(other) == []

    @pytest.mark.django_db
    def test_guest_is_not_notified_about_a_page_they_cannot_open(self, workspace, project, page):
        project.guest_view_all_features = False
        project.save(update_fields=["guest_view_all_features"])
        guest, _ = _named_member(workspace, project, "guesty", role=5)
        _, member_client = _named_member(workspace, project, "mem")

        member_client.post(_url(workspace.slug, project.id, page.id), _block("hey @guesty"), format="json")

        assert _notes(guest) == []

    @pytest.mark.django_db
    def test_inbox_lists_page_comment_notifications(self, workspace, project, page):
        alice, alice_client = _named_member(workspace, project, "alice")
        bob, bob_client = _named_member(workspace, project, "bob")
        url = _url(workspace.slug, project.id, page.id)
        root = alice_client.post(url, _block("Root"), format="json").json()
        bob_client.post(url, {"body": "reply @alice", "parent": root["id"]}, format="json")
        bob_client.post(url, {"body": "plain", "parent": root["id"]}, format="json")

        inbox = alice_client.get(f"/api/workspaces/{workspace.slug}/users/notifications/")
        mentions = alice_client.get(f"/api/workspaces/{workspace.slug}/users/notifications/?mentioned=true")

        assert inbox.status_code == status.HTTP_200_OK
        assert [n["data"]["kind"] for n in inbox.json()] == ["reply"]
        assert [n["data"]["kind"] for n in mentions.json()] == ["mention"]
