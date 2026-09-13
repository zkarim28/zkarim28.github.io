# Silicon Atlas

Standalone entry point: `/chips.html`. No links were added to the portfolio. The page includes `noindex,nofollow,noarchive`; this makes it unlisted, not password protected.

## Snapshot

- All 47 English Zeptobars archive pages, 323 distinct articles, 657 article image references.
- Full article notes, source links, publication dates, die dimensions when stated, and original/full-size image URLs.
- 22 manually reviewed chip/date references. Dates distinguish family introduction, sample manufacture, die design, and other explicitly labeled historical events. The remaining 301 entries have no established chip year; their publication dates are still available. Some entries cover several devices or lab equipment rather than one chip.
- Photographs are loaded from Zeptobars, not stored locally. The page requires an internet connection for images; fonts fall back to system fonts.
- Zeptobars' [reuse terms](https://zeptobars.com/en/about-us) permit republishing articles and die shots with a source link. Images are CC BY 3.0; attribution and original article links appear in the interface. Plain-text extraction changes formatting; original reference links are retained separately.

## Refresh

From the repository root:

```sh
python3 -m venv /tmp/chips-venv
/tmp/chips-venv/bin/pip install beautifulsoup4
/tmp/chips-venv/bin/python scripts/collect-chips.py
```

Requires network access and `curl`. The importer caches public HTML in `/tmp/chips-source`, uses three workers, retries failed requests, discovers pagination, and deduplicates article URLs. Remove that temporary cache before requesting a fresh snapshot. It only writes the final catalog after every page and article succeeds. Manually reviewed dates in `year-references.json` survive refreshes.

For local preview, serve the repository over HTTP (for example `python3 -m http.server 8765`) and open `http://localhost:8765/chips.html`. Direct `file://` opening cannot fetch the JSON catalog in most browsers.
