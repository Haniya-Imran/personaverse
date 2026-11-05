# Sample dataset

**File:** `customer_personality_ifood.csv` (2,240 rows × 29 columns, comma-separated)
**SHA-256:** `0aafe07cf235ffe67f0e69e264bdd2cef38aa562fb0ec89d9c22c02d8336d60c`

## Source
- Downloaded from the original iFood business-analyst case repository:
  https://raw.githubusercontent.com/nailson/ifood-data-business-analyst-test/master/ml_project1_data.csv
- The same data is widely republished on Kaggle as **"Customer Personality Analysis"** (imakash3011).

## Licence / usage
- The Kaggle listing is commonly cited as **CC0 (public domain)**; this could not be verified from inside the build environment.
- The original GitHub repository has **no licence file**.
- Treat it as public demonstration data. Check the licence yourself before any commercial use.

## Columns
| Group | Columns |
|---|---|
| Identifier | `ID` (never used for clustering) |
| Demographics | `Year_Birth`, `Education`, `Marital_Status`, `Income`, `Kidhome`, `Teenhome` |
| Relationship | `Dt_Customer` (join date), `Recency` (days since last purchase) |
| Spend (last 2 years) | `MntWines`, `MntFruits`, `MntMeatProducts`, `MntFishProducts`, `MntSweetProducts`, `MntGoldProds` |
| Purchases by channel | `NumDealsPurchases`, `NumWebPurchases`, `NumCatalogPurchases`, `NumStorePurchases`, `NumWebVisitsMonth` |
| Campaigns | `AcceptedCmp1`–`AcceptedCmp5`, `Response`, `Complain` |
| Constants | `Z_CostContact`, `Z_Revenue` (same value for everyone — ignored) |

## Checks performed (by the app, on every load)
- 0 exact duplicate rows; 182 customers identical to another apart from `ID` (kept — different people can look the same).
- 24 missing `Income` values → median imputation.
- 3 implausible birth years (1893–1900) → age set to missing and imputed.
- One extreme income (666,666) and spend outliers → capped at the 1st/99th percentile before clustering.
- Rare marital categories (`Alone`, `Absurd`, `YOLO`) → grouped as "infrequent" if that column is used.

## Limitations
- One retailer, one market, 2012–2014 — patterns may not transfer to other businesses.
- Spend is aggregated per customer; there are no individual transactions, so RFM is computed from customer-level aggregates.
- Demographic fields are self-reported and contain a few obvious data-entry errors.
