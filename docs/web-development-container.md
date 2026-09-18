# Plane web development container

`docker-compose.web-dev.yml` starts only the Vite web server from this checkout.
It joins the existing `plane-app_default` network and has no PostgreSQL, Redis,
MinIO, RabbitMQ or volume definitions for those services.

Run it with the existing Plane project name so the reverse proxy continues to
resolve the `web` service:

```sh
docker compose -p plane-app -f docker-compose.web-dev.yml up -d web
```

The checkout, root pnpm install, app-level `node_modules`, pnpm store, and Vite
cache are separate mounts. This avoids Windows junctions being mounted into
Linux and lets Vite write its cache. Stop it with `docker compose -p plane-app
-f docker-compose.web-dev.yml stop web`; do not pass `-v`.
