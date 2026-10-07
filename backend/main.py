"""
Supermarket Transaction Association Rule Mining — Backend API
FastAPI + pandas + mlxtend. Single-session in-memory store (college project
scope — no auth/db needed). All computation happens on demand; nothing is
pre-baked or hardcoded.
"""
import io
import os
import zipfile
import csv
import sqlite3
import uuid
import numpy as np
from datetime import datetime
from contextlib import contextmanager
from typing import Optional, List

import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

import xlsxwriter
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

import data_processing as dp
import algorithms as algo
import marketing as mkt

app = FastAPI(title="Supermarket Association Rule Mining API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SAMPLE_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "supermarket_transactions_1500.csv")
STORE_DIR = os.path.join(os.path.dirname(__file__), "data_store")
STORE_PATH = os.path.join(STORE_DIR, "datasets.sqlite3")

# ---- in-memory session state ----
STATE = {
    "dataset_id": None,
    "dataset_filename": None,
    "raw_df": None,
    "cleaned_df": None,
    "baskets": None,
    "preprocess_summary": None,
    "encoded_df": None,
    "results": {},   # algorithm -> {"itemsets_df":..., "rules_df":..., "meta":...}
    "last_params": {},
    "report_cache": {},
}


@contextmanager
def _store_connection():
    """Open the small local database used to retain uploaded datasets."""
    os.makedirs(STORE_DIR, exist_ok=True)
    conn = sqlite3.connect(STORE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _init_store():
    with _store_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS datasets (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                created_at TEXT NOT NULL,
                raw_csv BLOB NOT NULL,
                preprocessed INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(datasets)")}
        if "preprocessed" not in columns:
            conn.execute("ALTER TABLE datasets ADD COLUMN preprocessed INTEGER NOT NULL DEFAULT 0")


def _save_dataset(filename: str, raw_csv: bytes) -> str:
    dataset_id = str(uuid.uuid4())
    created_at = datetime.now().astimezone().isoformat(timespec="seconds")
    with _store_connection() as conn:
        conn.execute(
            "INSERT INTO datasets (id, filename, created_at, raw_csv) VALUES (?, ?, ?, ?)",
            (dataset_id, filename, created_at, raw_csv),
        )
    return dataset_id


def _dataset_record(dataset_id: str):
    with _store_connection() as conn:
        return conn.execute(
            "SELECT id, filename, created_at, raw_csv, preprocessed FROM datasets WHERE id = ?", (dataset_id,)
        ).fetchone()


def _activate_dataset(dataset_id: str, raw_df: pd.DataFrame, filename: str, preprocessed: bool = False):
    """Make a saved dataset current without removing any earlier dataset."""
    STATE["dataset_id"] = dataset_id
    STATE["dataset_filename"] = filename
    STATE["raw_df"] = raw_df
    STATE["cleaned_df"] = None
    STATE["baskets"] = None
    STATE["preprocess_summary"] = None
    _reset_downstream()
    if preprocessed:
        try:
            cleaned_df, baskets, summary = dp.clean_and_build_baskets(raw_df)
            if len(baskets) >= 2:
                STATE["cleaned_df"] = cleaned_df
                STATE["baskets"] = baskets
                STATE["preprocess_summary"] = summary
        except Exception:
            # The source CSV remains available even if a future code change
            # makes an old preprocessing snapshot incompatible.
            pass
    with _store_connection() as conn:
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('active_dataset_id', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (dataset_id,),
        )


def _dataset_response(filename: str, raw_df: pd.DataFrame, dataset_id: str):
    return {
        "dataset_id": dataset_id,
        "filename": filename,
        "preview": dp.dataset_preview(raw_df),
        "preprocess_summary": STATE["preprocess_summary"] if STATE["dataset_id"] == dataset_id else None,
    }


def _save_and_activate(filename: str, raw_csv: bytes, raw_df: pd.DataFrame):
    dataset_id = _save_dataset(filename, raw_csv)
    _activate_dataset(dataset_id, raw_df, filename)
    return _dataset_response(filename, raw_df, dataset_id)


def _mark_preprocessed(dataset_id: str):
    with _store_connection() as conn:
        conn.execute("UPDATE datasets SET preprocessed = 1 WHERE id = ?", (dataset_id,))


def _require_baskets():
    if STATE["baskets"] is None:
        raise HTTPException(400, "No preprocessed dataset yet. Upload a CSV and call /api/preprocess first.")


def _reset_downstream():
    STATE["encoded_df"] = None
    STATE["results"] = {}
    STATE["report_cache"] = {}


def _restore_active_dataset():
    """Restore the last selected dataset after a backend restart, if it still exists."""
    with _store_connection() as conn:
        setting = conn.execute(
            "SELECT value FROM app_settings WHERE key = 'active_dataset_id'"
        ).fetchone()
    if not setting:
        return
    record = _dataset_record(setting["value"])
    if not record:
        return
    try:
        raw_df = dp.load_csv(record["raw_csv"])
        _activate_dataset(record["id"], raw_df, record["filename"], bool(record["preprocessed"]))
    except Exception:
        # A bad historic file must not stop the API from starting.
        return


_init_store()
_restore_active_dataset()


# ---------------------------------------------------------------- dataset --

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/dataset/upload")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Please upload a .csv file.")
    content = await file.read()
    try:
        raw_df = dp.load_csv(content)
    except Exception as e:
        raise HTTPException(400, f"Could not parse CSV: {e}")
    if len(raw_df) == 0:
        raise HTTPException(400, "The uploaded CSV is empty.")

    return _save_and_activate(file.filename, content, raw_df)


@app.post("/api/dataset/sample")
def load_sample_dataset():
    with open(SAMPLE_DATA_PATH, "rb") as sample_file:
        content = sample_file.read()
    raw_df = dp.load_csv(content)
    return _save_and_activate("supermarket_transactions_1500.csv", content, raw_df)

LARGE_SAMPLE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "supermarket_transactions_100000.csv")


@app.post("/api/dataset/large-sample")
def load_large_sample_dataset():
    if not os.path.exists(LARGE_SAMPLE_PATH):
        raise HTTPException(404, "Bundled 100,000-row dataset is missing from the data folder.")
    with open(LARGE_SAMPLE_PATH, "rb") as sample_file:
        content = sample_file.read()
    raw_df = dp.load_csv(content)
    return _save_and_activate("supermarket_transactions_100000.csv", content, raw_df)


@app.get("/api/datasets")
def list_datasets():
    """Return retained uploads, newest first. Raw records stay only on this machine."""
    with _store_connection() as conn:
        records = conn.execute(
            "SELECT id, filename, created_at, preprocessed FROM datasets ORDER BY created_at DESC, rowid DESC"
        ).fetchall()
    return {
        "active_dataset_id": STATE["dataset_id"],
        "datasets": [
            {
                "dataset_id": row["id"], "filename": row["filename"],
                "created_at": row["created_at"], "preprocessed": bool(row["preprocessed"]),
            }
            for row in records
        ],
    }


@app.post("/api/datasets/{dataset_id}/activate")
def activate_saved_dataset(dataset_id: str):
    record = _dataset_record(dataset_id)
    if not record:
        raise HTTPException(404, "Saved dataset not found.")
    try:
        raw_df = dp.load_csv(record["raw_csv"])
    except Exception as e:
        raise HTTPException(400, f"Could not load saved dataset: {e}")
    _activate_dataset(record["id"], raw_df, record["filename"], bool(record["preprocessed"]))
    return _dataset_response(record["filename"], raw_df, record["id"])


@app.get("/api/dataset/current")
def current_dataset():
    if STATE["raw_df"] is None:
        return {"dataset": None}
    return {"dataset": _dataset_response(STATE["dataset_filename"], STATE["raw_df"], STATE["dataset_id"])}


@app.get("/api/dataset/preview")
def get_preview(n: int = 10):
    if STATE["raw_df"] is None:
        raise HTTPException(400, "No dataset loaded.")
    return dp.dataset_preview(STATE["raw_df"], n)


@app.post("/api/preprocess")
def preprocess():
    if STATE["raw_df"] is None:
        raise HTTPException(400, "No dataset loaded. Upload a CSV first.")
    cleaned_df, baskets, summary = dp.clean_and_build_baskets(STATE["raw_df"])
    if len(baskets) < 2:
        raise HTTPException(400, "Not enough valid multi-item transactions found after cleaning.")
    STATE["cleaned_df"] = cleaned_df
    STATE["baskets"] = baskets
    STATE["preprocess_summary"] = summary
    _reset_downstream()
    _mark_preprocessed(STATE["dataset_id"])
    return summary


# ---------------------------------------------------------------- mining ---

class MineRequest(BaseModel):
    algorithm: str  # apriori | fpgrowth | fpmax
    min_support: float = 0.02
    min_confidence: float = 0.3
    min_lift: float = 1.0


@app.post("/api/mine")
def mine(req: MineRequest):
    _require_baskets()
    if req.algorithm not in algo.ALGORITHMS:
        raise HTTPException(400, f"Unknown algorithm '{req.algorithm}'")
    if not 0 < req.min_support <= 1:
        raise HTTPException(400, "min_support must be greater than 0 and at most 1.")
    if not 0 <= req.min_confidence <= 1:
        raise HTTPException(400, "min_confidence must be between 0 and 1.")
    if req.min_lift < 0:
        raise HTTPException(400, "min_lift cannot be negative.")

    if STATE["encoded_df"] is None:
        STATE["encoded_df"] = algo.encode_transactions(STATE["baskets"])
    encoded_df = STATE["encoded_df"]

    try:
        result = algo.run_mining(encoded_df, req.algorithm, req.min_support)
    except Exception as e:
        raise HTTPException(400, f"Mining failed: {e}")

    if result["num_itemsets"] == 0:
        STATE["results"][req.algorithm] = {"itemsets_df": result["itemsets_df"], "rules_df": pd.DataFrame(), "meta": result}
        return {
            "algorithm": req.algorithm, "execution_time_ms": result["execution_time_ms"],
            "num_itemsets": 0, "num_rules": 0, "itemsets": [], "rules": [],
            "max_itemset_length": 0,
            "warning": "No frequent itemsets found at this support threshold. Try lowering minimum support.",
        }

    rules_df = algo.compute_rules(result["itemsets_df"], req.min_confidence, req.min_lift)
    STATE["results"][req.algorithm] = {"itemsets_df": result["itemsets_df"], "rules_df": rules_df, "meta": result}
    STATE["last_params"] = req.dict()
    STATE["report_cache"] = {}

    itemsets_records = algo.itemsets_to_records(result["itemsets_df"])
    rules_records = algo.rules_to_records(rules_df) if len(rules_df) else []

    warning = None
    if req.algorithm == "fpmax" and len(rules_records) == 0:
        warning = ("FP-Max returns only maximal frequent itemsets (no itemset that is a subset of "
                    "another frequent itemset). Classic rule generation needs subset relations, so it "
                    "commonly yields few or no rules — this is expected algorithmic behaviour, not an error.")

    return {
        "algorithm": req.algorithm,
        "execution_time_ms": result["execution_time_ms"],
        "num_itemsets": result["num_itemsets"],
        "num_rules": len(rules_records),
        "max_itemset_length": result["max_itemset_length"],
        "itemsets": itemsets_records,
        "rules": rules_records,
        "warning": warning,
    }


class CompareRequest(BaseModel):
    min_support: float = 0.02
    min_confidence: float = 0.3
    min_lift: float = 1.0


@app.post("/api/compare")
def compare(req: CompareRequest):
    _require_baskets()
    if not 0 < req.min_support <= 1:
        raise HTTPException(400, "min_support must be greater than 0 and at most 1.")
    if not 0 <= req.min_confidence <= 1:
        raise HTTPException(400, "min_confidence must be between 0 and 1.")
    if req.min_lift < 0:
        raise HTTPException(400, "min_lift cannot be negative.")
    if STATE["encoded_df"] is None:
        STATE["encoded_df"] = algo.encode_transactions(STATE["baskets"])
    encoded_df = STATE["encoded_df"]

    comparison = []
    for algorithm in ["apriori", "fpgrowth", "fpmax"]:
        try:
            result = algo.run_mining(encoded_df, algorithm, req.min_support)
        except Exception as e:
            comparison.append({"algorithm": algorithm, "error": str(e)})
            continue
        rules_df = algo.compute_rules(result["itemsets_df"], req.min_confidence, req.min_lift) if result["num_itemsets"] else pd.DataFrame()
        STATE["results"][algorithm] = {"itemsets_df": result["itemsets_df"], "rules_df": rules_df, "meta": result}

        top_rule = None
        if len(rules_df):
            top = rules_df.sort_values("lift", ascending=False).iloc[0]
            top_rule = {
                "antecedents": sorted(list(top["antecedents"])),
                "consequents": sorted(list(top["consequents"])),
                "lift": round(float(top["lift"]), 4),
                "confidence": round(float(top["confidence"]), 4),
            }

        comparison.append({
            "algorithm": algorithm,
            "execution_time_ms": result["execution_time_ms"],
            "num_itemsets": result["num_itemsets"],
            "num_rules": int(len(rules_df)),
            "max_itemset_length": result["max_itemset_length"],
            "avg_support": round(float(result["itemsets_df"]["support"].mean()), 6) if result["num_itemsets"] else 0,
            "top_rule_by_lift": top_rule,
        })

    STATE["last_params"] = req.dict()
    STATE["report_cache"] = {}
    return {"min_support": req.min_support, "min_confidence": req.min_confidence, "results": comparison}


# ------------------------------------------------------------- exploration -

@app.get("/api/products")
def products():
    _require_baskets()
    df = STATE["cleaned_df"]
    counts = df["Product"].value_counts()
    total_txns = df["TransactionID"].nunique()
    out = []
    for p, c in counts.items():
        out.append({
            "product": p,
            "count": int(c),
            "support": round(float(c) / total_txns, 6),
        })
    return {"products": out, "total_transactions": int(total_txns)}


@app.get("/api/products/{product_name}/sales")
def product_sales(product_name: str):
    _require_baskets()
    df = STATE["cleaned_df"].copy()
    if "Product" not in df.columns:
        raise HTTPException(400, "Product column is unavailable.")
    mask = df["Product"].astype(str).str.casefold() == product_name.casefold()
    selected = df.loc[mask].copy()
    if selected.empty:
        raise HTTPException(404, f"Product '{product_name}' was not found.")

    # Prefer real dates when available.  The response is intentionally compact
    # so the Product Explorer remains fast even for 100k+ transactions.
    if "Date" in selected.columns:
        dates = pd.to_datetime(selected["Date"], errors="coerce")
        dated = selected.assign(_date=dates).dropna(subset=["_date"])
        daily = dated.groupby(dated["_date"].dt.strftime("%Y-%m-%d")).size()
        daily = daily.sort_index()
        values = daily.astype(int).tolist()
        labels = daily.index.tolist()
    else:
        values = []
        labels = []

    # Product sales distribution: use the exact number of product transactions
    # per day on the X-axis (not an artificial range). This makes the chart
    # directly readable: e.g. X=12 means the product sold in 12 transactions
    # on that day, while Y=8 means that happened on 8 days.
    distribution = []
    if values:
        freq = pd.Series(values, dtype="int64").value_counts().sort_index()
        distribution = [
            {"transactions": int(txn), "days": int(day_count)}
            for txn, day_count in freq.items()
        ]

    return {
        "product": str(selected["Product"].iloc[0]),
        "transaction_count": int(selected["TransactionID"].nunique()) if "TransactionID" in selected.columns else int(len(selected)),
        "daily_sales": [{"date": d, "transactions": int(v)} for d, v in zip(labels, values)],
        "histogram": distribution,
    }


def _normalize_selected_products(products):
    """Return a clean, case-insensitive product selection. Empty means all."""
    if not products:
        return []
    seen = set()
    out = []
    for product in products:
        value = str(product).strip()
        key = value.casefold()
        if value and key not in seen:
            seen.add(key)
            out.append(value)
    return out


def _filter_rules_for_products(rules_df: pd.DataFrame, selected_products):
    selected = _normalize_selected_products(selected_products)
    if not selected or rules_df is None or len(rules_df) == 0:
        return rules_df
    wanted = {p.casefold() for p in selected}
    def touches_selected(row):
        items = list(row.get("antecedents", [])) + list(row.get("consequents", []))
        return any(str(item).casefold() in wanted for item in items)
    mask = rules_df.apply(touches_selected, axis=1)
    return rules_df.loc[mask].copy()


def _filter_itemsets_for_products(itemsets_df: pd.DataFrame, selected_products):
    selected = _normalize_selected_products(selected_products)
    if not selected or itemsets_df is None or len(itemsets_df) == 0:
        return itemsets_df
    wanted = {p.casefold() for p in selected}
    def touches_selected(row):
        return any(str(item).casefold() in wanted for item in row.get("itemsets", []))
    mask = itemsets_df.apply(touches_selected, axis=1)
    return itemsets_df.loc[mask].copy()


@app.get("/api/marketing")
def get_marketing(algorithm: str = "fpgrowth", top_k: int = 40, products: Optional[List[str]] = Query(None)):
    if algorithm not in STATE["results"]:
        raise HTTPException(400, f"No mined results for '{algorithm}' yet. Call /api/mine first.")
    selected_products = _normalize_selected_products(products)
    rules_df = _filter_rules_for_products(STATE["results"][algorithm]["rules_df"], selected_products)
    rules_records = algo.rules_to_records(rules_df) if len(rules_df) else []
    recs = mkt.generate_recommendations(rules_records, top_k=top_k, cleaned_df=STATE["cleaned_df"])
    return {"algorithm": algorithm, "count": len(recs), "recommendations": recs, "selected_products": selected_products, "all_products": not bool(selected_products)}


@app.get("/api/feedback")
def get_feedback():
    """Customer-rating analysis produced from the uploaded CSV, when present."""
    if STATE["preprocess_summary"] is None:
        raise HTTPException(400, "Preprocess the dataset first.")
    return STATE["preprocess_summary"].get("feedback", {"available": False})



# ------------------------------------------------------- business report --
def _report_rows(algorithm: str):
    if algorithm not in STATE["results"]:
        raise HTTPException(400, f"No mined results for '{algorithm}' yet.")
    if STATE["preprocess_summary"] is None:
        raise HTTPException(400, "Preprocess the dataset first.")
    summary = STATE["preprocess_summary"]
    feedback = summary.get("feedback", {})
    result = STATE["results"][algorithm]
    itemsets_df = result["itemsets_df"].copy()
    rules_df = result["rules_df"].copy()
    rules_records = algo.rules_to_records(rules_df) if len(rules_df) else []
    recs = mkt.generate_recommendations(rules_records, top_k=200, cleaned_df=STATE["cleaned_df"])
    return summary, result, itemsets_df, rules_df, recs


def _business_narrative(summary, result, rules_df, recs):
    # Mining results store algorithm metadata inside the nested ``meta`` object.
    # The previous exporter incorrectly looked for num_itemsets directly on
    # ``result``; that caused every Business Report request to fail with a 500.
    meta = result.get("meta", {}) if isinstance(result, dict) else {}
    algorithm = result.get("algorithm") or meta.get("algorithm") or "association-mining"
    num_itemsets = int(meta.get("num_itemsets", len(result.get("itemsets_df", []))))
    execution_ms = float(meta.get("execution_time_ms", 0))

    tx = int(summary.get("num_transactions", 0))
    products = int(summary.get("num_unique_products", 0))
    avg = float(summary.get("avg_basket_size", 0))
    nrules = len(rules_df)

    if nrules:
        top = rules_df.sort_values(["lift", "confidence"], ascending=False).iloc[0]
        ante = ", ".join(sorted(top["antecedents"]))
        cons = ", ".join(sorted(top["consequents"]))
        top_text = (
            f"The strongest association is {ante} → {cons}, with "
            f"{float(top['confidence']) * 100:.1f}% confidence and a lift of "
            f"{float(top['lift']):.2f}x. This means the consequent is substantially "
            f"more likely when the antecedent is present than under an independent-purchase assumption."
        )
    else:
        top_text = (
            "No association rules were produced at the current thresholds. "
            "Lower the support/confidence thresholds and rerun the selected algorithm "
            "if broader business patterns are required."
        )

    strategies = sorted(set(r["strategy_type"] for r in recs[:5]))
    action = (
        "The strongest recommended actions are " + ", ".join(strategies) + "."
        if strategies
        else "There are currently no rules strong enough to convert into marketing actions."
    )

    return [
        f"This analysis covers {tx:,} cleaned multi-item transactions across {products:,} unique products, with an average basket size of {avg:.2f} items.",
        f"The selected {algorithm} run produced {num_itemsets:,} frequent itemsets and {nrules:,} association rules at the selected thresholds.",
        top_text,
        action,
        f"The {algorithm} mining run completed in {execution_ms:.2f} ms. Prioritize rules with meaningful support and lift above 1.0: lift measures strength above chance, while support shows how broadly the pattern occurs.",
    ]


def _safe(v):
    if v is None:
        return ""
    try:
        if pd.isna(v):
            return ""
    except Exception:
        pass
    if isinstance(v, str):
        # Excel/openpyxl rejects C0 control characters. Remove them from
        # user-uploaded text while preserving normal Unicode such as arrows.
        return "".join(ch for ch in v if ch in "\t\n\r" or ord(ch) >= 32)
    return v


def _add_table(ws, start_row, start_col, headers, rows):
    for j, h in enumerate(headers, start_col):
        c=ws.cell(start_row,j,h); c.font=Font(bold=True,color="FFFFFF"); c.fill=PatternFill("solid",fgColor="243447"); c.alignment=Alignment(horizontal="center")
    for i,row in enumerate(rows,start_row+1):
        for j,val in enumerate(row,start_col):
            ws.cell(i,j,_safe(val))
    return start_row+len(rows)

@app.get("/api/export/business-report")
def export_business_report(algorithm: str = "fpgrowth", products: Optional[List[str]] = Query(None)):
    """Fast presentation-ready Excel report.

    Uses XlsxWriter's streaming-friendly writer so large cleaned datasets (100k+
    rows) can be included without the very slow openpyxl cell-by-cell overhead.
    The generated workbook is cached for the current session/algorithm.
    """
    if algorithm not in STATE["results"]:
        raise HTTPException(400, f"No mined results for '{algorithm}' yet.")
    if STATE["preprocess_summary"] is None or STATE["cleaned_df"] is None:
        raise HTTPException(400, "Preprocess the dataset first.")

    selected_products = _normalize_selected_products(products)
    product_key = "all" if not selected_products else "|".join(sorted(p.casefold() for p in selected_products))
    cache_key = f"{algorithm}:feedback-v3-adjusted-confidence:{product_key}"
    cached = STATE.get("report_cache", {}).get(cache_key)
    if cached:
        bio = io.BytesIO(cached)
        filename = f"supermarket_business_insights_{algorithm}.xlsx"
        return StreamingResponse(
            bio,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    summary = STATE["preprocess_summary"]
    feedback = summary.get("feedback", {})
    result = STATE["results"][algorithm]
    itemsets_df = _filter_itemsets_for_products(result["itemsets_df"].copy(), selected_products)
    rules_df = _filter_rules_for_products(result["rules_df"].copy(), selected_products)
    meta = result.get("meta", {})

    tx = int(summary.get("num_transactions", 0) or 0)
    products = int(summary.get("num_unique_products", 0) or 0)
    avg_basket = float(summary.get("avg_basket_size", 0) or 0)
    num_itemsets = int(len(itemsets_df) if selected_products else (meta.get("num_itemsets", len(itemsets_df)) or 0))
    num_rules = len(rules_df)
    execution_ms = float(meta.get("execution_time_ms", 0) or 0)

    # Only the strongest rules are needed for the business narrative and actions.
    # Avoid converting thousands of rule rows to Python dictionaries during export.
    if len(rules_df):
        sorted_rules = rules_df.sort_values(["lift", "confidence", "support"], ascending=False).copy()
        report_rules = sorted_rules.head(60)
    else:
        sorted_rules = rules_df.copy()
        report_rules = rules_df.copy()
    rules_records = algo.rules_to_records(report_rules) if len(report_rules) else []
    recs = mkt.generate_recommendations(rules_records, top_k=40, cleaned_df=STATE["cleaned_df"])

    # Top products from the already-cleaned dataset.
    cdf = STATE["cleaned_df"]
    if "TransactionID" in cdf.columns and "Product" in cdf.columns:
        counts = cdf.groupby("Product")["TransactionID"].nunique().sort_values(ascending=False)
    else:
        counts = cdf["Product"].value_counts()
    if selected_products:
        wanted_products = {p.casefold() for p in selected_products}
        counts = counts[[str(idx).casefold() in wanted_products for idx in counts.index]]
    top_products = [(str(k), int(v)) for k, v in counts.head(15).items()]

    def clean_text(v):
        if v is None:
            return ""
        try:
            if pd.isna(v):
                return ""
        except Exception:
            pass
        if isinstance(v, str):
            return "".join(ch for ch in v if ch in "\t\n\r" or ord(ch) >= 32)
        return v

    def itemset_text(v):
        return ", ".join(sorted(v))

    def rule_text(row):
        return f"{', '.join(sorted(row['antecedents']))} → {', '.join(sorted(row['consequents']))}"

    bio = io.BytesIO()
    # constant_memory keeps memory and write time stable for the 100k-row export sheet.
    wb = xlsxwriter.Workbook(bio, {"constant_memory": True, "strings_to_urls": False})
    wb.set_properties({
        "title": "Offline Supermarket Business Insights Report",
        "subject": f"Association rule mining business report ({algorithm.upper()})",
        "author": "Supermarket Association Mining",
    })

    navy = "0F172A"; muted = "5B6C8F"; green = "2FBF71"; pale = "EAF7F0"; border = "D9E3EA"; white = "FFFFFF"
    title_fmt = wb.add_format({"bold": True, "font_size": 18, "font_color": white, "bg_color": navy, "valign": "top", "text_wrap": True})
    subtitle_fmt = wb.add_format({"font_size": 10, "font_color": muted, "valign": "top", "text_wrap": True})
    header_fmt = wb.add_format({"bold": True, "font_color": white, "bg_color": navy, "border": 1, "border_color": border, "text_wrap": True, "valign": "top"})
    section_fmt = wb.add_format({"bold": True, "font_color": white, "bg_color": green, "text_wrap": True})
    text_fmt = wb.add_format({"text_wrap": True, "valign": "top", "border": 1, "border_color": border})
    integer_fmt = wb.add_format({"num_format": "#,##0", "border": 1, "border_color": border, "valign": "top"})
    pct_fmt = wb.add_format({"num_format": "0.00%", "border": 1, "border_color": border, "valign": "top"})
    x_fmt = wb.add_format({"num_format": "0.00x", "border": 1, "border_color": border, "valign": "top"})
    decimal_fmt = wb.add_format({"num_format": "0.00", "border": 1, "border_color": border, "valign": "top"})
    metric_label_fmt = wb.add_format({"bold": True, "font_color": muted, "bg_color": pale, "border": 1, "border_color": border})
    metric_value_fmt = wb.add_format({"bold": True, "font_size": 14, "border": 1, "border_color": border})
    note_fmt = wb.add_format({"font_color": muted, "text_wrap": True, "valign": "top"})

    def title_sheet(ws, title, subtitle, cols):
        ws.hide_gridlines(2)
        ws.merge_range(0, 0, 0, cols - 1, title, title_fmt)
        ws.merge_range(1, 0, 1, cols - 1, subtitle, subtitle_fmt)
        ws.set_row(0, 30); ws.set_row(1, 34)

    # ---------------- Business Insights
    ws = wb.add_worksheet("Business Insights")
    scope_text = "All products" if not selected_products else ", ".join(selected_products)
    title_sheet(ws, "OFFLINE SUPERMARKET — BUSINESS INSIGHTS REPORT",
                f"Association-rule analysis using {algorithm.upper()} for: {scope_text}.", 6)
    ws.set_column("A:A", 28); ws.set_column("B:B", 20); ws.set_column("C:C", 34); ws.set_column("D:D", 20); ws.set_column("E:F", 18)
    ws.write(3, 0, "DATASET & MINING SNAPSHOT", section_fmt); ws.merge_range(3, 0, 3, 5, "DATASET & MINING SNAPSHOT", section_fmt)
    metrics = [
        ("Transactions", tx), ("Unique products", products), ("Average basket size", avg_basket),
        ("Frequent itemsets", num_itemsets), ("Association rules in selected scope", num_rules), ("Execution time (ms)", execution_ms),
    ]
    for i, (label, value) in enumerate(metrics):
        r = 4 + (i // 3) * 2; c = (i % 3) * 2
        ws.write(r, c, label, metric_label_fmt); ws.write(r + 1, c, value, metric_value_fmt)
    ws.write(9, 0, "WHAT THIS MEANS FOR THE STORE", section_fmt); ws.merge_range(9, 0, 9, 5, "WHAT THIS MEANS FOR THE STORE", section_fmt)
    if len(rules_df):
        top = sorted_rules.iloc[0]
        top_text = (f"The strongest association is {', '.join(sorted(top['antecedents']))} → {', '.join(sorted(top['consequents']))}, "
                    f"with {float(top['confidence']) * 100:.1f}% confidence and {float(top['lift']):.2f}x lift. "
                    "This indicates a meaningful co-purchase relationship above independent-purchase expectation.")
    else:
        top_text = "No association rules were produced at the current thresholds. Lower support or confidence and rerun the selected algorithm."
    strategies = sorted(set(r["strategy_type"] for r in recs[:5]))
    narrative = [
        f"Business-insight scope: {scope_text}.",
        f"The analysis covers {tx:,} cleaned multi-item transactions across {products:,} unique products, with an average basket size of {avg_basket:.2f} items.",
        f"{algorithm.upper()} produced {num_itemsets:,} frequent itemsets and {num_rules:,} association rules at the selected thresholds.",
        top_text,
        ("The strongest recommended actions are " + ", ".join(strategies) + ".") if strategies else "There are no rules strong enough to convert into marketing actions at the current thresholds.",
        "Prioritize rules with lift above 1.0 and meaningful support. Lift measures strength above chance; support indicates how broadly the pattern occurs."
    ]
    if feedback.get("available") and feedback.get("total_responses", 0):
        narrative.append(
            f"Customer feedback averages {float(feedback['average_rating']):.2f}/5 across {int(feedback['total_responses']):,} responses; "
            f"{float(feedback['positive_percentage']):.1f}% are positive and {float(feedback['negative_percentage']):.1f}% are negative."
        )
        feedback_actions = [r.get("feedback_signal") for r in recs[:12] if r.get("feedback_signal")]
        if feedback_actions:
            unique_signals = list(dict.fromkeys(feedback_actions))[:3]
            narrative.append(
                "Marketing recommendations are feedback-aware: " + "; ".join(unique_signals) + ". "
                "Standard confidence remains unchanged for association mining, while feedback-adjusted confidence is calculated as "
                "standard confidence × (1 − negative-feedback rate for transactions containing A ∪ B). This penalizes strong-looking rules "
                "when customers give negative ratings and is used when ranking/selecting business actions."
            )
    narrative_start_row = 10
    for i, text in enumerate(narrative, narrative_start_row):
        ws.merge_range(i, 0, i, 5, "• " + text, text_fmt); ws.set_row(i, 38)

    # Keep the recommendation section below the variable-length narrative.
    # The feedback-aware narrative can contain extra rows, so fixed row 16
    # could overlap the last narrative line and make XlsxWriter return a 500.
    actions_header_row = narrative_start_row + len(narrative) + 1
    ws.merge_range(actions_header_row, 0, actions_header_row, 12, "RECOMMENDED STORE ACTIONS", section_fmt)
    if recs:
        headers = ["Rule", "Strategy", "Antecedent Feedback", "Consequent Feedback", "Combined Rule Feedback", "Negative Feedback Rate", "Standard Confidence", "Feedback-Adjusted Confidence", "Feedback Signal", "Interpretation", "Suggested action", "Support", "Lift"]
        actions_table_header_row = actions_header_row + 1
        for c, h in enumerate(headers): ws.write(actions_table_header_row, c, h, header_fmt)
        widths = [30, 22, 16, 18, 20, 20, 18, 24, 34, 58, 62, 12, 12]
        for c, width in enumerate(widths): ws.set_column(c, c, width)
        for r, rec in enumerate(recs[:12], actions_table_header_row + 1):
            ws.write(r, 0, f"{', '.join(rec['antecedents'])} → {', '.join(rec['consequents'])}", text_fmt)
            ws.write(r, 1, rec["strategy_type"], text_fmt)
            if rec.get("antecedent_feedback") is None: ws.write(r, 2, "N/A", text_fmt)
            else: ws.write_number(r, 2, float(rec["antecedent_feedback"]), decimal_fmt)
            if rec.get("consequent_feedback") is None: ws.write(r, 3, "N/A", text_fmt)
            else: ws.write_number(r, 3, float(rec["consequent_feedback"]), decimal_fmt)
            if rec.get("combined_feedback") is None: ws.write(r, 4, "N/A", text_fmt)
            else: ws.write_number(r, 4, float(rec["combined_feedback"]), decimal_fmt)
            if rec.get("negative_feedback_rate") is None: ws.write(r, 5, "N/A", text_fmt)
            else: ws.write_number(r, 5, float(rec["negative_feedback_rate"]), pct_fmt)
            ws.write_number(r, 6, float(rec["confidence"]), pct_fmt)
            ws.write_number(r, 7, float(rec.get("adjusted_confidence", rec["confidence"])), pct_fmt)
            ws.write(r, 8, clean_text(rec.get("feedback_signal", "Feedback unavailable")), text_fmt)
            ws.write(r, 9, clean_text(rec.get("interpretation", "")), text_fmt)
            ws.write(r, 10, clean_text(rec.get("suggested_action", "")), text_fmt)
            ws.write_number(r, 11, float(rec["support"]), pct_fmt); ws.write_number(r, 12, float(rec["lift"]), x_fmt)
            ws.set_row(r, 90)
    else:
        ws.merge_range(actions_header_row + 1, 0, actions_header_row + 1, 12, "No recommendations available for the current thresholds.", note_fmt)

    # Preprocessing diagnostics make the report useful for DWM/project evaluation.
    prep_start_row = max(31, actions_header_row + 15)
    ws.merge_range(prep_start_row, 0, prep_start_row, 5, "PREPROCESSING RESULTS", section_fmt)
    prep_rows = [
        ("Missing values found", int(summary.get("missing_values_found", 0))),
        ("Missing values removed", int(summary.get("missing_values_removed", 0))),
        ("Duplicate rows removed", int(summary.get("duplicate_rows_removed", 0))),
        ("Quantity outliers flagged", int(summary.get("quantity_outliers_handled", 0))),
        ("Identifier handling", summary.get("identifier_columns_removed", [])),
        ("Encoding", summary.get("categorical_encoding", "One-hot encoding during mining.")),
        ("Feature selection", summary.get("feature_selection", "Product/Items selected for association mining.")),
        ("Class distribution", summary.get("class_distribution", "Not applicable — unsupervised association mining.")),
    ]
    for i, (label, value) in enumerate(prep_rows, prep_start_row + 1):
        ws.write(i, 0, label, metric_label_fmt)
        if isinstance(value, list): value = ", ".join(map(str, value))
        ws.merge_range(i, 1, i, 5, clean_text(value), text_fmt)
        ws.set_row(i, 34)

    # ---------------- Top Products
    wp = wb.add_worksheet("Top Products"); title_sheet(wp, "TOP PRODUCTS", "Products appearing most frequently in the current transaction dataset.", 6)
    wp.write_row(3, 0, ["Product", "Transactions"], header_fmt); wp.set_column("A:A", 30); wp.set_column("B:B", 16); wp.set_column("D:D", 22)
    for r, (product, count) in enumerate(top_products, 4): wp.write(r, 0, product, text_fmt); wp.write_number(r, 1, count, integer_fmt)
    if top_products:
        chart = wb.add_chart({"type": "bar"}); chart.add_series({"name": "Transactions", "categories": ["Top Products", 4, 0, 3 + len(top_products), 0], "values": ["Top Products", 4, 1, 3 + len(top_products), 1]})
        chart.set_title({"name": "Top products by transaction count"}); chart.set_x_axis({"name": "Transactions"}); chart.set_y_axis({"name": "Product"}); chart.set_legend({"none": True}); chart.set_size({"width": 720, "height": 420})
        wp.insert_chart("D4", chart)

    # ---------------- Customer Feedback (only for datasets containing valid ratings)
    if feedback.get("available"):
        wf = wb.add_worksheet("Customer Feedback")
        title_sheet(wf, "CUSTOMER FEEDBACK INSIGHTS", "Ratings are calculated only from valid uploaded feedback values (1 to 5).", 7)
        wf.set_column("A:A", 26); wf.set_column("B:B", 18); wf.set_column("D:D", 30); wf.set_column("E:G", 16)
        wf.merge_range(3, 0, 3, 6, "FEEDBACK STATISTICS", section_fmt)
        feedback_metrics = [
            ("Total responses", feedback.get("total_responses", 0)),
            ("Average rating", feedback.get("average_rating", 0)),
            ("Highest rating", feedback.get("highest_rating", "—")),
            ("Lowest rating", feedback.get("lowest_rating", "—")),
            ("Positive feedback (4–5)", float(feedback.get("positive_percentage", 0)) / 100),
            ("Negative feedback (1–2)", float(feedback.get("negative_percentage", 0)) / 100),
            ("Most common rating", feedback.get("most_common_rating", "—")),
            ("Satisfaction level", feedback.get("satisfaction_level", "—")),
        ]
        for r, (label, value) in enumerate(feedback_metrics, 4):
            wf.write(r, 0, label, metric_label_fmt)
            if "feedback (" in label.lower(): wf.write_number(r, 1, value, pct_fmt)
            elif isinstance(value, (int, float)): wf.write_number(r, 1, value, decimal_fmt if label == "Average rating" else integer_fmt)
            else: wf.write(r, 1, value, text_fmt)
        wf.merge_range(13, 0, 13, 6, "CUSTOMER FEEDBACK INSIGHTS", section_fmt)
        for r, insight in enumerate(feedback.get("insights", []), 14):
            wf.merge_range(r, 0, r, 6, "• " + clean_text(insight), text_fmt); wf.set_row(r, 32)

        rating_rows = feedback.get("distribution", [])
        start = max(20, 14 + len(feedback.get("insights", [])) + 1)
        wf.write_row(start, 0, ["Feedback Rating", "Responses"], header_fmt)
        for r, row in enumerate(rating_rows, start + 1):
            wf.write_number(r, 0, int(row["rating"]), integer_fmt); wf.write_number(r, 1, int(row["count"]), integer_fmt)
        if rating_rows:
            chart = wb.add_chart({"type": "column"})
            chart.add_series({"name": "Responses", "categories": ["Customer Feedback", start + 1, 0, start + len(rating_rows), 0], "values": ["Customer Feedback", start + 1, 1, start + len(rating_rows), 1]})
            chart.set_title({"name": "Feedback rating distribution"}); chart.set_x_axis({"name": "Feedback Rating (1–5)"}); chart.set_y_axis({"name": "Number of Responses"}); chart.set_legend({"none": True}); chart.set_size({"width": 600, "height": 320}); wf.insert_chart(start, 3, chart)

        product_rows = feedback.get("product_ratings", [])
        if selected_products:
            wanted_feedback = {p.casefold() for p in selected_products}
            product_rows = [row for row in product_rows if str(row.get("product", "")).casefold() in wanted_feedback]
        product_rows = product_rows[:15]
        product_start = start + len(rating_rows) + 3
        wf.write_row(product_start, 0, ["Product", "Average Rating", "Responses", "Sales Transactions"], header_fmt)
        for r, row in enumerate(product_rows, product_start + 1):
            wf.write(r, 0, clean_text(row["product"]), text_fmt); wf.write_number(r, 1, float(row["average_rating"]), decimal_fmt); wf.write_number(r, 2, int(row["responses"]), integer_fmt); wf.write_number(r, 3, int(row["sales"]), integer_fmt)
        if product_rows:
            chart = wb.add_chart({"type": "bar"})
            chart.add_series({"name": "Average Rating", "categories": ["Customer Feedback", product_start + 1, 0, product_start + len(product_rows), 0], "values": ["Customer Feedback", product_start + 1, 1, product_start + len(product_rows), 1]})
            chart.set_title({"name": "Average feedback by product"}); chart.set_x_axis({"name": "Average Feedback Rating"}); chart.set_y_axis({"name": "Product"}); chart.set_legend({"none": True}); chart.set_size({"width": 600, "height": 420}); wf.insert_chart(product_start, 5, chart)

    # ---------------- Rule Strength
    wr = wb.add_worksheet("Rule Strength"); title_sheet(wr, "RULE STRENGTH", "Highest-lift associations from the current mining result.", 8)
    wr.write_row(3, 0, ["Rule", "Support", "Confidence", "Lift"], header_fmt); wr.set_column("A:A", 52); wr.set_column("B:C", 14); wr.set_column("D:D", 12)
    for r, (_, x) in enumerate(sorted_rules.head(15).iterrows(), 4):
        wr.write(r, 0, rule_text(x), text_fmt); wr.write_number(r, 1, float(x["support"]), pct_fmt); wr.write_number(r, 2, float(x["confidence"]), pct_fmt); wr.write_number(r, 3, float(x["lift"]), x_fmt)
    if len(sorted_rules):
        chart = wb.add_chart({"type": "bar"}); n = min(10, len(sorted_rules)); chart.add_series({"name": "Lift", "categories": ["Rule Strength", 4, 0, 3 + n, 0], "values": ["Rule Strength", 4, 3, 3 + n, 3]})
        chart.set_title({"name": "Top 10 rules by lift"}); chart.set_x_axis({"name": "Lift"}); chart.set_legend({"none": True}); chart.set_size({"width": 760, "height": 440}); wr.insert_chart("F4", chart)

    # ---------------- Frequent Itemsets
    wi = wb.add_worksheet("Frequent Itemsets"); title_sheet(wi, "FREQUENT ITEMSETS", "Top 1,000 frequent itemsets by support; use the dedicated CSV export for the complete result.", 3)
    wi.write_row(3, 0, ["Itemsets", "Length", "Support"], header_fmt); wi.set_column("A:A", 46); wi.set_column("B:B", 12); wi.set_column("C:C", 14)
    # Cap only display rows to keep the report compact; the full mining result remains available through CSV export.
    for r, (_, x) in enumerate(itemsets_df.sort_values(["support", "length"], ascending=[False, True]).head(1000).iterrows(), 4):
        wi.write(r, 0, itemset_text(x["itemsets"]), text_fmt); wi.write_number(r, 1, int(x["length"]), integer_fmt); wi.write_number(r, 2, float(x["support"]), pct_fmt)

    # ---------------- Association Rules
    wa = wb.add_worksheet("Association Rules"); title_sheet(wa, "ASSOCIATION RULES", "Top 1,000 rules by lift; use the dedicated CSV export for the complete rule table.", 9)
    headers = ["Antecedents", "Consequents", "Antecedent Support", "Consequent Support", "Support", "Confidence", "Lift", "Leverage", "Conviction"]
    wa.write_row(3, 0, headers, header_fmt); wa.set_column("A:B", 26); wa.set_column("C:F", 16); wa.set_column("G:I" , 15)
    for r, (_, x) in enumerate(sorted_rules.head(1000).iterrows(), 4):
        vals = [", ".join(sorted(x["antecedents"])), ", ".join(sorted(x["consequents"])), float(x["antecedent support"]), float(x["consequent support"]), float(x["support"]), float(x["confidence"]), float(x["lift"]), float(x["leverage"]), x["conviction"]]
        wa.write(r, 0, vals[0], text_fmt); wa.write(r, 1, vals[1], text_fmt)
        for c in [2,3,4,5]: wa.write_number(r, c, vals[c], pct_fmt)
        wa.write_number(r, 6, vals[6], x_fmt); wa.write_number(r, 7, vals[7], decimal_fmt)
        if vals[8] is None or vals[8] == float("inf"): wa.write(r, 8, "∞", text_fmt)
        else: wa.write_number(r, 8, float(vals[8]), decimal_fmt)

    # ---------------- Marketing Actions
    wm = wb.add_worksheet("Marketing Actions"); title_sheet(wm, "MARKETING ACTIONS", "Readable business recommendations generated from the strongest association rules, adjusted using customer feedback." , 15)
    headers = ["Rule ID", "Antecedents", "Consequents", "Support", "Confidence", "Feedback-Adjusted Confidence", "Lift", "Antecedent Feedback", "Consequent Feedback", "Combined Rule Feedback", "Negative Feedback Rate", "Feedback Signal", "Strategy", "Interpretation", "Suggested Action"]
    wm.write_row(3, 0, headers, header_fmt); wm.set_column("A:A", 10); wm.set_column("B:C", 24); wm.set_column("D:G", 16); wm.set_column("H:J", 20); wm.set_column("K:K", 20); wm.set_column("L:L", 34); wm.set_column("M:M", 24); wm.set_column("N:O", 60)
    for r, rec in enumerate(recs, 4):
        wm.write_number(r, 0, int(rec.get("rule_id", r - 4)), integer_fmt); wm.write(r, 1, ", ".join(rec.get("antecedents", [])), text_fmt); wm.write(r, 2, ", ".join(rec.get("consequents", [])), text_fmt)
        wm.write_number(r, 3, float(rec.get("support", 0)), pct_fmt); wm.write_number(r, 4, float(rec.get("confidence", 0)), pct_fmt); wm.write_number(r, 5, float(rec.get("adjusted_confidence", rec.get("confidence", 0))), pct_fmt); wm.write_number(r, 6, float(rec.get("lift", 0)), x_fmt)
        for col, key in [(7, "antecedent_feedback"), (8, "consequent_feedback"), (9, "combined_feedback")]:
            value = rec.get(key)
            if value is None: wm.write(r, col, "N/A", text_fmt)
            else: wm.write_number(r, col, float(value), decimal_fmt)
        if rec.get("negative_feedback_rate") is None: wm.write(r, 10, "N/A", text_fmt)
        else: wm.write_number(r, 10, float(rec["negative_feedback_rate"]), pct_fmt)
        wm.write(r, 11, clean_text(rec.get("feedback_signal", "Feedback unavailable")), text_fmt)
        wm.write(r, 12, rec.get("strategy_type", "Review"), text_fmt); wm.write(r, 13, clean_text(rec.get("interpretation", "")), text_fmt); wm.write(r, 14, clean_text(rec.get("suggested_action", "")), text_fmt); wm.set_row(r, 90)

    # ---------------- Current Export Data: full cleaned data, streamed row-by-row.
    wc = wb.add_worksheet("Current Export Data"); cdf = STATE["cleaned_df"]
    title_sheet(wc, "CURRENT EXPORT DATA", "Exact cleaned dataset currently available to the project's CSV export.", len(cdf.columns))
    wc.freeze_panes(4, 0); wc.autofilter(3, 0, 3 + len(cdf), len(cdf.columns) - 1)
    for c, col in enumerate(cdf.columns): wc.write(3, c, col, header_fmt); wc.set_column(c, c, min(30, max(12, len(str(col)) + 3)))
    for r, row in enumerate(cdf.itertuples(index=False, name=None), 4):
        for c, value in enumerate(row): wc.write(r, c, clean_text(value), text_fmt if isinstance(value, str) else integer_fmt if isinstance(value, int) else text_fmt)

    wb.close(); bio.seek(0)
    payload = bio.getvalue()
    STATE.setdefault("report_cache", {})[cache_key] = payload
    filename = f"supermarket_business_insights_{algorithm}.xlsx"
    return StreamingResponse(io.BytesIO(payload), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})

# ------------------------------------------------------------------ export -

def _csv_response(df: pd.DataFrame, filename: str):
    stream = io.StringIO()
    df.to_csv(stream, index=False)
    stream.seek(0)
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/api/export/cleaned")
def export_cleaned():
    if STATE["cleaned_df"] is None:
        raise HTTPException(400, "No cleaned dataset yet.")
    return _csv_response(STATE["cleaned_df"], "cleaned_transactions.csv")


@app.get("/api/export/itemsets")
def export_itemsets(algorithm: str = "fpgrowth"):
    if algorithm not in STATE["results"]:
        raise HTTPException(400, f"No mined results for '{algorithm}' yet.")
    itemsets_df = STATE["results"][algorithm]["itemsets_df"].copy()
    itemsets_df["itemsets"] = itemsets_df["itemsets"].apply(lambda s: ", ".join(sorted(s)))
    return _csv_response(itemsets_df[["itemsets", "length", "support"]], f"frequent_itemsets_{algorithm}.csv")


@app.get("/api/export/rules")
def export_rules(algorithm: str = "fpgrowth"):
    if algorithm not in STATE["results"]:
        raise HTTPException(400, f"No mined results for '{algorithm}' yet.")
    rules_df = STATE["results"][algorithm]["rules_df"].copy()
    if len(rules_df) == 0:
        raise HTTPException(400, "No rules to export for this algorithm/threshold combination.")
    rules_df["antecedents"] = rules_df["antecedents"].apply(lambda s: ", ".join(sorted(s)))
    rules_df["consequents"] = rules_df["consequents"].apply(lambda s: ", ".join(sorted(s)))
    cols = ["antecedents", "consequents", "antecedent support", "consequent support",
            "support", "confidence", "lift", "leverage", "conviction"]
    return _csv_response(rules_df[cols], f"association_rules_{algorithm}.csv")


def _chart_png(title, xlabel, ylabel, kind="bar", x=None, y=None, bins=None):
    fig, ax = plt.subplots(figsize=(9, 5.2), dpi=150)
    if kind == "hist":
        ax.hist(y, bins=bins or 20, edgecolor="white", linewidth=0.7)
    else:
        ax.bar(x, y)
        ax.tick_params(axis="x", rotation=45, labelsize=8)
    ax.set_title(title, fontsize=13, fontweight="bold")
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.grid(axis="y", alpha=0.2)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue()


@app.get("/api/export/analytics-package")
def export_analytics_package(algorithm: str = "apriori"):
    """Single CSV export: visualization summary first, then the actual cleaned data.

    CSV cannot embed PNG images. Instead, the export contains a neat, human-readable
    visualization section at the top with chart title, axes, values and Unicode bars,
    followed by the actual cleaned transaction table in the same CSV file.
    """
    if STATE["cleaned_df"] is None:
        raise HTTPException(400, "No cleaned dataset yet.")
    if algorithm not in STATE["results"]:
        raise HTTPException(400, f"No mined results for '{algorithm}' yet.")

    cleaned = STATE["cleaned_df"].copy()
    result = STATE["results"][algorithm]
    itemsets = result["itemsets_df"].copy()
    rules = result["rules_df"].copy()

    lines = []
    def row(*vals):
        lines.append([str(v).replace("\n", " ") if v is not None else "" for v in vals])

    row("VISUALIZATION SUMMARY", "", "", "", "")
    row("Chart", "X-axis", "Y-axis", "Result / Range", "Visual")

    # Product transactions
    if "Product" in cleaned.columns:
        counts = cleaned["Product"].value_counts().head(15)
        row("Top products by transactions", "Product", "Transactions", "", "")
        maxv = max(counts.values) if len(counts) else 1
        for product, count in counts.items():
            bar = "█" * max(1, round((int(count) / maxv) * 25))
            row("Product", product, "Transactions", int(count), bar)

    # Algorithm comparison
    row("Algorithm comparison", "Algorithm", "Execution time / itemsets / rules", "", "")
    for name, res in STATE["results"].items():
        meta = res.get("meta", {})
        t = float(meta.get("execution_time_ms", 0))
        ni = int(meta.get("num_itemsets", len(res["itemsets_df"])))
        nr = int(len(res["rules_df"]))
        row("Algorithm", name.upper(), f"{t:.2f} ms / {ni} itemsets / {nr} rules", "", "")

    # Mining distributions
    def dist_rows(title, values, x_label):
        vals = pd.Series(values).replace([float("inf"), -float("inf")], pd.NA).dropna().astype(float)
        if vals.empty:
            row(title, x_label, "Count", "No data", "")
            return
        bins = min(12, max(5, int(vals.nunique())))
        hist, edges = np.histogram(vals.values, bins=bins)
        maxh = max(hist) if len(hist) else 1
        for i, h in enumerate(hist):
            lo, hi = edges[i], edges[i+1]
            bar = "█" * max(1, round((int(h) / maxh) * 25)) if h else ""
            row(title, x_label, "Count", f"{lo:.3f}–{hi:.3f}", bar + f" ({int(h)})")

    if len(itemsets): dist_rows("Itemset support distribution", itemsets["support"], "Support")
    if len(rules):
        dist_rows("Rule support distribution", rules["support"], "Support")
        dist_rows("Rule confidence distribution", rules["confidence"], "Confidence")
        dist_rows("Rule lift distribution", rules["lift"], "Lift")

    row("", "", "", "", "")
    row("CLEANED TRANSACTION DATA", "", "", "", "")
    # Write a marker row followed by actual data headers and rows. This keeps the
    # visualization and dataset in one CSV without inventing image support that CSV
    # does not have.
    data_cols = list(cleaned.columns)
    row(*data_cols)
    for values in cleaned.itertuples(index=False, name=None):
        row(*values)

    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerows(lines)
    stream.seek(0)
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=association_mining_export_{algorithm}.csv"},
    )


@app.get("/api/export/marketing")
def export_marketing(algorithm: str = "fpgrowth"):
    if algorithm not in STATE["results"]:
        raise HTTPException(400, f"No mined results for '{algorithm}' yet.")
    rules_df = STATE["results"][algorithm]["rules_df"]
    rules_records = algo.rules_to_records(rules_df) if len(rules_df) else []
    recs = mkt.generate_recommendations(rules_records, top_k=200, cleaned_df=STATE["cleaned_df"])
    if not recs:
        raise HTTPException(400, "No marketing recommendations available for this algorithm/threshold combination.")
    df = pd.DataFrame(recs)
    df["antecedents"] = df["antecedents"].apply(lambda s: ", ".join(s))
    df["consequents"] = df["consequents"].apply(lambda s: ", ".join(s))
    return _csv_response(df, f"marketing_recommendations_{algorithm}.csv")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
