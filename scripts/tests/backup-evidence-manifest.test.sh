#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="/tmp/ielts-backup-evidence-test"

rm -rf "$OUT_DIR"

node "$ROOT_DIR/scripts/backup-evidence-manifest.mjs" \
  --drill_id PROD-DRILL-2026-03-13-01 \
  --release_id REL-070 \
  --env_name pre-prod \
  --db_instance pg-primary-01 \
  --backup_provider rds \
  --backup_artifact_id snapshot-001 \
  --recovery_point 2026-03-13T10:05:00Z \
  --backup_created_at 2026-03-13T10:00:00Z \
  --retention_until 2026-03-20T10:00:00Z \
  --restore_target isolated-cluster-01 \
  --restore_started_at 2026-03-13T10:10:00Z \
  --restore_completed_at 2026-03-13T10:28:00Z \
  --actual_rpo_minutes 5 \
  --evidence_paths logs/restore.log,artifacts/postgres-chaos-drill-report.json \
  --notes "restore drill for GA signoff" \
  --out_dir "$OUT_DIR" \
  --overwrite true

test -f "$OUT_DIR/manifest.json"
test -f "$OUT_DIR/README.md"

grep -q '"artifact_type": "backup_recovery_evidence"' "$OUT_DIR/manifest.json"
grep -q '"status": "completed"' "$OUT_DIR/manifest.json"
grep -q '"actual_rto_minutes": 18' "$OUT_DIR/manifest.json"
grep -q '"actual_rpo_minutes": 5' "$OUT_DIR/manifest.json"
grep -q '"provider": "rds"' "$OUT_DIR/manifest.json"
grep -q 'logs/restore.log' "$OUT_DIR/README.md"

echo "backup-evidence-manifest.test.sh: PASS"
