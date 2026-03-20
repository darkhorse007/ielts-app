#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKLOG_FILE="$ROOT_DIR/backlog.csv"
ACTIVITY_FILE="$ROOT_DIR/activity-log.csv"
RISK_FILE="$ROOT_DIR/risk-register.csv"
METRICS_FILE="$ROOT_DIR/metrics-weekly.csv"

for file in "$BACKLOG_FILE" "$ACTIVITY_FILE" "$RISK_FILE" "$METRICS_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing file $file"
    exit 1
  fi
done

EXPECTED_HEADER="id,type,parent_id,title,priority,status,sprint,owner,estimate,dependencies,acceptance_ref,source_doc,updated_at"
ACTUAL_HEADER="$(head -n 1 "$BACKLOG_FILE")"
if [[ "$ACTUAL_HEADER" != "$EXPECTED_HEADER" ]]; then
  echo "ERROR: backlog header mismatch"
  echo "expected: $EXPECTED_HEADER"
  echo "actual  : $ACTUAL_HEADER"
  exit 1
fi

DUP_IDS="$(awk -F',' 'NR>1{count[$1]++} END{for (id in count) if (count[id] > 1) print id}' "$BACKLOG_FILE")"
if [[ -n "$DUP_IDS" ]]; then
  echo "ERROR: duplicate IDs found"
  echo "$DUP_IDS"
  exit 1
fi

awk -F',' '
NR==1 { next }
{
  id=$1
  type=$2
  parent=$3
  priority=$5
  status=$6
  sprint=$7
  owner=$8
  estimate=$9
  deps=$10

  ids[id]=1
  types[id]=type
  parents[id]=parent
  dep_map[id]=deps

  if (!(type=="Epic" || type=="Story" || type=="Task" || type=="Bug")) {
    print "ERROR: invalid type for " id ": " type
    err=1
  }
  if (!(priority=="P0" || priority=="P1" || priority=="P2")) {
    print "ERROR: invalid priority for " id ": " priority
    err=1
  }
  if (!(status=="Draft" || status=="Ready" || status=="In Progress" || status=="In QA" || status=="Done" || status=="Released" || status=="Blocked")) {
    print "ERROR: invalid status for " id ": " status
    err=1
  }
  if (!(sprint ~ /^S[0-9]+$/ || sprint ~ /^S[0-9]+-S[0-9]+$/ || sprint=="BACKLOG" || sprint=="")) {
    print "ERROR: invalid sprint for " id ": " sprint
    err=1
  }
  if (owner=="") {
    print "ERROR: empty owner for " id
    err=1
  }
  if (estimate != "" && estimate !~ /^[0-9]+$/) {
    print "ERROR: estimate must be integer for " id ": " estimate
    err=1
  }
}
END {
  for (id in ids) {
    if (types[id]=="Story" && parents[id]=="") {
      print "ERROR: story missing parent_id: " id
      err=1
    }
    if (parents[id] != "" && !(parents[id] in ids)) {
      print "ERROR: parent_id does not exist for " id ": " parents[id]
      err=1
    }
    if (types[id]=="Story" && parents[id] != "" && types[parents[id]] != "Epic") {
      print "ERROR: story parent is not Epic for " id ": " parents[id]
      err=1
    }
    if (dep_map[id] != "") {
      n=split(dep_map[id], arr, /;/)
      for (i=1; i<=n; i++) {
        dep=arr[i]
        if (dep != "" && !(dep in ids)) {
          print "ERROR: unknown dependency for " id ": " dep
          err=1
        }
      }
    }
  }
  exit err
}
' "$BACKLOG_FILE"

echo "OK: file integrity checks passed"
echo "Summary by type/status:"
awk -F',' 'NR>1{k=$2"|" $6; c[k]++} END{for (k in c) print " - " k ": " c[k]}' "$BACKLOG_FILE" | sort
