---
name: plane-fork-upgrade
description: Use when synchronizing this Plane fork with an official Plane release or preview branch while preserving local customizations and the existing development data services.
---

# Upgrade the Plane Fork

Bring changes from the official Plane repository into this fork without overwriting approved customizations or recreating the local PostgreSQL, Redis, MinIO, and RabbitMQ data.

## Repository model

- `upstream` is `https://github.com/makeplane/plane.git` and is read-only source history.
- `origin` is this fork.
- `origin/main` is the fork's reviewed, deployable custom baseline. Create it from the current custom branch and set it as the fork default before adopting this workflow.
- Use `update/plane-<version>` for each upgrade. Do not merge upstream directly into `main`.
- Prefer an explicit Plane release (`upstream/master` or a release tag). Use `upstream/preview` only when the user requests it and understands that it contains unreleased changes.

## Upgrade workflow

1. Inspect first, without changing files:

   ```bash
   git status --short
   git remote -v
   git fetch origin --prune
   git fetch upstream --prune
   git log -1 --oneline origin/main
   git log -1 --oneline upstream/master
   git log --left-right --count origin/main...upstream/master
   ```

   Confirm the target version, report the commit gap, and stop if the working tree is not clean.

2. Start an isolated upgrade branch from the fork baseline:

   ```bash
   git switch main
   git pull --ff-only origin main
   git switch -c update/plane-<version>
   git merge --no-ff upstream/master
   ```

   For a tag, replace `upstream/master` with the verified tag. For preview, replace it with `upstream/preview` only after the user selected preview.

3. Resolve conflicts by retaining the required local behavior, especially source-mounted development, same-origin API and asset routing, and the fixes maintained by this fork. Do not accept a conflict resolution that changes database credentials, object storage configuration, Docker volumes, or the data-service network without explaining it.

4. Verify the upgrade before any merge:

   - Run focused type checks and tests for every changed application area.
   - Start or reload only application containers from source. Do not build replacement data-service images.
   - Confirm the existing PostgreSQL, Redis, MinIO, and RabbitMQ containers and volumes remain in use.
   - Do not run `docker compose down -v`, delete volumes, or initialize a replacement database.
   - Before applying migrations to the active local data, verify an available backup and report the migration plan.
   - Check the browser flow affected by the update, including API requests and stored image loading where Pages changed.

5. Commit the resolved upgrade on `update/plane-<version>` and push it. Present the commit list, conflicts resolved, checks run, and migration result. Merge into `main` only after the user explicitly approves that reviewed upgrade.

## First-time migration to `main`

When the fork only has a custom branch, create `main` at its verified HEAD, push it, and set it as the GitHub default branch. Do not delete the original branch until `main` has been verified and the user no longer needs it as a rollback reference.

## Guardrails

- Never put `.env`, `plane.env`, credentials, tokens, dumps, or generated dependency stores in a commit.
- Keep deployment-specific Compose overrides outside the source merge unless the user asks to version them in this repository.
- Do not use a force push for `main` or an upgrade branch without explicit approval.
