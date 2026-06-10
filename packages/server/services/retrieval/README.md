# Retrieval Service

A comprehensive retrieval service that implements various strategies and tools for embedding-based document retrieval. The service provides 12 different retrieval strategies, each optimized for specific use cases and document types.

## Overview

The Retrieval Service is designed around a pipeline architecture where each strategy defines a sequence of tools to execute for retrieval. This allows for flexible and composable retrieval approaches.

## Architecture

```
RetrievalService
├── Strategies (12 predefined strategies)
├── Tools (17 retrieval tools)
└── Pipeline Execution Engine
```

## Retrieval Strategies

### 1. Generalist
**For mixed/unknown docs (safe default)**
- Tools: hybrid → anchorBoost → dedupe → rerank → joinParent → budget
- Best for: General-purpose document retrieval

### 2. High Recall
**For exploratory queries, coverage > precision**
- Tools: multiQuery → hyde → hybrid → rrf → dedupe → rerank → mmr → budget
- Best for: Research, exploratory search

### 3. High Precision
**For legal/compliance docs (low hallucination tolerance)**
- Tools: vector → anchorBoost → dedupe → rerank → joinParent → budget
- Best for: Legal documents, compliance materials

### 4. Manuals & Guides
**For docs with strong headings (wikis, manuals)**
- Tools: hybrid → anchorBoost → rerank → joinParent → budget
- Best for: Documentation, wikis, user guides

### 5. Longform Narrative
**For books, articles, research notes**
- Tools: multiQuery → vector → rrf → rerank → budget
- Best for: Books, articles, research papers

### 6. Code & APIs
**For repos, SDK docs, stack traces**
- Tools: codeExpand → hybrid → rrf → fieldBoost → rerank → joinParent → budget
- Best for: Code repositories, API documentation

### 7. Tables & Reports
**For financials, datasets, CSV-like docs**
- Tools: sparse → vector → rrf → rerank → tableAssemble → budget
- Best for: Financial reports, datasets, tabular data

### 8. Slides & Pages
**For slide decks, page-scanned PDFs**
- Tools: sparse → vector → rrf → anchorBoost → rerank → joinParent → budget
- Best for: Presentations, scanned documents

### 9. Email & Threads
**For email/chat archives**
- Tools: sparse → vector → rrf → rerank → threadJoin → budget
- Best for: Email archives, chat logs

### 10. Freshness-Biased
**For news, changelogs, fast-moving docs**
- Tools: hybrid → recency → rerank → budget
- Best for: News articles, changelogs, time-sensitive content

### 11. Multilingual
**For mixed-language corpora**
- Tools: multiQuery → sparse → vector → rrf → rerank → budget
- Best for: Multilingual documents, international content

### 12. Noisy OCR
**For scanned PDFs / poor text quality**
- Tools: hybrid → dedupe → rerank → joinParent → budget
- Best for: Scanned documents, poor quality text

## Retrieval Tools

### Core Search Tools
- **hybrid**: Combines dense vector search with sparse keyword search
- **vector**: Dense vector similarity search
- **sparse**: Keyword-based sparse search

### Query Expansion Tools
- **multiQuery**: Generates multiple query variations
- **hyde**: Hypothetical Document Embeddings
- **codeExpand**: Expands queries with code-related terms

### Result Processing Tools
- **rrf**: Reciprocal Rank Fusion for combining result sets
- **dedupe**: Removes duplicate or near-duplicate results
- **rerank**: Reranks results using cross-encoder models
- **mmr**: Maximum Marginal Relevance for diversity

### Boosting Tools
- **anchorBoost**: Boosts results with anchor information
- **fieldBoost**: Boosts results based on metadata fields
- **recency**: Boosts results based on recency

### Context Tools
- **joinParent**: Joins parent chunks for additional context
- **tableAssemble**: Assembles table content with surrounding context
- **threadJoin**: Groups results by thread ID

### Control Tools
- **budget**: Controls result size based on character budget

## Usage

### Basic Usage

```javascript
const RetrievalService = require('./RetrievalService')

const retrievalService = new RetrievalService()

// Use generalist strategy (default)
const results = await retrievalService.retrieve(trx, {
  collectionId: 'collection-123',
  query: 'machine learning algorithms',
  strategy: 'generalist',
  limit: 20
})
```

### Advanced Usage with Custom Options

```javascript
// High recall strategy with custom options
const results = await retrievalService.retrieve(trx, {
  collectionId: 'collection-123',
  query: 'data science techniques',
  strategy: 'high_recall',
  options: {
    multiQuery: { numQueries: 5 },
    hyde: { generateHypothetical: true },
    rerank: { topK: 60, keep: 30 }
  },
  limit: 30
})
```

### Strategy-Specific Usage

```javascript
// Code & APIs strategy for technical content
const codeResults = await retrievalService.retrieve(trx, {
  collectionId: 'collection-123',
  query: 'REST API authentication',
  strategy: 'code_apis',
  options: {
    codeExpand: { expandSymbols: true, expandFunctions: true },
    fieldBoost: { fields: ['symbol', 'file_path'], boost: 1.5 }
  },
  limit: 25
})
```

## API Reference

### RetrievalService

#### `retrieve(trx, params)`
Retrieve relevant chunks using a specific strategy.

**Parameters:**
- `trx`: Database transaction
- `params.collectionId`: ID of the collection to search
- `params.query`: Search query
- `params.strategy`: Strategy name (default: 'generalist')
- `params.options`: Additional options for the strategy
- `params.limit`: Maximum number of results to return

**Returns:** Promise<Array> - Array of relevant chunks with scores

#### `getAvailableStrategies()`
Get all available retrieval strategies.

**Returns:** Array of strategy information

#### `getStrategyDetails(strategyName)`
Get detailed information about a specific strategy.

**Parameters:**
- `strategyName`: Name of the strategy

**Returns:** Object with strategy details

#### `getAvailableTools()`
Get all available retrieval tools.

**Returns:** Array of tool information

#### `getToolDetails(toolName)`
Get detailed information about a specific tool.

**Parameters:**
- `toolName`: Name of the tool

**Returns:** Object with tool details

## Configuration

Each strategy can be configured with custom options for its tools:

```javascript
const customOptions = {
  hybrid: { kVec: 80, kSparse: 40 },
  dedupe: { threshold: 0.95 },
  rerank: { topK: 50, keep: 25, model: 'custom-model' },
  budget: { maxChars: 10000 }
}
```

## Testing

Run the tests to verify the service functionality:

```bash
npm test -- retrievalService.test.js
```

## Examples

See `example.js` for comprehensive usage examples demonstrating different strategies and configurations.

## Dependencies

- EmbeddingService: For vector embeddings
- Collection model: For collection management
- Chunk model: For chunk storage and retrieval
- Database transaction support

## Notes

- The service is designed to be extensible - new strategies and tools can be easily added
- Tool implementations are simplified for demonstration - production implementations would use more sophisticated algorithms
- The service follows the existing codebase patterns and conventions
- All tools are designed to be stateless and composable
