"""
Feedback-aware retail recommendations.

Association metrics (support, confidence and lift) identify co-purchase strength,
while customer feedback determines whether a recommendation should promote,
cross-sell, bundle, or first address a customer-satisfaction problem.
"""
from typing import List, Dict, Any, Optional
import pandas as pd


def _feedback_profile(cleaned_df: Optional[pd.DataFrame]) -> Dict[str, Any]:
    """Build product and transaction-level feedback statistics from the actual dataset."""
    if cleaned_df is None or "Feedback" not in cleaned_df.columns or "Product" not in cleaned_df.columns:
        return {"available": False, "products": {}, "overall": None, "transactions": {}}

    work = cleaned_df.copy()
    work["Feedback"] = pd.to_numeric(work["Feedback"], errors="coerce")
    work = work[work["Feedback"].between(1, 5)].copy()
    if work.empty:
        return {"available": False, "products": {}, "overall": None, "transactions": {}}

    # One rating is associated with one transaction/customer response. The source
    # CSV repeats the transaction rating on every product line, so deduplicate it
    # before calculating overall and rule-level feedback.
    txn_feedback = work.groupby("TransactionID")["Feedback"].first()
    stats = work.groupby("Product")["Feedback"].agg(["mean", "count"]).to_dict("index")
    products = {
        str(product): {"average": float(v["mean"]), "responses": int(v["count"])}
        for product, v in stats.items()
    }

    transaction_products = work.groupby("TransactionID")["Product"].apply(lambda s: frozenset(s.astype(str))).to_dict()
    return {
        "available": True,
        "products": products,
        "overall": float(txn_feedback.mean()) if len(txn_feedback) else None,
        "responses": int(len(txn_feedback)),
        "transaction_feedback": txn_feedback.to_dict(),
        "transaction_products": transaction_products,
    }


def _items_rating(items: List[str], profile: Dict[str, Any]):
    if not profile.get("available"):
        return None, 0
    values = []
    for item in items:
        info = profile.get("products", {}).get(str(item))
        if info and info.get("responses", 0) > 0:
            values.append(float(info["average"]))
    return (sum(values) / len(values), len(values)) if values else (None, 0)


def _rule_feedback(antecedents: List[str], consequents: List[str], profile: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate feedback for transactions containing the complete A ∪ B rule."""
    if not profile.get("available"):
        return {"available": False, "average": None, "negative_rate": None, "responses": 0, "positive_rate": None}

    required = frozenset(map(str, list(antecedents) + list(consequents)))
    txn_products = profile.get("transaction_products", {})
    txn_feedback = profile.get("transaction_feedback", {})
    ratings = [
        float(txn_feedback[txn_id])
        for txn_id, items in txn_products.items()
        if required.issubset(items) and txn_id in txn_feedback
    ]
    if not ratings:
        return {"available": True, "average": None, "negative_rate": None, "responses": 0, "positive_rate": None}

    negative_rate = sum(r <= 2 for r in ratings) / len(ratings)
    positive_rate = sum(r >= 4 for r in ratings) / len(ratings)
    return {
        "available": True,
        "average": sum(ratings) / len(ratings),
        "negative_rate": negative_rate,
        "positive_rate": positive_rate,
        "responses": len(ratings),
    }


def _feedback_signal(ante_rating, cons_rating, overall_rating, negative_rate=None):
    """Return a business-friendly interpretation of the feedback signal."""
    if negative_rate is not None and negative_rate >= 0.20:
        return "Negative customer feedback on this rule"
    if cons_rating is not None and cons_rating < 3:
        return "Poor customer feedback on recommended product"
    if cons_rating is not None and cons_rating >= 4.5:
        return "Excellent customer feedback on recommended product"
    if ante_rating is not None and ante_rating < 3:
        return "Low feedback on products already being purchased"
    if overall_rating is not None and overall_rating < 3:
        return "Overall customer satisfaction needs attention"
    if cons_rating is not None and cons_rating >= 4:
        return "Positive customer feedback"
    if cons_rating is not None:
        return "Neutral customer feedback"
    return "Feedback unavailable for these products"


def _strategy_for(antecedents: List[str], consequents: List[str], support: float,
                   confidence: float, lift: float, ante_rating=None, cons_rating=None,
                   overall_rating=None, feedback_available=False, combined_feedback=None,
                   negative_rate=None) -> Dict[str, Any]:
    ante_str = " + ".join(antecedents)
    cons_str = " + ".join(consequents)

    # Negative feedback is a penalty, not a replacement for the standard
    # association metrics. This keeps Apriori/FP-Growth/FP-Max mathematically
    # standard while making the business recommendation feedback-aware.
    if feedback_available and negative_rate is not None:
        adjusted_confidence = confidence * (1 - negative_rate)
    else:
        adjusted_confidence = confidence

    feedback_signal = _feedback_signal(ante_rating, cons_rating, overall_rating, negative_rate)
    feedback_text = (
        f"Combined rule feedback is {combined_feedback:.2f}/5"
        if combined_feedback is not None else "Rule-level feedback is unavailable"
    )
    negative_text = (
        f"{negative_rate * 100:.1f}% of rule-level feedback is negative"
        if negative_rate is not None else "negative-feedback rate unavailable"
    )

    # Feedback now affects the decision thresholds. A strong association cannot
    # automatically trigger aggressive promotion when customer satisfaction is poor.
    if feedback_available and (negative_rate is not None and negative_rate >= 0.20 or cons_rating is not None and cons_rating < 3):
        primary = "Targeted coupon"
        action = (
            f"Use only a targeted, test-based offer for {cons_str} when customers buy {ante_str}; do not use a broad bundle promotion yet. "
            f"{feedback_text} and {negative_text}. Standard confidence is {confidence*100:.1f}%, but feedback-adjusted confidence is "
            f"{adjusted_confidence*100:.1f}%, so review product/customer experience before increasing exposure."
        )
    elif feedback_available and cons_rating is not None and cons_rating >= 4 and adjusted_confidence >= 0.50 and lift >= 2:
        primary = "Bundle offer"
        action = (
            f"Create a bundle of {ante_str} with {cons_str}. {feedback_text}; {negative_text}. "
            f"The rule has {confidence*100:.1f}% standard confidence, {adjusted_confidence*100:.1f}% feedback-adjusted confidence and {lift:.2f}x lift, "
            "so strong co-purchase behavior is supported by positive customer feedback."
        )
    elif lift >= 3 and adjusted_confidence >= 0.50:
        primary = "Bundle offer"
        action = (
            f"Create a discounted combo of {ante_str} with {cons_str}. {feedback_text}; {negative_text}. "
            f"The rule has {confidence*100:.1f}% standard confidence and {adjusted_confidence*100:.1f}% feedback-adjusted confidence, "
            f"with {lift:.2f}x lift, indicating a strong opportunity while keeping customer sentiment in view."
        )
    elif lift >= 2 and adjusted_confidence >= 0.35:
        primary = "Cross-sell placement"
        action = (
            f"Place {cons_str} near {ante_str}, or prompt it at checkout/online cart. {feedback_text}; {negative_text}. "
            f"The rule's {lift:.2f}x lift and {adjusted_confidence*100:.1f}% feedback-adjusted confidence support a measured cross-sell test."
        )
    elif confidence >= 0.4:
        primary = "Targeted coupon"
        action = (
            f"Issue a targeted coupon for {cons_str} when a customer buys {ante_str}. {feedback_text}; {negative_text}. "
            f"Use the {adjusted_confidence*100:.1f}% feedback-adjusted confidence alongside the {confidence*100:.1f}% standard confidence and {lift:.2f}x lift."
        )
    else:
        primary = "Shelf optimization"
        action = (
            f"Test adjacent shelf placement for {ante_str} and {cons_str}. {feedback_text}; {negative_text}. "
            f"The association is present but modest, so validate the placement while monitoring customer feedback."
        )

    if support < 0.02:
        confidence_note = "Low support — niche pattern; suitable for targeted testing."
    elif support < 0.06:
        confidence_note = "Moderate support — a solid candidate for regional or seasonal promotion."
    else:
        confidence_note = "High support — this pattern touches a large share of baskets."

    interpretation = (
        f"Customers who buy {ante_str} purchase {cons_str} {confidence*100:.1f}% of the time — "
        f"{lift:.2f}x more often than random chance. {confidence_note} {feedback_text}. "
        f"Negative feedback is {negative_text}; the resulting feedback-adjusted confidence is {adjusted_confidence*100:.1f}%. "
        f"Customer-feedback signal: {feedback_signal}."
    )
    return {
        "strategy_type": primary,
        "action": action,
        "interpretation": interpretation,
        "feedback_signal": feedback_signal,
        "adjusted_confidence": adjusted_confidence,
        "combined_feedback": combined_feedback,
        "negative_feedback_rate": negative_rate,
    }


def generate_recommendations(rules_records: List[Dict[str, Any]], top_k: int = 40,
                             cleaned_df: Optional[pd.DataFrame] = None) -> List[Dict[str, Any]]:
    """Generate marketing actions using association metrics plus customer feedback."""
    candidates = [r for r in rules_records if r["lift"] > 1.0 and r["confidence"] >= 0.25]
    profile = _feedback_profile(cleaned_df)
    overall_rating = profile.get("overall")
    feedback_available = bool(profile.get("available"))

    enriched = []
    for r in candidates:
        ante_rating, ante_count = _items_rating(r["antecedents"], profile)
        cons_rating, cons_count = _items_rating(r["consequents"], profile)
        rule_fb = _rule_feedback(r["antecedents"], r["consequents"], profile)
        combined_feedback = rule_fb.get("average")
        negative_rate = rule_fb.get("negative_rate")
        adjusted_confidence = (
            r["confidence"] * (1 - negative_rate)
            if feedback_available and negative_rate is not None else r["confidence"]
        )
        strat = _strategy_for(
            r["antecedents"], r["consequents"], r["support"], r["confidence"], r["lift"],
            ante_rating, cons_rating, overall_rating, feedback_available,
            combined_feedback, negative_rate
        )
        enriched.append((adjusted_confidence * r["lift"], r, ante_rating, cons_rating, ante_count, cons_count, rule_fb, strat))

    # Rank recommendations using the feedback-adjusted confidence when feedback
    # exists. This means a rule with high lift cannot dominate solely because of
    # purchase history if customers strongly dislike the combined recommendation.
    enriched.sort(key=lambda x: (x[0], x[1]["lift"] * x[1]["confidence"]), reverse=True)
    recs = []
    for _, r, ante_rating, cons_rating, ante_count, cons_count, rule_fb, strat in enriched[:top_k]:
        recs.append({
            "rule_id": r["id"], "antecedents": r["antecedents"], "consequents": r["consequents"],
            "support": r["support"], "confidence": r["confidence"], "lift": r["lift"],
            "adjusted_confidence": round(float(strat["adjusted_confidence"]), 6),
            "strategy_type": strat["strategy_type"], "interpretation": strat["interpretation"],
            "suggested_action": strat["action"], "feedback_available": feedback_available,
            "antecedent_feedback": round(ante_rating, 2) if ante_rating is not None else None,
            "consequent_feedback": round(cons_rating, 2) if cons_rating is not None else None,
            "combined_feedback": round(rule_fb["average"], 2) if rule_fb.get("average") is not None else None,
            "negative_feedback_rate": round(rule_fb["negative_rate"], 6) if rule_fb.get("negative_rate") is not None else None,
            "positive_feedback_rate": round(rule_fb["positive_rate"], 6) if rule_fb.get("positive_rate") is not None else None,
            "feedback_signal": strat["feedback_signal"],
            "feedback_responses_rule": int(rule_fb.get("responses", 0)),
            "feedback_responses_antecedent": ante_count,
            "feedback_responses_consequent": cons_count,
        })
    return recs
