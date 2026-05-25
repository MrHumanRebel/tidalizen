#!/usr/bin/env bash
set -euo pipefail
TV_IP="${1:?Usage: scripts/install-to-tv.sh <TV_IP> [WGT_PATH]}"
WGT="${2:-app/release/Tidalizen.wgt}"
SDB="${SDB:-sdb}"
TIZEN="${TIZEN:-tizen}"
$SDB connect "$TV_IP"
$TIZEN install -n "$WGT" -t "$TV_IP"
