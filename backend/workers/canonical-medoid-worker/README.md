# Canonical Medoid Worker

Chooses a representative medoid for each coherent canonical cluster and snapshots
the membership monthly.

Modes:

- `initiation`: bootstrap medoids from scratch using current cluster scores.
- `perturbation`: bias toward the previous medoid and only switch when a new
  candidate beats it by the configured stability delta.

Primary entry points:

- `backend/orchestrators/canonical-medoid-pipeline/pipeline.ts`
- `backend/orchestrators/canonical-medoid-pipeline/runner.ts`
