#!/usr/bin/env bash
# Mirror High Court judgment METADATA (Parquet only — no PDFs) from the public
# AWS Open Data bucket into OUR corpus lake, re-keyed for clean partition projection:
#   judgments/court=<code>/year=<yyyy>/<bench>.parquet
# Compliant: open CC-BY-4.0 data; no eCourts, no CAPTCHA.
#   Usage: scripts/mirror-ihcj.sh [all|24_17,16_20] [year ...]   (default: all 2008..2026)
set -uo pipefail
BUCKET="${CORPUS_BUCKET:-legaldriver-corpus-872253065260}"
SRC_BUCKET="indian-high-court-judgments"
COURTS="${1:-all}"; shift || true
YEARS="${*:-$(seq 2008 2026)}"
n=0
for Y in $YEARS; do
  aws s3 ls "s3://$SRC_BUCKET/metadata/parquet/year=$Y/" --no-sign-request --recursive 2>/dev/null \
    | awk '{print $4}' | grep 'metadata\.parquet$' | while read -r KEY; do
      COURT=$(printf '%s' "$KEY" | sed -n 's#.*court=\([^/]*\)/.*#\1#p')
      BENCH=$(printf '%s' "$KEY" | sed -n 's#.*bench=\([^/]*\)/.*#\1#p')
      [ -z "$COURT" ] && continue
      if [ "$COURTS" != "all" ] && ! printf ',%s,' "$COURTS" | grep -q ",$COURT,"; then continue; fi
      aws s3 cp "s3://$SRC_BUCKET/$KEY" "s3://$BUCKET/judgments/court=$COURT/year=$Y/$BENCH.parquet" --only-show-errors \
        && echo "  ok court=$COURT year=$Y bench=$BENCH"
    done
done
echo "mirror complete"
