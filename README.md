# PersonaVerse — Customer Segmentation & Persona Intelligence Platform

Find natural customer groups with unsupervised learning, explore them in an interactive 3D space, and give every segment an LLM-written persona grounded in that segment's real statistics — plus evidence-backed marketing recommendations and exportable reports. No sign-up; open it and start.

**Stack:** FastAPI · scikit-learn · pandas · React 19 + TypeScript (Vite) · Three.js (@react-three/fiber) · Gemini or any OpenAI-compatible LLM.

---

## Architecture — a Customer Intelligence Workspace

The app is a pipeline of seven modules. Each is a separate backend service and a separate workspace screen, connected only through the API:

```
Data Workspace → Customer Profiling → Feature Engineering Lab → Segmentation Engine
      (A)               (B)                    (C)                      (D)
                                                                         │
            Segment Strategy & Insights ← Persona Intelligence Studio ← 3D Cluster Explorer
                       (G)                          (F)                        (E)
```

| Module | Backend service | API | Screen |
|---|---|---|---|
| A Data Workspace | `services/ingestion.py` — safe CSV parsing, delimiter/encoding sniffing, PII-column removal, transaction → RFM aggregation, derived features | `POST /api/datasets/sample`, `POST /api/datasets/upload`, `GET/DELETE /api/datasets/{id}` | `/app/data` |
| B Profiling | `services/profiling.py` — type detection, missing/duplicates/outliers, histograms, behaviour metrics, RFM | `GET /api/datasets/{id}/profile` | `/app/profile` |
| C Feature Lab | `services/features.py` — explainable recommendations, correlation pruning, sklearn pipeline (impute → winsorise → scale / one-hot) | `GET /api/datasets/{id}/features` | `/app/features` |
| D Segmentation Engine | `services/clustering.py` — K-Means, Agglomerative (Ward), DBSCAN; elbow, silhouette, Davies-Bouldin, Calinski-Harabasz, size balance, noise share, stability (ARI) | `POST /api/analyses`, `GET /api/analyses/{id}`, `POST /api/analyses/{id}/assign` | `/app/segmentation` |
| E 3D Explorer | `services/reduction.py` — PCA projection + stratified sampling | `GET /api/analyses/{id}/visualization` | `/app/explorer` |
| F Persona Studio | `services/persona.py` — aggregate-only summary, structured JSON prompt, pydantic validation, retry, grounding check, cache | `POST /api/analyses/{id}/segments/{sid}/persona`, `GET …/persona/summary` | `/app/personas` |
| G Strategy & Insights | `services/intelligence.py` — segment stats, z-scores, rankings, rule-based recommendations with evidence; `services/reports.py` | `GET /api/analyses/{id}/segments`, `/reports/*` | `/app/insights`, `/app/reports` |

`services/analysis.py` orchestrates one run (preprocess → compare → fit → project → describe). Interactive API docs: `http://localhost:8000/docs`.

## Folder structure

```
personaverse/
├── data/                         real sample dataset + README (source, licence, checks)
├── backend/
│   ├── app/
│   │   ├── main.py               FastAPI app, CORS, logging, error handlers
│   │   ├── config.py             environment settings
│   │   ├── schemas.py            request models
│   │   ├── api/                  datasets.py, analyses.py, deps.py
│   │   ├── core/                 store.py (in-memory sessions with TTL), ratelimit.py
│   │   └── services/             ingestion, profiling, features, semantics, clustering,
│   │                             reduction, intelligence, persona, analysis, reports
│   ├── tests/                    34 pytest tests
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/                Landing + 9 workspace screens
│   │   ├── components/           ClusterScene (3D), HeroScene, charts, ui
│   │   ├── state/Workspace.tsx   shared analysis state + session restore
│   │   ├── lib/                  api client, types, formatting/colours
│   │   └── test/                 11 vitest tests
│   ├── vercel.json
│   └── .env.example
└── render.yaml                   backend deployment blueprint
```

## Dataset

**Customer Personality Analysis (iFood)** — 2,240 real customers, 29 columns (income, household, spend in six product categories, purchases by channel, web visits, recency, campaign responses). Source, licence notes, checks and limitations: [`data/README.md`](data/README.md).

Your own CSVs work too: customer-level files are used directly; transaction files (customer ID + date + amount, or quantity × price) are aggregated to Recency, Frequency, Monetary, average order value and tenure. Columns that look like names, emails, phones or addresses are dropped on upload.

## How the ML works

**Preprocessing (same fitted pipeline at fit and assignment time):** median / most-frequent imputation → capping at the 1st/99th percentile (learned) → standard scaling; categories one-hot encoded with values under 2% grouped as "infrequent". IDs, constants, raw dates and text are never clustered.

**Derived features (sample data):** Age, Total_Spend, Total_Purchases, Deal_Share, Web_Share, Avg_Spend_Per_Purchase, Children, Campaigns_Accepted, Tenure_Days.

**Default features (sample data):** Total_Spend, Total_Purchases, Recency, Income, Age, Children, Deal_Share, Web_Share — chosen by role priority with any pair correlated above 0.85 removed (e.g. MntWines 0.89 with Total_Spend). Users can change them.

**Model comparison:** K-Means and Agglomerative (Ward) for k = 2…10, DBSCAN at four eps values from the k-distance curve. A configuration is valid if every segment holds ≥ 3% of customers, there are ≤ 8 segments and ≤ 25% noise. Valid ones are ranked on silhouette (40%), Davies-Bouldin (30%), Calinski-Harabasz (15%), K-Means stability (10%) and elbow agreement (5%). If two segments win, a richer solution is preferred only when it keeps ≥ 70% of the best silhouette and is stable — and the UI says so.

**Actual results on the sample data (8 default features):**

| Model | Segments | Silhouette | Davies-Bouldin | Calinski-Harabasz | Stability (ARI) |
|---|---|---|---|---|---|
| **K-Means k=3 (selected)** | 3 (42% / 37% / 21%) | 0.233 | 1.705 | 833 | 0.947 |
| K-Means k=2 | 2 | 0.314 | 1.280 | 1,242 | 0.996 |
| K-Means k=4 (elbow) | 4 | 0.191 | 1.749 | 712 | 0.973 |
| Agglomerative k=3 | 3 | 0.178 | 1.757 | 709 | — |
| DBSCAN (all eps tried) | 1 or 4 with a 1.6% group | — | — | — | — (rejected) |

DBSCAN found no density gaps (customers form one continuous cloud), which is reported rather than hidden. The three segments: high spenders with low discount use; lower-income, low-spend browsers; and larger families who rely on deals.

**New customers:** K-Means predicts directly; Agglomerative uses the nearest segment centroid and DBSCAN the nearest core point within eps — both approximations are explained in the UI.

**3D view:** PCA to 3 components (72% of variance on the sample). Visualisation only — clustering uses all features. UMAP was not used (heavy dependency, harder-to-explain distances).

## LLM personas

- Provider: **Gemini** (`GEMINI_API_KEY`, default model `gemini-2.5-flash`) or any **OpenAI-compatible** API (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`).
- Input: only the segment's aggregate summary — size, share, per-feature segment vs overall averages and standardised differences, category shares, product-spend shares. No rows, IDs or personal columns. The exact payload is viewable in the UI ("View exact AI input").
- Output: strict JSON (15 sections incl. name, overview, characteristics, behaviour, needs, motivations, pain points, product interests, marketing approach, tone, offers, evidence), validated with pydantic. Every list item is labelled **observed** or **hypothesis**; motivations, needs and pain points are forced to hypothesis. Evidence items citing features not in the input are dropped. Invalid output → one retry with the error, then a clear error.
- Personas are cached per analysis and segment; **Regenerate** bypasses the cache.
- Without a key, the app still shows all statistics and recommendations, and says clearly that no AI persona exists — template text is never labelled as AI.

## Running locally

```bash
# backend
cd backend
pip install -r requirements.txt
cp .env.example .env          # add GEMINI_API_KEY to enable personas
uvicorn app.main:app --reload --port 8000

# frontend (new terminal)
cd frontend
npm install
cp .env.example .env.local    # VITE_API_URL=http://localhost:8000
npm run dev                   # http://localhost:5173
```

## Tests (executed)

```bash
cd backend && python -m pytest -q     # 34 passed
cd frontend && npm test               # 11 passed
cd frontend && npm run build          # type-check + production build
```

Backend tests cover loading the real file, derived features, invalid files, PII removal, transaction→RFM, profiling, feature recommendation, pipeline reuse, metrics on known blobs, DBSCAN noise handling, reproducibility, assignment consistency, model-selection constraints, PCA, stratified sampling, recommendation evidence, aggregate-only LLM payload, missing key, valid/invalid/retried LLM output, provider timeout, caching, and every API endpoint including errors.

A browser end-to-end run (headless Chrome) was also executed: sample load → profile → feature lab → segmentation → assign a new customer → 3D explorer (hover tooltip verified) → 2D view → personas → insights → overview → CSV and Markdown downloads → mobile layout (no horizontal scroll at 390 px). The persona screen was checked with a test-only stub LLM because no real API key was available in the build environment.

## Deployment

The backend needs scikit-learn, pandas and numpy (≈ 250 MB installed) and runs clustering for several seconds — too heavy and long for Vercel serverless functions. So:

1. **Backend → Render** (free plan): New → Blueprint → this repo (uses `render.yaml`). Set `GEMINI_API_KEY` and `ALLOWED_ORIGINS` (your Vercel URL). Health check: `/api/health`.
2. **Frontend → Vercel**: import the repo, root directory `frontend`, framework Vite, env `VITE_API_URL=https://<your-render-service>.onrender.com`, optional `VITE_AUTHOR_NAME`.

Free Render services sleep after inactivity; the first request can take ~1 minute (the UI explains this).

## Data retention and privacy

- Uploaded data and results live only in server memory, expire after `SESSION_TTL_MINUTES` (default 120) of inactivity, and are never written to disk or a database. **Reset analysis** deletes them immediately. A server restart clears everything.
- Personal-looking columns are dropped on upload; identifiers are never clustered and never sent to the LLM.
- File type, size (20 MB), row count and binary content are validated; uploads are parsed, never executed. Per-client rate limits protect upload, analysis and persona endpoints. API keys stay server-side.

## Limitations

- Sessions are in memory: they do not survive a restart and are not shared between multiple server instances.
- Agglomerative clustering is fitted on up to 6,000 customers and DBSCAN on up to 15,000; the rest are assigned to the nearest segment/core point.
- Silhouette scores around 0.2–0.3 mean segments overlap — normal for real customers, but boundary customers may behave like a neighbouring segment.
- Personas are interpretations of averages, not descriptions of real individuals.
