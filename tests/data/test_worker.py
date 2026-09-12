# lian 数据适配与混合模型工作进程的独立回归测试
# Created on 2026-09-12
# @author: https://github.com/Linmoqian

import json
import hashlib
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKER = REPO_ROOT / "app" / "python" / "worker.py"
RANDOM_SEED = 20260912


def run_worker(operation, config):
    with tempfile.TemporaryDirectory() as directory:
        config_path = Path(directory) / "config.json"
        config_path.write_text(
            json.dumps(config, ensure_ascii=False),
            encoding="utf-8"
        )
        completed = subprocess.run(
            [sys.executable, str(WORKER), operation, str(config_path)],
            check=False,
            capture_output=True,
            text=True
        )
    payload = json.loads(completed.stdout.strip())
    return completed.returncode, payload


def build_fixture(path, replicated=True):
    random = np.random.default_rng(RANDOM_SEED)
    rows = []
    materials = [f"M{index:02d}" for index in range(12)]
    effects = {
        material: 24.0 - 4.0 * index
        for index, material in enumerate(materials)
    }
    for environment in ["GZ", "HN", "WH"]:
        for material in materials:
            count = 4 if replicated else 1
            interaction = random.normal(0, 0.5)
            for replicate in range(count):
                rows.append({
                    "material_id": material,
                    "environment": environment,
                    "replicate": replicate + 1,
                    "plant_height": (
                        80
                        + effects[material]
                        + interaction
                        + random.normal(0, 0.8)
                    ),
                })
    pd.DataFrame(rows).to_csv(path, index=False)


def test_pipeline():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        source = root / "phenotype.csv"
        dataset_dir = root / "dataset"
        artifact_dir = root / "artifacts"
        build_fixture(source)
        code, inspected = run_worker("inspect", {"sourcePath": str(source)})
        assert code == 0 and "plant_height" in inspected["result"]["traits"]
        code, normalized = run_worker("normalize", {
            "sourcePath": str(source),
            "outputDir": str(dataset_dir),
            "mapping": {},
        })
        assert code == 0 and normalized["result"]["quality"]["status"] == "pass"
        code, analyzed = run_worker("analyze", {
            "datasetPath": str(dataset_dir / "data.csv"),
            "outputDir": str(artifact_dir),
            "traitId": "plant_height",
        })
        assert code == 0 and analyzed["result"]["diagnostics"]["converged"], analyzed
        blup = pd.read_csv(artifact_dir / "material_blup.csv")
        assert blup.iloc[0]["material_id"] == "M00", blup.head().to_dict("records")


def test_analysis_rejects_unreplicated_data():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        source = root / "phenotype.csv"
        dataset_dir = root / "dataset"
        build_fixture(source, replicated=False)
        code, _ = run_worker("normalize", {
            "sourcePath": str(source),
            "outputDir": str(dataset_dir),
            "mapping": {},
        })
        assert code == 0
        code, payload = run_worker("analyze", {
            "datasetPath": str(dataset_dir / "data.csv"),
            "outputDir": str(root / "artifacts"),
            "traitId": "plant_height",
        })
        assert code != 0
        assert "没有重复观测" in payload["error"]


def test_long_table_reports_unit_conflict_without_mutating_source():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        source = root / "long.csv"
        dataset_dir = root / "dataset"
        frame = pd.DataFrame({
            "material_id": ["A", "A", "B", "B"],
            "environment": ["GZ", "HN", "GZ", "HN"],
            "trait": ["height"] * 4,
            "value": [80.0, np.nan, 91.0, 90.0],
            "unit": ["cm", "mm", "cm", "cm"],
        })
        frame.to_csv(source, index=False)
        checksum = hashlib.sha256(source.read_bytes()).hexdigest()
        code, normalized = run_worker("normalize", {
            "sourcePath": str(source),
            "outputDir": str(dataset_dir),
            "mapping": {},
        })
        assert code == 0
        quality = normalized["result"]["quality"]
        assert quality["status"] == "fail"
        assert quality["missingValues"] == 1
        assert quality["unitConflicts"] == ["height"]
        assert hashlib.sha256(source.read_bytes()).hexdigest() == checksum


def test_multi_sheet_uses_sheet_as_environment():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        source = root / "multi_environment.xlsx"
        dataset_dir = root / "dataset"
        with pd.ExcelWriter(source, engine="openpyxl") as writer:
            for environment in ["GZ", "HN"]:
                pd.DataFrame({
                    "material_id": ["A", "B"],
                    "plant_height": [80.0, 90.0],
                }).to_excel(writer, sheet_name=environment, index=False)
        code, inspected = run_worker("inspect", {"sourcePath": str(source)})
        assert code == 0
        assert inspected["result"]["sheets"] == ["GZ", "HN"]
        code, normalized = run_worker("normalize", {
            "sourcePath": str(source),
            "outputDir": str(dataset_dir),
            "mapping": {},
        })
        assert code == 0
        canonical = pd.read_csv(normalized["result"]["canonicalPath"])
        assert set(canonical["environment_id"]) == {"GZ", "HN"}


if __name__ == "__main__":
    test_pipeline()
    test_analysis_rejects_unreplicated_data()
    test_long_table_reports_unit_conflict_without_mutating_source()
    test_multi_sheet_uses_sheet_as_environment()
    print("[成功] Python 数据与统计回归测试通过")
