from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.catalog import catalog_stats, save_catalog
from app.services.parser import extract_catalog_with_report


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract the Fall 2026 class routine")
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument(
        "--out",
        type=Path,
        default=BACKEND_DIR / "app" / "data" / "routine.json",
    )
    parser.add_argument("--term", default="Fall 2026")
    args = parser.parse_args()

    catalog, report = extract_catalog_with_report(args.pdf, None, args.term)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    save_catalog(catalog, args.out)

    stats = catalog_stats(catalog)
    print(f"rows: {report.rows}")
    print(f"repaired: {report.repaired}")
    print(f"skipped: {report.skipped}")
    print(f"courses: {stats['courses']}")
    print(f"sections: {stats['sections']}")
    print(f"meetings: {stats['meetings']}")
    print(f"programs: {', '.join(stats['programs'])}")
    print("days: " + ", ".join(f"{day}={count}" for day, count in stats["days"].items()))

    if report.warnings:
        report_path = args.out.parent / "parse_report.json"
        payload = {
            "term": catalog.term,
            "source": catalog.source,
            "rows": report.rows,
            "repaired": report.repaired,
            "skipped": report.skipped,
            "warnings": report.warnings,
        }
        tmp_path = report_path.with_suffix(".tmp")
        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp_path.replace(report_path)
        print(f"warnings: {len(report.warnings)} ({report_path})")


if __name__ == "__main__":
    main()
