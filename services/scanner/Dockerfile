# syntax=docker/dockerfile:1

# The scanner, as a container image.
#
# This is the piece that cannot be a Worker: it drives a real headless Chromium
# through Playwright and shells out to a Python sidecar for PDF and Office
# analysis. Cloudflare Containers runs it as an ordinary Linux image with no
# fixed maximum runtime, which is what a twelve-minute scan needs.
#
# Node is pinned rather than inherited from a Playwright base image because the
# repo runs TypeScript directly through Node's type stripping, which needs
# 22.18 or newer — and a base image that quietly ships an older Node would fail
# at startup rather than at build.
FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PYTHONIOENCODING=utf-8 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright \
    HOST=0.0.0.0 \
    PORT=8080 \
    REPORTS_DIR=/data/reports

# Python for the Part 2 document sidecar. Installed before the Node layers so a
# source change does not re-run apt.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# A virtualenv rather than --break-system-packages: Debian marks the system
# interpreter as externally managed, and overriding that is how an image starts
# fighting its own package manager on the next base bump.
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH" PYTHON=/opt/venv/bin/python3

COPY services/scanner/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /app

# Manifests first, so `npm ci` is cached until a dependency actually changes.
# Every workspace manifest has to be present for the lockfile to resolve, even
# the ones this image does not install.
COPY package.json package-lock.json ./
COPY packages/criteria/package.json          packages/criteria/
COPY packages/report-contract/package.json   packages/report-contract/
COPY packages/remediation/package.json       packages/remediation/
COPY packages/fix-plan/package.json          packages/fix-plan/
COPY packages/delta/package.json             packages/delta/
COPY packages/scan-policy/package.json       packages/scan-policy/
COPY services/scanner/package.json           services/scanner/
COPY apps/readiness/package.json             apps/readiness/

# Only the scanner's dependency tree — the Next app's belongs in its own build.
RUN npm ci --omit=dev --include-workspace-root -w @ai5568/scanner

# Chromium and its system libraries. Kept after npm ci because it is the
# largest layer and changes least often.
RUN npx playwright install --with-deps chromium

COPY packages/ packages/
COPY services/scanner/ services/scanner/

# Reports are written here. Mounted from R2 in production so a finished report
# outlives the instance that produced it.
RUN mkdir -p /data/reports

EXPOSE 8080
WORKDIR /app/services/scanner
CMD ["node", "web/src/server.ts"]
