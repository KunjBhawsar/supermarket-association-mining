"""
CSV validation, preprocessing and transaction-basket construction.

Supports both:
  1) Long format: TransactionID, Product [, Date, CustomerID, Quantity]
  2) One-row-per-basket format: TransactionID, Items [, Date, CustomerID, Quantity]

The preprocessing summary explicitly reports the common DWM preprocessing stages
used by the UI/report: missing values, duplicates, normalization, identifier
handling, quantity/outlier handling, feature selection and class distribution.
"""
import io
import re
from typing import Dict, Any, List, Tuple
import pandas as pd


def _detect_format(df: pd.DataFrame) -> str:
    cols_lower = [str(c).strip().lower() for c in df.columns]
    if "transactionid" in cols_lower and ("product" in cols_lower or "item" in cols_lower):
        return "long"
    if "transactionid" in cols_lower and ("items" in cols_lower or "basket" in cols_lower or "products" in cols_lower):
        return "basket"
    return "wide_guess"


def load_csv(file_bytes: bytes) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(file_bytes), low_memory=False)


def _split_items(value):
    if pd.isna(value):
        return []
    text = str(value).replace("|", ",").replace(";", ",")
    return [x.strip() for x in text.split(",") if x.strip()]


def _normalise_product(s: pd.Series) -> pd.Series:
    return (
        s.astype(str)
         .str.replace(r"\s+", " ", regex=True)
         .str.strip()
         .str.title()
    )


def _column_key(column) -> str:
    """Match common CSV headings despite spaces, underscores, and casing."""
    return re.sub(r"[^a-z0-9]", "", str(column).strip().lower())


def _feedback_insights(df: pd.DataFrame, feedback_column: str | None) -> Dict[str, Any]:
    """Calculate feedback metrics from validated ratings only, never inventing data."""
    unavailable = {
        "available": False, "column": feedback_column, "total_responses": 0,
        "invalid_values": 0, "missing_values": 0, "distribution": [],
        "product_ratings": [], "trend": [], "insights": [],
    }
    if "Feedback" not in df.columns:
        return unavailable

    ratings = df.dropna(subset=["Feedback"]).copy()
    # A rating describes one transaction/customer response, not every product
    # line within its basket. Product-level ratings still use each product line.
    responses = ratings.drop_duplicates(subset=["TransactionID"])
    if responses.empty:
        unavailable.update({"available": True})
        return unavailable

    distribution = (
        responses["Feedback"].astype(int).value_counts().reindex(range(1, 6), fill_value=0)
    )
    average = float(responses["Feedback"].mean())
    positive = float((responses["Feedback"] >= 4).mean() * 100)
    negative = float((responses["Feedback"] <= 2).mean() * 100)
    modes = distribution[distribution == distribution.max()].index.tolist()
    mode = int(modes[0]) if modes else None

    sales = df.groupby("Product")["TransactionID"].nunique().rename("sales")
    product_stats = ratings.groupby("Product").agg(
        average_rating=("Feedback", "mean"), responses=("Feedback", "count")
    ).join(sales).reset_index().sort_values(["average_rating", "responses"], ascending=[False, False])
    product_records = [
        {
            "product": str(row.Product), "average_rating": round(float(row.average_rating), 2),
            "responses": int(row.responses), "sales": int(row.sales),
        }
        for row in product_stats.head(20).itertuples(index=False)
    ]

    trend = []
    if "Date" in responses.columns:
        dated = responses.copy()
        dated["_date"] = pd.to_datetime(dated["Date"], errors="coerce")
        dated = dated.dropna(subset=["_date"])
        if not dated.empty:
            daily = dated.groupby(dated["_date"].dt.date)["Feedback"].mean().sort_index()
            trend = [{"date": str(day), "average_rating": round(float(value), 2)} for day, value in daily.items()]

    satisfaction = "High customer satisfaction" if average >= 4 else "Moderate customer satisfaction" if average >= 3 else "Customer satisfaction needs attention"
    insights = [
        f"Average customer rating is {average:.2f}/5 across {len(responses):,} valid feedback responses: {satisfaction.lower()}.",
    ]
    if len(trend) >= 2:
        change = trend[-1]["average_rating"] - trend[0]["average_rating"]
        if change >= 0.15:
            insights.append(f"Customer satisfaction improved by {change:.2f} rating points from the first to the latest available date.")
        elif change <= -0.15:
            insights.append(f"Customer satisfaction declined by {abs(change):.2f} rating points from the first to the latest available date.")
        else:
            insights.append("Customer satisfaction is broadly stable across the available dates.")
    if not product_stats.empty:
        highest = product_stats.iloc[0]
        lowest = product_stats.sort_values(["average_rating", "responses"], ascending=[True, False]).iloc[0]
        insights.append(f"{highest['Product']} has the highest measured average rating ({highest['average_rating']:.2f}/5).")
        insights.append(f"{lowest['Product']} has the lowest measured average rating ({lowest['average_rating']:.2f}/5).")
        median_sales = product_stats["sales"].median()
        high_sales_poor = product_stats[(product_stats["sales"] >= median_sales) & (product_stats["average_rating"] < 3)]
        low_sales_excellent = product_stats[(product_stats["sales"] < median_sales) & (product_stats["average_rating"] >= 4.5)]
        if not high_sales_poor.empty:
            row = high_sales_poor.sort_values(["sales", "average_rating"], ascending=[False, True]).iloc[0]
            insights.append(f"{row['Product']} has strong sales ({int(row['sales']):,} transactions) but poor feedback ({row['average_rating']:.2f}/5), so it needs attention.")
        if not low_sales_excellent.empty:
            row = low_sales_excellent.sort_values(["average_rating", "sales"], ascending=[False, True]).iloc[0]
            insights.append(f"{row['Product']} has excellent feedback ({row['average_rating']:.2f}/5) despite lower sales ({int(row['sales']):,} transactions), making it a promotion opportunity.")

    return {
        "available": True, "column": feedback_column, "total_responses": int(len(responses)),
        "average_rating": round(average, 2), "highest_rating": int(responses["Feedback"].max()),
        "lowest_rating": int(responses["Feedback"].min()), "positive_percentage": round(positive, 2),
        "negative_percentage": round(negative, 2), "most_common_rating": mode,
        "satisfaction_level": satisfaction, "distribution": [
            {"rating": int(rating), "count": int(count)} for rating, count in distribution.items()
        ], "product_ratings": product_records, "trend": trend, "insights": insights,
        "highest_rated_product": str(product_stats.iloc[0]["Product"]) if not product_stats.empty else None,
        "lowest_rated_product": str(product_stats.sort_values(["average_rating", "responses"], ascending=[True, False]).iloc[0]["Product"]) if not product_stats.empty else None,
    }


def clean_and_build_baskets(raw_df: pd.DataFrame) -> Tuple[pd.DataFrame, List[List[str]], Dict[str, Any]]:
    original_rows = len(raw_df)
    raw = raw_df.copy()
    raw.columns = [str(c).strip() for c in raw.columns]
    fmt = _detect_format(raw)

    # High-level preprocessing diagnostics on the raw data.
    missing_total = int(raw.isna().sum().sum())
    duplicate_raw_rows = int(raw.duplicated().sum())
    duplicate_raw_df = raw.drop_duplicates().copy()

    col_map = {_column_key(c): c for c in duplicate_raw_df.columns}
    txn_col = col_map.get("transactionid")
    prod_col = col_map.get("product") or col_map.get("item")
    items_col = col_map.get("items") or col_map.get("basket") or col_map.get("products")
    date_col = col_map.get("date")
    cust_col = col_map.get("customerid")
    qty_col = col_map.get("quantity") or col_map.get("qty")
    feedback_col = col_map.get("feedback") or col_map.get("customerfeedback") or col_map.get("rating")

    invalid_quantity_rows = 0
    quantity_outliers_handled = 0
    if qty_col:
        q = pd.to_numeric(duplicate_raw_df[qty_col], errors="coerce")
        invalid_quantity_rows = int((q.isna() | (q <= 0)).sum())
        valid_q = q[q > 0].dropna()
        if len(valid_q) >= 10:
            q1, q3 = valid_q.quantile([0.25, 0.75])
            iqr = q3 - q1
            upper = q3 + 1.5 * iqr
            quantity_outliers_handled = int((valid_q > upper).sum())

    # ---------------- Build a clean long transaction table.
    if fmt == "long":
        if not txn_col or not prod_col:
            raise ValueError("Long format needs TransactionID and Product columns.")
        keep_cols = [txn_col, prod_col] + ([date_col] if date_col else []) + ([cust_col] if cust_col else []) + ([feedback_col] if feedback_col else [])
        df = duplicate_raw_df[keep_cols].copy()
        rename = {txn_col: "TransactionID", prod_col: "Product"}
        if date_col: rename[date_col] = "Date"
        if cust_col: rename[cust_col] = "CustomerID"
        if feedback_col: rename[feedback_col] = "Feedback"
        df = df.rename(columns=rename)

    elif fmt == "basket":
        if not txn_col or not items_col:
            raise ValueError("Basket format needs TransactionID and Items columns.")

        # Count missing basket cells before explode. Empty strings are treated as missing too.
        raw_items = duplicate_raw_df[items_col]
        missing_item_cells = int(raw_items.isna().sum() + raw_items.fillna("").astype(str).str.strip().eq("").sum() - raw_items.isna().sum())

        # Vectorized explode is dramatically faster than iterating 100k rows with iterrows().
        work_cols = [txn_col, items_col] + ([date_col] if date_col else []) + ([cust_col] if cust_col else []) + ([feedback_col] if feedback_col else [])
        tmp = duplicate_raw_df[work_cols].copy()
        tmp[items_col] = tmp[items_col].fillna("").astype(str).str.replace("|", ",", regex=False).str.replace(";", ",", regex=False)
        tmp[items_col] = tmp[items_col].str.split(",")
        tmp = tmp.explode(items_col, ignore_index=True)
        tmp[items_col] = tmp[items_col].astype(str).str.strip()
        tmp = tmp[tmp[items_col].ne("") & tmp[txn_col].notna()].copy()
        rename = {txn_col: "TransactionID", items_col: "Product"}
        if date_col: rename[date_col] = "Date"
        if cust_col: rename[cust_col] = "CustomerID"
        if feedback_col: rename[feedback_col] = "Feedback"
        df = tmp.rename(columns=rename)
        missing_before = int(missing_item_cells)

    else:
        # Legacy one-column basket support.
        candidate_col = items_col or next((c for c in duplicate_raw_df.columns if duplicate_raw_df[c].dtype == object), None)
        if candidate_col is None:
            raise ValueError("Could not detect a product/item column in the uploaded CSV.")
        rows = []
        for i, val in enumerate(duplicate_raw_df[candidate_col].astype(str)):
            for it in _split_items(val):
                rows.append({"TransactionID": f"T{i}", "Product": it})
        df = pd.DataFrame(rows)

    if df.empty:
        raise ValueError("No transaction items could be extracted from the uploaded CSV.")

    # Missing identifiers/products are removed before normalization.
    if fmt != "basket":
        missing_before = int(df["Product"].isna().sum() + df["TransactionID"].isna().sum())
    missing_before = int(missing_before + df["TransactionID"].isna().sum())
    df = df.dropna(subset=["TransactionID", "Product"]).copy()
    df["Product"] = _normalise_product(df["Product"])
    df["TransactionID"] = df["TransactionID"].astype(str).str.strip()
    df = df[(df["Product"] != "") & (df["TransactionID"] != "")].copy()

    invalid_feedback_values = 0
    missing_feedback_values = 0
    if "Feedback" in df.columns:
        feedback_numeric = pd.to_numeric(df["Feedback"], errors="coerce")
        valid_feedback = feedback_numeric.notna() & feedback_numeric.between(1, 5) & feedback_numeric.eq(feedback_numeric.round())
        invalid_feedback_values = int((df["Feedback"].notna() & ~valid_feedback).sum())
        missing_feedback_values = int(df["Feedback"].isna().sum())
        df["Feedback"] = feedback_numeric.where(valid_feedback)

    # Product normalization makes casing/spacing consistent.
    duplicates_removed = int(df.duplicated(subset=["TransactionID", "Product"]).sum())
    df = df.drop_duplicates(subset=["TransactionID", "Product"]).copy()

    feedback = _feedback_insights(df, feedback_col)
    feedback["invalid_values"] = invalid_feedback_values
    feedback["missing_values"] = missing_feedback_values

    # Remove transactions that cannot contribute to association rules.
    basket_sizes_before = df.groupby("TransactionID")["Product"].nunique()
    singleton_txns = basket_sizes_before[basket_sizes_before < 2].index
    single_item_txns_removed = len(singleton_txns)
    df = df[~df["TransactionID"].isin(singleton_txns)].copy()

    baskets_series = df.groupby("TransactionID")["Product"].apply(list)
    baskets = baskets_series.tolist()
    product_counts = df["Product"].value_counts()

    # Identifier handling / feature selection for association mining.
    identifier_columns = [c for c in raw.columns if str(c).strip().lower() in {
        "transactionid", "transaction_id", "customerid", "customer_id", "invoice", "order_id"
    }]
    selected_features = ["TransactionID", "Product"]
    if "Date" in df.columns:
        selected_features.append("Date")
    if "CustomerID" in df.columns:
        selected_features.append("CustomerID")

    date_range = _date_range(df) if "Date" in df.columns else None
    customers = int(df["CustomerID"].nunique()) if "CustomerID" in df.columns else None
    valid_sizes = df.groupby("TransactionID")["Product"].nunique()

    summary = {
        "original_rows": int(original_rows),
        "cleaned_rows": int(len(df)),
        "missing_values_found": int(missing_total),
        "missing_values_removed": int(missing_before),
        "duplicate_rows_found": int(duplicate_raw_rows),
        "duplicate_rows_removed": int(duplicate_raw_rows),
        "duplicate_line_items_removed": int(duplicates_removed),
        "invalid_quantity_rows": int(invalid_quantity_rows),
        "quantity_outliers_handled": int(quantity_outliers_handled),
        "single_item_transactions_removed": int(single_item_txns_removed),
        "num_transactions": int(len(baskets)),
        "num_unique_products": int(df["Product"].nunique()),
        "avg_basket_size": round(float(valid_sizes.mean()) if len(valid_sizes) else 0, 2),
        "min_basket_size": int(valid_sizes.min()) if len(valid_sizes) else 0,
        "max_basket_size": int(valid_sizes.max()) if len(valid_sizes) else 0,
        "date_range": date_range,
        "num_customers": customers,
        "identifier_columns_removed": identifier_columns,
        "identifier_columns_handled": identifier_columns,
        "categorical_encoding": "Transaction items converted to a one-hot basket matrix during mining (TransactionEncoder).",
        "feature_selection": "TransactionID/CustomerID are excluded from the mining feature matrix; Product/Items are selected as the association-mining features.",
        "outlier_handling": "Invalid/non-positive quantities are flagged; quantity IQR outliers are reported. Quantity is not used as an association feature.",
        "class_distribution": "Not applicable — association rule mining is unsupervised and has no target class.",
        "normalization": "Product names standardized for whitespace, casing and duplicate item labels.",
        "top_products": [{"product": p, "count": int(c)} for p, c in product_counts.head(15).items()],
        "feedback": feedback,
    }
    return df, baskets, summary


def _date_range(df: pd.DataFrame):
    try:
        dates = pd.to_datetime(df["Date"], errors="coerce").dropna()
        if len(dates) == 0:
            return None
        return {"start": str(dates.min().date()), "end": str(dates.max().date())}
    except Exception:
        return None


def dataset_preview(raw_df: pd.DataFrame, n: int = 10) -> Dict[str, Any]:
    preview_df = raw_df.head(n).copy()
    preview_df = preview_df.astype(object).where(pd.notnull(preview_df), None)
    return {"columns": list(raw_df.columns), "rows": preview_df.to_dict(orient="records"), "total_rows": int(len(raw_df))}
