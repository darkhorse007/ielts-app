#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKLOG_FILE="$ROOT_DIR/backlog.csv"

if [[ ! -f "$BACKLOG_FILE" ]]; then
  echo "ERROR: missing $BACKLOG_FILE"
  exit 1
fi

echo "Total items:"
awk -F',' 'NR>1{total++} END{print total+0}' "$BACKLOG_FILE"

echo
echo "By status:"
awk -F',' 'NR>1{s[$6]++} END{for (k in s) printf "%-12s %d\n", k, s[k]}' "$BACKLOG_FILE" | sort

echo
echo "By sprint:"
awk -F',' 'NR>1{sp[$7]++} END{for (k in sp) printf "%-12s %d\n", k, sp[k]}' "$BACKLOG_FILE" | sort

echo
echo "P0 points by sprint (Story only):"
awk -F',' 'NR>1 && $2=="Story" && $5=="P0" && $9!="" {pts[$7]+=$9} END{for (k in pts) printf "%-12s %d\n", k, pts[k]}' "$BACKLOG_FILE" | sort
