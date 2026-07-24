#!/bin/sh
# ============================================================
#  Cloudflare Pages build step
# ============================================================
#
#  WHY THIS EXISTS
#  Cloudflare Pages publishes the entire repository by default. That made
#  server-side source readable over the public web — most seriously:
#
#      https://<site>.pages.dev/backend/00-Config.gs   →  exposed SHEET_ID
#
#  Making the GitHub repository private does NOT fix this: the published
#  site is separate from the repository, and remains publicly reachable.
#
#  Cloudflare has no ignore-file for Git-connected projects
#  (.cloudflareignore only applies to direct Wrangler uploads), so the
#  reliable approach is to delete non-public files from the build output
#  before Cloudflare uploads it. What is not uploaded cannot be fetched.
#
#  The deletions happen inside Cloudflare's throwaway build container,
#  never in your repository or your working copy.
#
#  SET THIS AS THE BUILD COMMAND IN CLOUDFLARE:
#      sh build.sh
#  Leave the output directory as the repository root.
# ============================================================

set -e

echo "→ Removing server-side and internal files from the published output"

# Apps Script backend — contains SHEET_ID and all business logic
rm -rf backend

# Test suite and internal documentation
rm -rf tests
rm -rf docs
rm -rf .github

# Deployment notes and any other markdown left at the root
rm -f ./*.md

# The build script itself is not part of the site
rm -f build.sh

echo "→ Publishing only: index.html, js/, css/"
ls -1

echo "→ Build step complete"