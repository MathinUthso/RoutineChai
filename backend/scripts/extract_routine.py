from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.catalog import catalog_stats, merge_catalogs, save_catalog
from app.services.eee_parser import extract_eee_catalog_with_report
from app.services.parser import ParseReport, extract_catalog_with_report


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract the Fall 2026 class routine")
    parser.add_argument("--pdf", type=Path, required=True, help="CSE/DS class routine PDF")
    parser.add_argument(
        "--eee-pdf",
        type=Path,
        default=None,
        help="Optional BSEEE course-offering PDF merged into the same catalog",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=BACKEND_DIR / "app" / "data" / "routine.json",
    )
    parser.add_argument("--term", default="Fall 2026")
    args = parser.parse_args()

    catalog, report = extract_catalog_with_report(args.pdf, None, args.term)
    reports: list[tuple[str, ParseReport]] = [(args.pdf.name, report)]

    if args.eee_pdf is not None:
        eee_catalog, eee_report = extract_eee_catalog_with_report(args.eee_pdf, args.term)
        catalog = merge_catalogs(catalog, eee_catalog)
        reports.append((args.eee_pdf.name, eee_report))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    save_catalog(catalog, args.out)

    stats = catalog_stats(catalog)
    print(f"rows: {sum(item.rows for _, item in reports)}")
    print(f"repaired: {sum(item.repaired for _, item in reports)}")
    print(f"skipped: {sum(item.skipped for _, item in reports)}")
    print(f"courses: {stats['courses']}")
    print(f"sections: {stats['sections']}")
    print(f"meetings: {stats['meetings']}")
    print(f"programs: {', '.join(stats['programs'])}")
    print("days: " + ", ".join(f"{day}={count}" for day, count in stats["days"].items()))

    warnings = [
        {"source": source, **warning}
        for source, item in reports
        for warning in item.warnings
    ]
    if warnings:
        report_path = args.out.parent / "parse_report.json"
        payload = {
            "term": catalog.term,
            "source": catalog.source,
            "rows": sum(item.rows for _, item in reports),
            "repaired": sum(item.repaired for _, item in reports),
            "skipped": sum(item.skipped for _, item in reports),
            "warnings": warnings,
        }
        tmp_path = report_path.with_suffix(".tmp")
        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp_path.replace(report_path)
        print(f"warnings: {len(warnings)} ({report_path})")


if __name__ == "__main__":
    main()
