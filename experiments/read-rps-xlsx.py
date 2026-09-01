#!/usr/bin/env python3

"""Extract per-round human and machine moves from the paper's XLSX supplements.

Uses only Python's standard library. JSON is written to stdout so the source
workbooks do not need to be copied into the project.
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def column_name(reference: str) -> str:
    match = re.match(r"([A-Z]+)", reference)
    if not match:
        raise ValueError(f"invalid cell reference: {reference}")
    return match.group(1)


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for item in root.findall(f"{{{MAIN_NS}}}si"):
        values.append("".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t")))
    return values


def cell_value(cell: ET.Element, strings: list[str]) -> str | None:
    value = cell.find(f"{{{MAIN_NS}}}v")
    if value is None or value.text is None:
        return None
    if cell.get("t") == "s":
        return strings[int(value.text)]
    return value.text


def workbook_sheets(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        item.get("Id"): item.get("Target")
        for item in relationships.findall(f"{{{PACKAGE_REL_NS}}}Relationship")
    }
    sheets: list[tuple[str, str]] = []
    for sheet in workbook.find(f"{{{MAIN_NS}}}sheets"):
        relationship_id = sheet.get(f"{{{REL_NS}}}id")
        target = targets[relationship_id]
        path = str(PurePosixPath("xl") / target)
        sheets.append((sheet.get("name", "unknown"), path))
    return sheets


def extract_workbook(path: str) -> list[dict[str, object]]:
    players: list[dict[str, object]] = []
    with zipfile.ZipFile(path) as archive:
        strings = shared_strings(archive)
        for name, sheet_path in workbook_sheets(archive):
            root = ET.fromstring(archive.read(sheet_path))
            rows = root.find(f"{{{MAIN_NS}}}sheetData")
            parsed_rows: list[dict[str, str]] = []
            for row in rows:
                values: dict[str, str] = {}
                for cell in row.findall(f"{{{MAIN_NS}}}c"):
                    value = cell_value(cell, strings)
                    if value is not None:
                        values[column_name(cell.get("r", ""))] = value
                parsed_rows.append(values)

            header_index, headers = next(
                (index, row)
                for index, row in enumerate(parsed_rows[:10])
                if any(value.strip() == "Multi AI played:" for value in row.values())
            )
            human_column = next(
                column for column, value in headers.items() if "played:" in value and "Player" in value
            )
            machine_column = next(
                column for column, value in headers.items() if value.strip() == "Multi AI played:"
            )
            rounds = [
                {"human": row[human_column], "machine": row[machine_column]}
                for row in parsed_rows[header_index + 1 :]
                if row.get(human_column) in {"R", "P", "S"}
                and row.get(machine_column) in {"R", "P", "S"}
            ]
            players.append({"name": name, "rounds": rounds})
    return players


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: read-rps-xlsx.py workbook [workbook ...]")
    players: list[dict[str, object]] = []
    for workbook in sys.argv[1:]:
        players.extend(extract_workbook(workbook))
    json.dump(players, sys.stdout, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
