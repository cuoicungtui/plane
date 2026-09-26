# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.management.base import BaseCommand

# Module imports
from plane.bgtasks.page_transaction_task import page_transaction
from plane.db.models import Page


class Command(BaseCommand):
    help = (
        "Builds the PageLog rows (page links, mentions, embeds) for pages saved before link tracking existed, "
        "so their backlinks appear without the page being edited again. Safe to re-run."
    )

    def handle(self, *args, **options):
        pages = Page.objects.filter(page_log__isnull=True).exclude(description_html__in=["", "<p></p>"])
        count = 0
        for page_id, html in pages.values_list("id", "description_html").iterator(chunk_size=200):
            if not html:
                continue
            page_transaction(new_description_html=html, old_description_html=None, page_id=page_id)
            count += 1
        self.stdout.write(self.style.SUCCESS(f"Processed {count} pages"))
