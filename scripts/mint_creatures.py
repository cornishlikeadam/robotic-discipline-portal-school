#!/usr/bin/env python3
"""
Mint creatures and print their tags.

For each creature: registers its identity, issues a one-time claim code, and
writes the tag URL, a QR code, and a printable card into tag-output/ (git-ignored,
because it contains claim codes).

  # against Supabase (same DATABASE_URL the Vercel app uses)
  DATABASE_URL="postgresql://..." python3 scripts/mint_creatures.py --base-url https://robotic-discipline-portal-school.vercel.app

  # one creature only, or print a fresh code for an unclaimed one (old code stops working)
  python3 scripts/mint_creatures.py --only mk-patch-001 --reissue

QR codes need `pip install segno`; without it you still get URLs and codes.
Write the same URL to an NTAG213/215 sticker as a URL (NDEF) record with any NFC writer app.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import pathlib
import sys
import tempfile

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from apps.creatures.server import default_db_target  # noqa: E402
from skeleton.interfaces import AnimalScryptKernel, ChassisSpec  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--file", default=str(REPO_ROOT / "creatures" / "founding.json"))
    parser.add_argument("--only", action="append", help="Creature id to mint (repeatable). Default: all in the file.")
    parser.add_argument("--base-url", default="https://robotic-discipline-portal-school.vercel.app")
    parser.add_argument("--reissue", action="store_true", help="Print a new code for already-minted, unclaimed creatures.")
    parser.add_argument("--out", default=str(REPO_ROOT / "tag-output"))
    parser.add_argument("--studio-owner", default="studio", help="owner_id recorded until someone claims the creature.")
    args = parser.parse_args()

    spec = json.loads(pathlib.Path(args.file).read_text(encoding="utf-8"))
    creatures = [c for c in spec["creatures"] if not args.only or c["id"] in args.only]
    if not creatures:
        print("No matching creatures in", args.file)
        return 1

    target, _ = default_db_target(pathlib.Path(tempfile.gettempdir()))
    kernel = AnimalScryptKernel(db_path=target)
    where = "Postgres (DATABASE_URL)" if kernel.backend == "postgres" else f"SQLite file {target}"
    print(f"Minting into {where}\n")

    try:
        import segno  # type: ignore
    except ImportError:
        segno = None
        print("(segno not installed — skipping QR images. `pip install segno` to add them.)\n")

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    base = args.base_url.rstrip("/")
    rows = []

    for c in creatures:
        cid = c["id"]
        try:
            kernel.get_companion(cid)
            exists = True
        except KeyError:
            exists = False
            chassis = ChassisSpec(**c.get("chassis", {}))
            kernel.register_companion(cid, args.studio_owner, c["name"], c["authored_lore"], chassis=chassis)

        pairing = kernel.pairing_record(cid)
        if pairing and pairing["claimed_by"]:
            print(f"{cid}: already claimed on {pairing['claimed_at']} — skipped")
            continue
        if exists and pairing and not args.reissue:
            print(f"{cid}: already minted and unclaimed — use --reissue to print a new code")
            continue

        code = kernel.issue_claim_code(cid)
        url = f"{base}/c/{cid}"
        qr_file = ""
        if segno:
            qr_file = f"{cid}.svg"
            segno.make(url, error="m").save(str(out / qr_file), scale=8, border=2, dark="#141413", light="#EFE6D4")
        rows.append({"id": cid, "name": c["name"], "url": url, "claim_code": code, "qr": qr_file})
        print(f"{cid}  {c['name']}\n  tag URL:    {url}\n  claim code: {code}\n")

    if not rows:
        return 0

    with open(out / "tags.csv", "a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["id", "name", "url", "claim_code", "qr"])
        if fh.tell() == 0:
            writer.writeheader()
        writer.writerows(rows)

    cards = ""
    for r in rows:
        img = '<img src="%s" alt="QR code">' % html.escape(r["qr"]) if r["qr"] else ""
        cards += (
            '<div class="card"><div class="name">%s</div>%s<div class="url">%s</div>'
            '<div class="code">Claim code<br><strong>%s</strong></div></div>'
            % (html.escape(r["name"]), img, html.escape(r["url"]), html.escape(r["claim_code"]))
        )
    (out / "cards.html").write_text(
        f"""<!doctype html><meta charset="utf-8"><title>Tag cards</title>
<style>body{{font-family:Arial,sans-serif;background:#fff;margin:16px}}
.card{{display:inline-block;width:2.5in;border:2px solid #141413;background:#EFE6D4;padding:12px;margin:6px;vertical-align:top;text-align:center;break-inside:avoid}}
.name{{font-weight:700;font-size:28px;letter-spacing:.04em}} img{{width:1.6in;height:1.6in}}
.url{{font:10px 'Courier New',monospace;word-break:break-all;margin:6px 0}} .code{{font:12px 'Courier New',monospace}}
.code strong{{font-size:18px;letter-spacing:.08em}}</style>{cards}""",
        encoding="utf-8",
    )
    print(f"Wrote {out / 'tags.csv'} and {out / 'cards.html'} (print the cards; keep codes private until handoff).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
