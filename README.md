# DWM — Supermarket Association Rule Mining

## One-click Windows run

Use **only `RUN_PROJECT.bat`** for normal use.

### First run
Double-click:

`RUN_PROJECT.bat`

The first run creates the Python virtual environment and installs the backend/frontend dependencies. This can take several minutes because packages such as pandas, scipy, scikit-learn, mlxtend and matplotlib are large.

### Every later run
Double-click the **same `RUN_PROJECT.bat` in the same extracted project folder**.

It checks the existing environment and skips `pip install` and `npm install` when everything is already available. It also avoids starting duplicate servers when ports 8000/5173 are already in use.

**Important:** Do not delete `backend\venv` or `frontend\node_modules`, and do not extract a fresh ZIP over a new folder before every run. Those folders contain the installed dependencies.

## URLs

- Frontend: http://127.0.0.1:5173
- Backend: http://127.0.0.1:8000
- API docs: http://127.0.0.1:8000/docs

## Main workflow

Upload Dataset → Preprocess → Mine (Apriori / FP-Growth / FP-Max) → Marketing Insights → Business Report (Excel)

The Business Report includes the current export data, readable business insights, frequent itemsets, association rules, marketing recommendations and Excel visualizations.

## Saved datasets

Every uploaded or selected sample dataset is saved locally by the backend. The Upload page has a **Saved datasets** list, so you can reopen an earlier dataset after loading a different one or after restarting the project. Opening a saved dataset keeps the other saved files intact; preprocess it again before running mining so the current analysis reflects that dataset.

## Customer feedback (optional)

CSV files may include a `Feedback`, `Customer Feedback`, or `Rating` column containing whole-number ratings from 1 to 5. When present, BasketLens validates the ratings and adds customer-feedback KPIs, insights, charts, and a Customer Feedback sheet in the Excel Business Report. Files without a feedback column continue to use the normal mining workflow.


## Included 100,000-row preprocessing dataset

`data/supermarket_100000_unclean.csv` contains exactly 100,000 supermarket transaction records with intentionally unclean values for demonstrating preprocessing: missing basket values, duplicate records, inconsistent product casing/spacing, invalid quantities, quantity outliers, missing customer IDs and a few invalid dates.

The preprocessing dashboard reports missing values, duplicates, normalization, quantity/outlier diagnostics, identifier handling, one-hot encoding, feature selection and class-distribution status. Association mining is unsupervised, so class distribution is reported as not applicable.

## Faster Business Report export

The Excel business report now uses XlsxWriter instead of cell-by-cell openpyxl generation. The full current cleaned export data is streamed into the workbook, while the report keeps the readable narrative, charts, top rules, itemsets and marketing actions. The generated report is cached for repeated downloads during the same session.
### Feedback-aware marketing logic

When the uploaded dataset contains a valid `Feedback` rating from 1 to 5, marketing recommendations use customer feedback as a decision layer in addition to Support, Confidence and Lift. Standard association-rule Confidence is preserved. For each rule `A → B`, the app calculates rule-level feedback from transactions containing `A ∪ B`, treats ratings 1–2 as negative feedback, and calculates:

`Feedback-Adjusted Confidence = Standard Confidence × (1 − Negative Feedback Rate)`

The adjusted confidence is used when ranking/selecting business actions. Recommended actions also mention the rule feedback, negative-feedback rate and adjusted confidence. Poor customer feedback can demote a strong association to a cautious targeted offer instead of a broad bundle promotion.

Feedback interpretation used by the marketing layer:
- **4.0–5.0/5**: positive customer feedback
- **3.0–3.99/5**: neutral customer feedback
- **below 3.0/5**: poor customer feedback
- **20% or more negative rule-level feedback**: negative feedback signal and promotion is handled cautiously
