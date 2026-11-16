#!/usr/bin/env bash
# Blocks changes to files the current user does not own (see OWNERSHIP).
#
#   Pre-commit:  scripts/check-ownership.sh            (user from .active-user, files from git index)
#   CI / manual: scripts/check-ownership.sh user1 a.ts b.ts
#
# Shared files need ALLOW_SHARED=1, which both users must agree to.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

if [ $# -gt 0 ]; then
  user="$1"; shift
  files=("$@")
else
  user="${CROWDMAP_USER:-$(cat .active-user 2>/dev/null || true)}"
  files=()
  while IFS= read -r f; do files+=("$f"); done < <(git diff --cached --name-only)
fi

user="$(echo "$user" | tr -d '[:space:]')"
if [ "$user" != "user1" ] && [ "$user" != "user2" ]; then
  echo "ownership: unknown user. Put 'user1' or 'user2' in .active-user (or set CROWDMAP_USER)." >&2
  exit 1
fi

# Longest matching prefix in OWNERSHIP wins; unlisted paths are shared.
owner_of() {
  local path="$1" best="" best_len=0 owner prefix
  while read -r owner prefix; do
    case "$owner" in ''|'#'*) continue ;; esac
    case "$path" in
      "$prefix"*)
        if [ ${#prefix} -gt $best_len ]; then best="$owner"; best_len=${#prefix}; fi ;;
    esac
  done < OWNERSHIP
  echo "${best:-shared}"
}

bad=0
for f in "${files[@]+"${files[@]}"}"; do
  owner="$(owner_of "$f")"
  if [ "$owner" = "$user" ] || [ "$owner" = "anyone" ]; then
    continue
  elif [ "$owner" = "shared" ]; then
    if [ "${ALLOW_SHARED:-0}" != "1" ]; then
      echo "ownership: '$f' is shared. Both users must agree; then commit with ALLOW_SHARED=1." >&2
      bad=1
    fi
  else
    echo "ownership: '$f' belongs to $owner; $user may not change it." >&2
    bad=1
  fi
done

exit $bad
