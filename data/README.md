# Elexon January 2026 snapshot

Run `python scripts/import_elexon.py` from the repository root. Python standard
library only; no API key is required. Existing responses are checksum-verified
and reused. `--refresh` explicitly replaces them with newly downloaded responses.

- `raw/WINDFOR/`: forecast responses for publication dates 29 December 2025–31 January 2026.
- `raw/FUELHH/`: WIND-only actual responses for delivery dates 1 January–1 February 2026.
- Each raw response has a `.meta.json` sidecar recording URL, retrieval time and SHA-256.
- `elexon.sqlite3`: indexed forecast and actual records, retaining publication timestamps.
- `manifest.json`: source provenance, counts and per-decision-day coverage audit.

January decisions concern delivery on 2 January–1 February. Actuals for 1 January
are retained as surrounding context, not automatically included in January-decision
accuracy metrics. Forecasts have a three-day publication buffer; missing coverage
must be reported, not filled with zero. Import fails on invalid records or
conflicting generation values for an identical target/publication key.

The coverage audit uses an illustrative 09:00 UTC decision cutoff. It does not
configure an application cutoff. No alignment assumption or error metric is applied
at import. Source responses preserve versions returned by the API; this does not
establish availability of every historical revision of actual generation.

Source: Elexon Insights BMRS, `datasets/WINDFOR/stream` and
`datasets/FUELHH/stream` at https://data.elexon.co.uk/bmrs/api/v1/.
