# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.app.serializers.base import BaseSerializer
from plane.db.models import PageComment

MAX_COMMENT_LENGTH = 10000
MAX_QUOTE_LENGTH = 500
MAX_ANCHOR_LENGTH = 255


class PageCommentSerializer(BaseSerializer):
    body = serializers.CharField(max_length=MAX_COMMENT_LENGTH)
    anchor_type = serializers.ChoiceField(choices=PageComment.ANCHOR_TYPE_CHOICES, required=False)
    anchor_id = serializers.CharField(max_length=MAX_ANCHOR_LENGTH, required=False)
    anchor_board_id = serializers.CharField(max_length=MAX_ANCHOR_LENGTH, required=False, allow_blank=True)
    quote = serializers.CharField(max_length=MAX_QUOTE_LENGTH, required=False, allow_blank=True)

    class Meta:
        model = PageComment
        fields = [
            "id",
            "page",
            "parent",
            "actor",
            "body",
            "anchor_type",
            "anchor_id",
            "anchor_board_id",
            "quote",
            "resolved_at",
            "resolved_by",
            "edited_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["page", "parent", "actor", "resolved_at", "resolved_by", "edited_at"]

    def validate_body(self, value):
        if not value.strip():
            raise serializers.ValidationError("Comment cannot be empty.")
        return value.strip()
