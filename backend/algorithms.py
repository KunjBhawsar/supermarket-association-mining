"""
Mining engine: wraps mlxtend's Apriori / FP-Growth / FP-Max implementations,
times each run, and computes the full association-rule metric set
(support, confidence, lift, leverage, conviction).
Nothing here is hardcoded — every number is computed from whatever
transaction data is currently loaded.
"""
import time
from typing import List, Dict, Any

import pandas as pd
from mlxtend.frequent_patterns import apriori, fpgrowth, fpmax, association_rules
from mlxtend.preprocessing import TransactionEncoder

ALGORITHMS = {"apriori": apriori, "fpgrowth": fpgrowth, "fpmax": fpmax}


def encode_transactions(baskets: List[List[str]]) -> pd.DataFrame:
    te = TransactionEncoder()
    te_ary = te.fit(baskets).transform(baskets)
    return pd.DataFrame(te_ary, columns=te.columns_)


def run_mining(encoded_df: pd.DataFrame, algorithm: str, min_support: float) -> Dict[str, Any]:
    if algorithm not in ALGORITHMS:
        raise ValueError(f"Unknown algorithm '{algorithm}'")
    if not 0 < min_support <= 1:
        raise ValueError("min_support must be greater than 0 and at most 1.")
    if encoded_df.empty:
        raise ValueError("The encoded transaction dataset is empty.")
    func = ALGORITHMS[algorithm]

    start = time.perf_counter()
    if algorithm == "fpmax":
        itemsets = func(encoded_df, min_support=min_support, use_colnames=True)
    else:
        itemsets = func(encoded_df, min_support=min_support, use_colnames=True)
    elapsed_ms = (time.perf_counter() - start) * 1000

    itemsets = itemsets.copy()
    itemsets["length"] = itemsets["itemsets"].apply(lambda x: len(x))
    itemsets = itemsets.sort_values("support", ascending=False).reset_index(drop=True)

    return {
        "algorithm": algorithm,
        "execution_time_ms": round(elapsed_ms, 4),
        "num_itemsets": int(len(itemsets)),
        "itemsets_df": itemsets,
        "max_itemset_length": int(itemsets["length"].max()) if len(itemsets) else 0,
    }


def itemsets_to_records(itemsets_df: pd.DataFrame) -> List[Dict[str, Any]]:
    records = []
    for _, row in itemsets_df.iterrows():
        records.append({
            "items": sorted(list(row["itemsets"])),
            "support": round(float(row["support"]), 6),
            "length": int(row["length"]),
        })
    return records


def compute_rules(itemsets_df: pd.DataFrame, min_confidence: float, min_lift: float = 0.0) -> pd.DataFrame:
    if not 0 <= min_confidence <= 1:
        raise ValueError("min_confidence must be between 0 and 1.")
    if min_lift < 0:
        raise ValueError("min_lift cannot be negative.")
    if len(itemsets_df) == 0:
        return pd.DataFrame()
    # fpmax only returns maximal itemsets (no proper subset relations among them),
    # so classic rule generation over that set yields few/no rules; that's an
    # expected, real algorithmic difference we surface to the user rather than hide.
    try:
        rules = association_rules(itemsets_df, metric="confidence", min_threshold=min_confidence, num_itemsets=len(itemsets_df))
    except TypeError:
        rules = association_rules(itemsets_df, metric="confidence", min_threshold=min_confidence)
    except KeyError:
        # Happens for itemset sets (e.g. FP-Max's maximal-only output) that don't contain
        # every subset needed to look up antecedent/consequent support — no rules derivable.
        return pd.DataFrame()
    if len(rules) == 0:
        return rules
    rules = rules[rules["lift"] >= min_lift].copy()
    rules = rules.sort_values(["lift", "confidence"], ascending=False).reset_index(drop=True)
    return rules


def rules_to_records(rules_df: pd.DataFrame) -> List[Dict[str, Any]]:
    records = []
    for idx, row in rules_df.iterrows():
        conviction = row["conviction"]
        if conviction == float("inf"):
            conviction_val = None  # JSON-safe; frontend renders as "∞"
        else:
            conviction_val = round(float(conviction), 4)
        records.append({
            "id": int(idx),
            "antecedents": sorted(list(row["antecedents"])),
            "consequents": sorted(list(row["consequents"])),
            "antecedent_support": round(float(row["antecedent support"]), 6),
            "consequent_support": round(float(row["consequent support"]), 6),
            "support": round(float(row["support"]), 6),
            "confidence": round(float(row["confidence"]), 6),
            "lift": round(float(row["lift"]), 6),
            "leverage": round(float(row["leverage"]), 6),
            "conviction": conviction_val,
            "zhangs_metric": round(float(row.get("zhangs_metric", 0)), 6) if "zhangs_metric" in row else None,
        })
    return records
