# lian 表格适配、质量检查与多环境表型统计工作进程
# Created on 2026-09-12
# @author: https://github.com/Linmoqian

import json
import re
import sys
import warnings
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd
import statsmodels
import statsmodels.formula.api as smf

matplotlib.use("Agg")
import matplotlib.pyplot as plt


MATERIAL_NAMES = {
    "material",
    "material_id",
    "genotype",
    "gen",
    "strain",
    "line",
    "line_id",
    "accession",
    "entry",
    "cultivar",
    "品系",
    "材料",
    "材料编号",
}
ENVIRONMENT_NAMES = {
    "environment",
    "environment_id",
    "environ",
    "env",
    "location",
    "site",
    "trial",
    "year_location",
    "环境",
    "地点",
}
REPLICATE_NAMES = {
    "replicate",
    "replicate_id",
    "rep",
    "repetition",
    "重复",
}
BLOCK_NAMES = {"block", "block_id", "blk", "区组"}
TRAIT_NAMES = {"trait", "trait_id", "性状"}
VALUE_NAMES = {"value", "phenotype", "phenotypic_value", "表型值", "数值"}
UNIT_NAMES = {"unit", "单位"}
SUPPORTED_SUFFIXES = {".csv", ".tsv", ".txt", ".xlsx"}


def normalized_name(value):
    return re.sub(r"[^0-9a-zA-Z_\u4e00-\u9fff]+", "_", str(value).strip().lower()).strip("_")


def load_tables(path):
    suffix = path.suffix.lower()
    if suffix == ".xlsx":
        return {
            str(name): frame
            for name, frame in pd.read_excel(
                path,
                sheet_name=None,
                engine="openpyxl"
            ).items()
            if not frame.dropna(how="all").empty
        }
    if suffix not in SUPPORTED_SUFFIXES:
        raise ValueError(f"不支持的数据格式: {suffix or 'unknown'}")
    separator = "\t" if suffix in {".tsv", ".txt"} else None
    frame = pd.read_csv(
        path,
        sep=separator,
        engine="python" if separator is None else "c"
    )
    return {"data": frame}


def find_column(columns, names):
    normalized = {normalized_name(column): str(column) for column in columns}
    for name in names:
        if name in normalized:
            return normalized[name]
    return None


def infer_mapping(frame, sheet_count=1):
    columns = [str(column) for column in frame.columns]
    mapping = {
        "material": find_column(columns, MATERIAL_NAMES),
        "environment": find_column(columns, ENVIRONMENT_NAMES),
        "replicate": find_column(columns, REPLICATE_NAMES),
        "block": find_column(columns, BLOCK_NAMES),
        "trait": find_column(columns, TRAIT_NAMES),
        "value": find_column(columns, VALUE_NAMES),
        "unit": find_column(columns, UNIT_NAMES),
    }
    excluded = {value for value in mapping.values() if value}
    numeric_traits = [
        str(column)
        for column in frame.columns
        if str(column) not in excluded
        and pd.to_numeric(frame[column], errors="coerce").notna().mean() >= 0.7
    ]
    ambiguities = []
    if not mapping["material"]:
        ambiguities.append("未识别材料标识列")
    if not mapping["environment"] and sheet_count <= 1:
        ambiguities.append("未识别环境列")
    if not (mapping["trait"] and mapping["value"]) and not numeric_traits:
        ambiguities.append("未识别数值性状列")
    return mapping, numeric_traits, ambiguities


def inspect_source(path):
    tables = load_tables(path)
    columns = []
    traits = []
    ambiguities = []
    mappings = {}
    rows = 0
    for sheet, frame in tables.items():
        mapping, sheet_traits, sheet_ambiguities = infer_mapping(
            frame,
            len(tables)
        )
        mappings[sheet] = mapping
        columns.extend(str(column) for column in frame.columns)
        traits.extend(sheet_traits)
        ambiguities.extend(f"{sheet}: {item}" for item in sheet_ambiguities)
        rows += len(frame)
    return {
        "sheets": list(tables),
        "rowCount": rows,
        "columns": list(dict.fromkeys(columns)),
        "inferredMapping": mappings,
        "traits": list(dict.fromkeys(traits)),
        "ambiguities": ambiguities,
    }


def mapping_for_sheet(frame, sheet, configured, sheet_count):
    inferred, traits, ambiguities = infer_mapping(frame, sheet_count)
    selected = configured.get(sheet, configured) if configured else {}
    mapping = {
        key: selected.get(key) or inferred.get(key)
        for key in inferred
    }
    if not mapping["material"]:
        raise ValueError(f"{sheet}: 必须指定材料标识列")
    if not mapping["environment"] and sheet_count <= 1:
        raise ValueError(f"{sheet}: 必须指定环境列")
    return mapping, traits, ambiguities


def normalize_source(config):
    source_path = Path(config["sourcePath"])
    output_dir = Path(config["outputDir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    tables = load_tables(source_path)
    normalized = []
    all_traits = []
    mapping_manifest = {}
    for sheet, frame in tables.items():
        mapping, wide_traits, _ = mapping_for_sheet(
            frame,
            sheet,
            config.get("mapping") or {},
            len(tables)
        )
        mapping_manifest[sheet] = mapping
        base = pd.DataFrame({
            "material_id": frame[mapping["material"]].astype("string").str.strip(),
            "environment_id": (
                frame[mapping["environment"]].astype("string").str.strip()
                if mapping["environment"]
                else pd.Series([sheet] * len(frame), dtype="string")
            ),
            "replicate_id": (
                frame[mapping["replicate"]].astype("string").fillna("").str.strip()
                if mapping["replicate"]
                else ""
            ),
            "block_id": (
                frame[mapping["block"]].astype("string").fillna("").str.strip()
                if mapping["block"]
                else ""
            ),
            "source_row": [f"{sheet}!{index + 2}" for index in range(len(frame))],
        })
        if mapping["trait"] and mapping["value"]:
            current = base.copy()
            current["trait_id"] = frame[mapping["trait"]].astype("string").str.strip()
            current["value"] = pd.to_numeric(frame[mapping["value"]], errors="coerce")
            current["unit"] = (
                frame[mapping["unit"]].astype("string").fillna("").str.strip()
                if mapping["unit"]
                else ""
            )
            normalized.append(current)
            all_traits.extend(current["trait_id"].dropna().unique().tolist())
        else:
            for trait in wide_traits:
                current = base.copy()
                current["trait_id"] = normalized_name(trait)
                current["value"] = pd.to_numeric(frame[trait], errors="coerce")
                current["unit"] = ""
                normalized.append(current)
                all_traits.append(normalized_name(trait))
    if not normalized:
        raise ValueError("没有可登记的表型记录")
    result = pd.concat(normalized, ignore_index=True)
    empty_identifier = (
        result["material_id"].isna()
        | result["environment_id"].isna()
        | result["material_id"].eq("")
        | result["environment_id"].eq("")
    )
    missing_values = int(result["value"].isna().sum())
    key_columns = ["material_id", "environment_id", "trait_id"]
    if result["replicate_id"].ne("").any():
        key_columns.append("replicate_id")
    if result["block_id"].ne("").any():
        key_columns.append("block_id")
    duplicates = int(result.duplicated(key_columns, keep=False).sum())
    outliers = 0
    for _, values in result.groupby("trait_id")["value"]:
        clean = values.dropna()
        if len(clean) < 4:
            continue
        first, third = clean.quantile([0.25, 0.75])
        distance = third - first
        outliers += int(((clean < first - 1.5 * distance) | (clean > third + 1.5 * distance)).sum())
    units_per_trait = (
        result.assign(unit=result["unit"].fillna("").astype(str).str.strip())
        .loc[lambda value: value["unit"].ne("")]
        .groupby("trait_id")["unit"]
        .nunique()
    )
    unit_conflicts = [
        str(trait)
        for trait, count in units_per_trait.items()
        if count > 1
    ]
    quality_status = "fail" if empty_identifier.any() or duplicates or unit_conflicts else (
        "warn" if missing_values or outliers else "pass"
    )
    canonical_path = output_dir / "data.csv"
    result.to_csv(canonical_path, index=False)
    schema = {
        "version": "1.0.0",
        "layout": "long",
        "roles": {
            "materialId": "material_id",
            "environmentId": "environment_id",
            "replicateId": "replicate_id",
            "blockId": "block_id",
            "traitId": "trait_id",
            "value": "value",
            "unit": "unit",
        },
        "traits": [
            {"id": trait, "name": trait, "valueType": "float", "unit": None}
            for trait in dict.fromkeys(all_traits)
        ],
    }
    quality = {
        "status": quality_status,
        "rows": len(result),
        "materials": int(result["material_id"].nunique()),
        "environments": int(result["environment_id"].nunique()),
        "traits": int(result["trait_id"].nunique()),
        "missingValues": missing_values,
        "duplicateKeys": duplicates,
        "emptyIdentifiers": int(empty_identifier.sum()),
        "possibleOutliers": outliers,
        "unitConflicts": unit_conflicts,
        "rules": {"outlier": "1.5 IQR，仅标记、不删除"},
    }
    (output_dir / "schema.json").write_text(
        json.dumps(schema, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    (output_dir / "quality.json").write_text(
        json.dumps(quality, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    return {
        "canonicalPath": str(canonical_path),
        "schema": schema,
        "metadata": {
            "mapping": mapping_manifest,
            "rowCount": len(result),
        },
        "quality": quality,
        "files": ["data.csv", "schema.json", "quality.json"],
    }


def effect_label(value):
    match = re.search(r"\[(?:T\.)?([^\[\]]+)\]\]+$", str(value))
    return match.group(1) if match else str(value)


def analyze_dataset(config):
    dataset_path = Path(config["datasetPath"])
    output_dir = Path(config["outputDir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    trait_id = str(config["traitId"])
    frame = pd.read_csv(dataset_path, dtype={
        "material_id": "string",
        "environment_id": "string",
        "replicate_id": "string",
        "block_id": "string",
        "trait_id": "string",
    })
    frame = frame.loc[frame["trait_id"] == trait_id].copy()
    units = frame["unit"].fillna("").astype(str).str.strip()
    units = units.loc[units.ne("")].unique()
    if len(units) > 1:
        raise ValueError("性状存在单位冲突，必须先确认单位后才能生成正式 BLUP")
    excluded_missing = int(frame["value"].isna().sum())
    frame = frame.dropna(subset=["value", "material_id", "environment_id"])
    if frame["material_id"].nunique() < 2 or frame["environment_id"].nunique() < 2:
        raise ValueError("正式分析至少需要 2 个材料和 2 个环境")
    counts = frame.groupby(["material_id", "environment_id"]).size()
    if counts.max() < 2:
        raise ValueError("材料×环境组合没有重复观测，无法可靠分离 G×E 与残差")
    frame["material_environment"] = (
        frame["material_id"].astype(str) + "::" + frame["environment_id"].astype(str)
    )
    variance_components = {
        "material": "0 + C(material_id)",
        "material_environment": "0 + C(material_environment)",
    }
    if frame["block_id"].fillna("").ne("").any():
        frame["environment_block"] = (
            frame["environment_id"].astype(str) + "::" + frame["block_id"].astype(str)
        )
        variance_components["environment_block"] = "0 + C(environment_block)"
    frame["all_rows"] = "all"
    captured = []
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        model = smf.mixedlm(
            "value ~ C(environment_id)",
            frame,
            groups=frame["all_rows"],
            vc_formula=variance_components,
            re_formula="0"
        )
        fitted = model.fit(
            reml=True,
            method="lbfgs",
            maxiter=500,
            disp=False
        )
        captured = [str(item.message) for item in caught]
    if not fitted.converged:
        raise ValueError("混合模型未收敛，不生成 BLUP")
    effects = fitted.random_effects["all"]
    material_rows = []
    interaction_rows = []
    grand_mean = float(fitted.fe_params.get("Intercept", frame["value"].mean()))
    for key, value in effects.items():
        text = str(key)
        if text.startswith("material["):
            material = effect_label(text)
            material_rows.append({
                "material_id": material,
                "random_effect": float(value),
                "predicted_value": grand_mean + float(value),
            })
        elif text.startswith("material_environment["):
            label = effect_label(text)
            material, environment = label.split("::", 1)
            interaction_rows.append({
                "material_id": material,
                "environment_id": environment,
                "interaction_effect": float(value),
            })
    blup = pd.DataFrame(material_rows).sort_values("predicted_value", ascending=False)
    interaction = pd.DataFrame(interaction_rows)
    if blup.empty or interaction.empty:
        raise ValueError("统计库未返回可解析的材料或 G×E 随机效应")
    blup.to_csv(output_dir / "material_blup.csv", index=False)
    interaction.to_csv(output_dir / "gxe_effects.csv", index=False)
    diagnostics = {
        "converged": bool(fitted.converged),
        "method": "REML",
        "formula": "value ~ C(environment_id)",
        "varianceComponents": {
            name: float(value)
            for name, value in zip(variance_components, fitted.vcomp)
        },
        "residualVariance": float(fitted.scale),
        "observations": len(frame),
        "materials": int(frame["material_id"].nunique()),
        "environments": int(frame["environment_id"].nunique()),
        "excludedMissing": excluded_missing,
        "warnings": captured,
        "software": {
            "python": sys.version.split()[0],
            "statsmodels": statsmodels.__version__,
            "pandas": pd.__version__,
            "numpy": np.__version__,
        },
    }
    (output_dir / "fit_summary.json").write_text(
        json.dumps(diagnostics, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    figure, axis = plt.subplots(figsize=(9, 5))
    shown = blup.head(30).sort_values("predicted_value")
    axis.barh(shown["material_id"], shown["predicted_value"], color="#40814f")
    axis.set_title(f"{trait_id} 材料预测值（前 30）")
    axis.set_xlabel("预测值；不代表自动育种选择")
    figure.tight_layout()
    figure.savefig(output_dir / "blup.png", dpi=160)
    plt.close(figure)
    matrix = interaction.pivot(
        index="material_id",
        columns="environment_id",
        values="interaction_effect"
    ).fillna(0)
    figure, axis = plt.subplots(figsize=(10, max(4, min(14, len(matrix) * 0.24))))
    image = axis.imshow(matrix, aspect="auto", cmap="RdYlGn")
    axis.set_xticks(range(len(matrix.columns)), matrix.columns, rotation=45, ha="right")
    axis.set_yticks(range(len(matrix.index)), matrix.index)
    axis.set_title(f"{trait_id} 材料×环境交互效应")
    figure.colorbar(image, ax=axis, label="交互效应")
    figure.tight_layout()
    figure.savefig(output_dir / "gxe_heatmap.png", dpi=160)
    plt.close(figure)
    report = f"""# {trait_id} 多环境表型分析

本次使用 REML 混合模型；环境为固定效应，材料和材料×环境为随机效应。

- 有效观测：{len(frame)}
- 材料：{frame['material_id'].nunique()}
- 环境：{frame['environment_id'].nunique()}
- 排除的缺失观测：{excluded_missing}
- 模型收敛：是

材料 BLUP 与 G×E 效应见随附 CSV 和图表。本报告不预设性状方向，也不自动给出材料淘汰或选择结论。
"""
    (output_dir / "report.md").write_text(report, encoding="utf-8")
    return {
        "diagnostics": diagnostics,
        "artifacts": [
            {"type": "model.fit", "name": f"{trait_id} 混合模型", "files": ["fit_summary.json"]},
            {"type": "breeding.blup", "name": f"{trait_id} 材料 BLUP", "files": ["material_blup.csv", "blup.png"]},
            {"type": "breeding.gxe", "name": f"{trait_id} G×E 效应", "files": ["gxe_effects.csv", "gxe_heatmap.png"]},
            {"type": "report.analysis", "name": f"{trait_id} 分析报告", "files": ["report.md"]},
        ],
    }


def main():
    if len(sys.argv) != 3:
        raise ValueError("用法: worker.py <inspect|normalize|analyze> <config.json>")
    operation = sys.argv[1]
    config_path = Path(sys.argv[2])
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if operation == "inspect":
        result = inspect_source(Path(config["sourcePath"]))
    elif operation == "normalize":
        result = normalize_source(config)
    elif operation == "analyze":
        result = analyze_dataset(config)
    else:
        raise ValueError(f"未知操作: {operation}")
    print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        raise SystemExit(1)
