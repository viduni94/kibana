#!/usr/bin/env bash

set -euo pipefail

# If cached snapshots are baked into the agent, copy them into our workspace first
# We are doing this rather than simply changing the ES base path because many workers
#   run with the workspace mounted in memory or on a local ssd
cacheDir="$ES_CACHE_DIR/cache"
if [[ -d "$cacheDir" ]]; then
  mkdir -p .es/cache
  echo "--- Copying ES snapshot cache"
  echo "Copying cached snapshots from $cacheDir to .es/cache"
  cp -R "$cacheDir"/* .es/cache/
fi
