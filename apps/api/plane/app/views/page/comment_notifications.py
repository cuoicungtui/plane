# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""In-app notifications for page comments: a reply in a thread you took part in, and an @mention."""

import re

from django.db.models import Q

from plane.app.permissions import ROLE
from plane.db.models import Notification, Page, PageComment, Project, ProjectMember

ENTITY_NAME = "page_comment"
SENDER_MENTION = "in_app:page_comments:mentioned"
SENDER_REPLY = "in_app:page_comments:reply"
SNIPPET_LENGTH = 200

# "@name" not glued to a preceding word character, so an email address is not read as a mention
MENTION_PATTERN = re.compile(r"(?<![\w.])@([\w.\-]+)")


def extract_mentioned_names(body):
    return {name.rstrip(".-").lower() for name in MENTION_PATTERN.findall(body)}


def _members_who_can_see(page, project_id, user_ids):
    """Active project members among ``user_ids`` who are allowed to open ``page``."""
    members = ProjectMember.objects.filter(project_id=project_id, member_id__in=user_ids, is_active=True)
    if page.access != Page.PUBLIC_ACCESS:
        members = members.filter(member_id=page.owned_by_id)
    hides_from_guests = not Project.objects.filter(pk=project_id, guest_view_all_features=True).exists()
    return [
        member.member_id
        for member in members
        if not (member.role == ROLE.GUEST.value and hides_from_guests and member.member_id != page.owned_by_id)
    ]


def notify_page_comment(page, project_id, comment, actor):
    """Notify the people a new comment concerns. Mentions win over reply notices, and the actor is never notified."""
    mentioned_ids = set()
    names = extract_mentioned_names(comment.body)
    if names:
        candidates = ProjectMember.objects.filter(project_id=project_id, is_active=True).select_related("member")
        mentioned_ids = {member.member_id for member in candidates if member.member.display_name.lower() in names}

    reply_ids = set()
    if comment.parent_id:
        thread = PageComment.objects.filter(Q(pk=comment.parent_id) | Q(parent_id=comment.parent_id))
        reply_ids = set(thread.values_list("actor_id", flat=True))

    mentioned_ids.discard(actor.id)
    reply_ids.discard(actor.id)
    reply_ids -= mentioned_ids

    root_id = comment.parent_id or comment.id
    snippet = comment.body[:SNIPPET_LENGTH]
    notifications = []
    for kind, user_ids in (("mention", mentioned_ids), ("reply", reply_ids)):
        verb = "mentioned you in" if kind == "mention" else "replied in"
        for user_id in _members_who_can_see(page, project_id, user_ids):
            notifications.append(
                Notification(
                    workspace=page.workspace,
                    project_id=project_id,
                    entity_identifier=page.id,
                    entity_name=ENTITY_NAME,
                    title=f"{actor.display_name} {verb} {page.name}",
                    message_stripped=snippet,
                    sender=SENDER_MENTION if kind == "mention" else SENDER_REPLY,
                    triggered_by=actor,
                    receiver_id=user_id,
                    data={
                        "page": {"id": str(page.id), "name": page.name},
                        "comment": {"id": str(comment.id), "root_id": str(root_id), "snippet": snippet},
                        "kind": kind,
                    },
                )
            )
    if notifications:
        Notification.objects.bulk_create(notifications)
