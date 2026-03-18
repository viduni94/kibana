#!/usr/bin/env bash
set -euo pipefail

# Delete deprecated models:* GitHub labels (those containing "(deprecated)" in the name).
#
# Usage:
#   ./scripts/delete_deprecated_model_labels.sh [--repo <owner/repo>] [--yes]
#
# Options:
#   --repo <owner/repo>   Target repo for gh commands (default: current)
#   --yes                 Skip confirmation prompt
#   -h, --help            Show help

REPO=""
AUTO_YES="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --yes)
      AUTO_YES="true"
      shift 1
      ;;
    -h|--help)
      echo "Usage: $0 [--repo <owner/repo>] [--yes]"
      echo ""
      echo "Delete all models:* labels that contain '(deprecated)' in their name."
      echo ""
      echo "Options:"
      echo "  --repo <owner/repo>  Target repo (default: current)"
      echo "  --yes                Skip confirmation prompt"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: 'gh' CLI is required." >&2
  exit 1
fi

GH_REPO_ARGS=()
if [[ -n "${REPO}" ]]; then
  GH_REPO_ARGS+=(--repo "${REPO}")
fi

echo "Fetching deprecated models:* labels..."
deprecated_labels="$(gh label list "${GH_REPO_ARGS[@]}" --search "models:" --limit 500 --json name --jq '.[].name' \
  | grep -E '^models:.*\(deprecated\)' \
  | sort || true)"

if [[ -z "${deprecated_labels}" ]]; then
  echo "No deprecated models:* labels found."
  exit 0
fi

count="$(echo "${deprecated_labels}" | wc -l | tr -d ' ')"
echo "Found ${count} deprecated label(s):"
echo "${deprecated_labels}" | sed 's/^/  /'
echo ""

if [[ "${AUTO_YES}" != "true" ]]; then
  read -rp "Delete all ${count} deprecated label(s)? [y/N] " confirm
  if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

deleted=0
while IFS= read -r label; do
  [[ -z "$label" ]] && continue
  if gh label delete "${GH_REPO_ARGS[@]}" "$label" --yes 2>/dev/null; then
    echo "deleted: $label"
    deleted=$((deleted + 1))
  else
    echo "Warning: failed to delete label: $label" >&2
  fi
done <<<"${deprecated_labels}"

echo ""
echo "Deleted ${deleted} label(s)."
