#!/usr/bin/env python3
"""Regenerate js/photos.js from the curated map.

    python3 tools/match-exercise-photos.py

The mapping in tools/exercise-photo-map.json is HAND-MADE, on purpose. Fuzzy
name matching against free-exercise-db gets it wrong often enough to be
dangerous — "Barbell Row" fuzzy-matches "Barbell Curl" — and a confidently
wrong form photo is worse than none.

Each entry is coach_exercise_id -> [db_id, "exact"|"close"] or [null, null].
Add a new exercise by finding its id in the database and adding a line.
"""
import json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
MAP = os.path.join(ROOT, "tools", "exercise-photo-map.json")
OUT = os.path.join(ROOT, "js", "photos.js")


def main():
    cache = os.path.join(ROOT, "tools", ".exdb-cache.json")
    if os.path.exists(cache):
        db = json.load(open(cache))
    else:
        print("fetching free-exercise-db…")
        db = json.load(urllib.request.urlopen(DB_URL))
        json.dump(db, open(cache, "w"))
    byid = {e["id"]: e for e in db}
    cur = json.load(open(MAP))

    bad = [(k, v[0]) for k, v in cur.items() if v[0] and v[0] not in byid]
    if bad:
        print("ERROR — these ids aren't in the database:", bad)
        return 1
    noimg = [(k, v[0]) for k, v in cur.items() if v[0] and not byid[v[0]].get("images")]
    if noimg:
        print("ERROR — mapped but no images:", noimg)
        return 1

    lines = []
    for k in sorted(cur):
        eid, conf = cur[k]
        if not eid:
            lines.append('  "%s": null,' % k)
            continue
        e = byid[eid]
        lines.append('  "%s": { id: "%s", name: %s, match: "%s", images: %s },' % (
            k, eid, json.dumps(e["name"]), conf, json.dumps(e["images"][:2])))

    header = open(OUT).read().split("window.App")[0] if os.path.exists(OUT) else ""
    body = header + '''window.App = window.App || {};

App.EXERCISE_PHOTO_SOURCE = {
  name: "free-exercise-db",
  url: "https://github.com/yuhonas/free-exercise-db",
  licence: "Public domain (Unlicense)",
  base: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"
};

App.EXERCISE_PHOTOS = {
%s
};
''' % ("\n".join(lines).rstrip(","))
    open(OUT, "w").write(body)
    n = sum(1 for v in cur.values() if v[0])
    print("wrote %s — %d mapped (%d exact, %d close, %d left blank)" % (
        os.path.relpath(OUT, ROOT), n,
        sum(1 for v in cur.values() if v[1] == "exact"),
        sum(1 for v in cur.values() if v[1] == "close"),
        sum(1 for v in cur.values() if not v[0])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
