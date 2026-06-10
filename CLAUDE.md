# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

- **Runtime**: Node.js (use NVM v20.19.0 — see root CLAUDE.md)
- **Package manager**: Yarn 4 (`yarn`, not `npm`)
- **Framework**: `@coko/server` (Express + Apollo GraphQL + Objection.js ORM + pgvector)
- **Database**: PostgreSQL with pgvector extension
- **File storage**: MinIO (S3-compatible)
- **Embeddings**: OpenAI (`text-embedding-3-small`, 1536-dim by default)
- **Tests**: Jest

## Commands

```bash
# Start full stack (recommended)
docker compose up --build

# Run tests (inside Docker)
yarn test:server   # from root — runs docker compose run --rm server yarn test

# Run a single test file (inside Docker)
docker compose run --rm server yarn jest --verbose packages/server/<path>/__tests__/<file>.test.js

# Lint
yarn cz   # from root — runs lint-staged + commitizen
```

The server is at `localhost:3000`. GraphQL playground at `/graphql`. MinIO console at `localhost:9001`.

## Architecture

This is a monorepo (Yarn 4 workspaces) with a single package: `packages/server`.

### Data model

```
EmbeddingSpace  ──< Collection ──< Document ──< Chunk
                                               │
                                               └──< ChunkEmbedding1536 (pgvector)
```

- **EmbeddingSpace** — defines the provider (`openai`), model, dimensions (`1024` or `1536`), and distance metric. The dimension determines which pgvector table is used (`chunk_embeddings_1024` or `chunk_embeddings_1536`).
- **Collection** — belongs to a user and an EmbeddingSpace. A "default" collection is auto-created per user on first ingest.
- **Document** — tracks ingestion lifecycle (`QUEUED → COMPLETED/FAILED`) and is stored in S3.
- **Chunk** — text segment with positional metadata (`chunk_index`, `section_path`, `overlap_before/after`).
- **ChunkEmbedding1536** — float vector stored in pgvector.

### Ingestion pipeline (`POST /api/ingest`)

1. Accept file upload, URL, or raw text content
2. Extract text (`RESTEndpoints.js:extractTextFromSource`)
3. Create Document record with status `QUEUED`
4. Run `DocumentIngestionService.ingestDocument` asynchronously:
   - Resolve collection → embedding space
   - Chunk text via `ChunkService.chunkText` (uses strategy from request)
   - Batch-embed chunks via `OpenAIEmbeddingClient`
   - Insert chunks + vectors in a transaction
5. Update Document status to `COMPLETED` or `FAILED`
6. Publish GraphQL subscription event (`DOCUMENT_PROCESSING_UPDATE_<jobId>`)

### Chunking strategies (`services/chunk/textChunkerStrategies.js`)

Each strategy is a pipeline: **chunker → enrichments → attachments**. The active strategies are:
- `generalist` — sentence-window (default)
- `manuals_classic` — heading-section splits
- `semantic_chapters` — semantic break detection
- `fixed_window` — fixed-size with overlap

Enrichments: `normalize_text`, `dedupe_near_duplicate`, `chunk_summary`, `passage_expansion`  
Attachments: `anchors`, `parent_child`, `symbols`

### Retrieval pipeline (`services/retrieval/`)

`RetrievalService.retrieve()` executes a named strategy's tool pipeline sequentially. Each tool takes `(results, context, options)` and returns processed results. Active strategies: `generalist`, `high_precision`, `manuals_guides`, `longform_narrative`, `noisy_ocr`.

### GraphQL API

Schema is assembled from per-entity `.graphql` files in `api/graphql/` and merged in `api/graphql/index.js`. Entities: `EmbeddingSpace`, `Collection`, `Document`, `Chunk`, `IngestJob`.

### Configuration

Uses the `config` npm package. Hierarchy: `config/default.js` → `config/production.js` / `config/test.js`. Environment variable overrides defined in `config/custom-environment-variables.js`. Key env vars: `OPEN_AI_API_KEY`, `POSTGRES_*`, `S3_*`.

### Seeding

On startup, two seeds run automatically:
1. `seedAdmin` — creates the admin user
2. `seedDefaultEmbeddingSpace` — creates an `openai` / `text-embedding-3-small` / 1536-dim space named `default`
