# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid
import base64
import requests
from bs4 import BeautifulSoup

# Django imports
from django.conf import settings

# Module imports
from plane.db.models import FileAsset, Page, Issue
from plane.utils.exception_logger import log_exception
from plane.settings.storage import S3Storage
from celery import shared_task
from plane.utils.url import normalize_url_path


def get_entity_id_field(entity_type, entity_id):
    entity_mapping = {
        FileAsset.EntityTypeContext.WORKSPACE_LOGO: {"workspace_id": entity_id},
        FileAsset.EntityTypeContext.PROJECT_COVER: {"project_id": entity_id},
        FileAsset.EntityTypeContext.USER_AVATAR: {"user_id": entity_id},
        FileAsset.EntityTypeContext.USER_COVER: {"user_id": entity_id},
        FileAsset.EntityTypeContext.ISSUE_ATTACHMENT: {"issue_id": entity_id},
        FileAsset.EntityTypeContext.ISSUE_DESCRIPTION: {"issue_id": entity_id},
        FileAsset.EntityTypeContext.PAGE_DESCRIPTION: {"page_id": entity_id},
        FileAsset.EntityTypeContext.COMMENT_DESCRIPTION: {"comment_id": entity_id},
        FileAsset.EntityTypeContext.DRAFT_ISSUE_DESCRIPTION: {"draft_issue_id": entity_id},
    }
    return entity_mapping.get(entity_type, {})


def extract_asset_ids(html, tag):
    try:
        soup = BeautifulSoup(html, "html.parser")
        return [tag.get("src") for tag in soup.find_all(tag) if tag.get("src")]
    except Exception as e:
        log_exception(e)
        return []


def replace_asset_ids(html, tag, duplicated_assets):
    try:
        soup = BeautifulSoup(html, "html.parser")
        for mention_tag in soup.find_all(tag):
            for asset in duplicated_assets:
                if mention_tag.get("src") == asset["old_asset_id"]:
                    mention_tag["src"] = asset["new_asset_id"]
        return str(soup)
    except Exception as e:
        log_exception(e)
        return html


def update_description(entity, duplicated_assets, tag):
    updated_html = replace_asset_ids(entity.description_html, tag, duplicated_assets)
    entity.description_html = updated_html
    entity.save()
    return updated_html


# Get the description binary and description from the live server
def sync_with_external_service(entity_name, description_html):
    try:
        data = {
            "description_html": description_html,
            "variant": "rich" if entity_name == "PAGE" else "document",
        }

        live_url = settings.LIVE_URL
        if not live_url:
            return {}

        url = normalize_url_path(f"{live_url}/convert-document/")

        response = requests.post(url, json=data, headers=None)
        if response.status_code == 200:
            return response.json()
    except requests.RequestException as e:
        log_exception(e)
    return {}


def stage_assets(workspace, project_id, asset_ids):
    """Copy asset objects to fresh keys without creating database rows.

    S3/MinIO has no transaction. Keeping this phase DB-free lets callers
    discard every copied object if a later database transaction fails.
    """
    staged_assets = []
    storage = S3Storage()
    originals = FileAsset.objects.filter(workspace=workspace, project_id=project_id, id__in=asset_ids)
    originals_by_id = {str(asset.id): asset for asset in originals}
    if len(originals_by_id) != len(set(str(asset_id) for asset_id in asset_ids)):
        raise ValueError("One or more assets cannot be duplicated in this project.")

    try:
        for asset_id in asset_ids:
            original = originals_by_id[str(asset_id)]
            destination_key = f"{workspace.id}/{uuid.uuid4().hex}-{original.attributes.get('name')}"
            if storage.copy_object(original.asset, destination_key) is None:
                raise RuntimeError("Could not copy an asset object.")
            if storage.get_object_metadata(destination_key) is None:
                raise RuntimeError("Copied asset object could not be verified.")
            staged_assets.append({"old_asset": original, "old_asset_id": str(original.id), "new_asset_key": destination_key})
    except Exception:
        cleanup_staged_assets(staged_assets)
        raise
    return staged_assets


def persist_staged_assets(entity, entity_identifier, project_id, user_id, staged_assets):
    """Create FileAsset rows after every staged object is verified."""
    duplicated_assets = []
    for staged in staged_assets:
        original = staged["old_asset"]
        duplicated_asset = FileAsset.objects.create(
            attributes={"name": original.attributes.get("name"), "type": original.attributes.get("type"), "size": original.attributes.get("size")},
            asset=staged["new_asset_key"], size=original.size, workspace=entity.workspace,
            created_by_id=user_id, entity_type=original.entity_type, project_id=project_id,
            storage_metadata=original.storage_metadata, is_uploaded=True,
            **get_entity_id_field(original.entity_type, entity_identifier),
        )
        duplicated_assets.append({"new_asset_id": str(duplicated_asset.id), "old_asset_id": staged["old_asset_id"], "new_asset_key": staged["new_asset_key"]})
    return duplicated_assets


def copy_assets(entity, entity_identifier, project_id, asset_ids, user_id):
    # Compatibility wrapper for existing asynchronous Page/Issue copy jobs.
    try:
        staged_assets = stage_assets(entity.workspace, project_id, asset_ids)
    except ValueError:
        # Existing copy jobs treat missing source assets as a no-op. The Page
        # duplicate endpoint calls stage_assets directly and deliberately
        # surfaces this as an atomic duplication failure.
        return []
    return persist_staged_assets(entity, entity_identifier, project_id, user_id, staged_assets)


def cleanup_staged_assets(staged_assets):
    keys = [item["new_asset_key"] for item in staged_assets if item.get("new_asset_key")]
    if keys:
        S3Storage().delete_files(keys)


def cleanup_copied_assets(_entity, duplicated_assets):
    """Remove staged S3 objects; caller transaction removes database rows."""
    cleanup_staged_assets(duplicated_assets)


@shared_task
def copy_s3_objects_of_description_and_assets(entity_name, entity_identifier, project_id, slug, user_id):
    """
    Step 1: Extract asset ids from the description_html of the entity
    Step 2: Duplicate the assets
    Step 3: Update the description_html of the entity with the new asset ids (change the src of img tag)
    Step 4: Request the live server to generate the description_binary and description for the entity

    """
    try:
        model_class = {"PAGE": Page, "ISSUE": Issue}.get(entity_name)
        if not model_class:
            raise ValueError(f"Unsupported entity_name: {entity_name}")

        entity = model_class.objects.get(id=entity_identifier)
        asset_ids = extract_asset_ids(entity.description_html, "image-component")

        duplicated_assets = copy_assets(entity, entity_identifier, project_id, asset_ids, user_id)

        updated_html = update_description(entity, duplicated_assets, "image-component")

        external_data = sync_with_external_service(entity_name, updated_html)

        if external_data:
            entity.description_json = external_data.get("description_json")
            entity.description_binary = base64.b64decode(external_data.get("description_binary"))
            entity.save()

        return
    except Exception as e:
        log_exception(e)
        return []
