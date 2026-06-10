/**
 * Retrieval strategies with their tool pipelines
 * Each strategy defines a sequence of tools to execute for retrieval
 */

const strategies = {
  // 1. Generalist - For mixed/unknown docs (safe default)
  generalist: {
    name: 'Generalist',
    description: 'For mixed/unknown docs (safe default)',
    active: true,
    tools: [
      { tool: 'hybrid', options: { kVec: 60, kSparse: 60 } },
      { tool: 'anchorBoost', options: { anchorWeight: 1.1 } },
      { tool: 'dedupe', options: { threshold: 0.93 } },
      { tool: 'rerank', options: { topK: 50, keep: 24 } },
      { tool: 'joinParent', options: { depth: 1 } },
      { tool: 'budget', options: { maxChars: 7000 } }
    ]
  },

  // 2. High Recall - For exploratory queries, coverage > precision
  high_recall: {
    name: 'High Recall',
    description: 'For exploratory queries, coverage > precision',
    active: false,
    tools: [
      { tool: 'multiQuery', options: { numQueries: 3 } },
      { tool: 'hyde', options: { generateHypothetical: true } },
      { tool: 'hybrid', options: { kVec: 40, kSparse: 40 } },
      { tool: 'rrf', options: { k: 60 } },
      { tool: 'dedupe', options: { threshold: 0.90 } },
      { tool: 'rerank', options: { topK: 60, keep: 30 } },
      { tool: 'mmr', options: { diversity: 0.7 } },
      { tool: 'budget', options: { maxChars: 8000 } }
    ]
  },

  // 3. High Precision - For legal/compliance docs (low hallucination tolerance)
  high_precision: {
    name: 'High Precision',
    description: 'For legal/compliance docs (low hallucination tolerance)',
    active: true,
    tools: [
      { tool: 'vector', options: { k: 80 } },
      { tool: 'anchorBoost', options: { anchorWeight: 1.2 } },
      { tool: 'dedupe', options: { threshold: 0.95 } },
      { tool: 'rerank', options: { topK: 40, keep: 20, model: 'legal-focused' } },
      { tool: 'joinParent', options: { depth: 1 } },
      { tool: 'budget', options: { maxChars: 6000 } }
    ]
  },

  // 4. Manuals & Guides - For docs with strong headings (wikis, manuals)
  manuals_guides: {
    name: 'Manuals & Guides',
    description: 'For docs with strong headings (wikis, manuals)',
    active: true,
    tools: [
      { tool: 'hybrid', options: { kVec: 50, kSparse: 50 } },
      { tool: 'anchorBoost', options: { anchorWeight: 1.3 } },
      { tool: 'rerank', options: { topK: 45, keep: 25 } },
      { tool: 'joinParent', options: { depth: 2 } },
      { tool: 'budget', options: { maxChars: 7000 } }
    ]
  },

  // 5. Longform Narrative - For books, articles, research notes
  longform_narrative: {
    name: 'Longform Narrative',
    description: 'For books, articles, research notes',
    active: true,
    tools: [
      { tool: 'multiQuery', options: { numQueries: 4 } },
      { tool: 'vector', options: { k: 50 } },
      { tool: 'rrf', options: { k: 60 } },
      { tool: 'rerank', options: { topK: 50, keep: 30 } },
      { tool: 'budget', options: { maxChars: 10000, window: 'large' } }
    ]
  },

  // 6. Code & APIs - For repos, SDK docs, stack traces
  code_apis: {
    name: 'Code & APIs',
    description: 'For repos, SDK docs, stack traces',
    active: false,
    tools: [
      { tool: 'codeExpand', options: { expandSymbols: true, expandFunctions: true } },
      { tool: 'hybrid', options: { kVec: 40, kSparse: 40 } },
      { tool: 'rrf', options: { k: 50 } },
      { tool: 'fieldBoost', options: { fields: ['symbol', 'file_path'], boost: 1.5 } },
      { tool: 'rerank', options: { topK: 40, keep: 25, model: 'code-aware' } },
      { tool: 'joinParent', options: { depth: 1 } },
      { tool: 'budget', options: { maxChars: 8000 } }
    ]
  },

  // 7. Tables & Reports - For financials, datasets, CSV-like docs
  tables_reports: {
    name: 'Tables & Reports',
    description: 'For financials, datasets, CSV-like docs',
    active: false,
    tools: [
      { tool: 'sparse', options: { k: 40, keywordHeavy: true } },
      { tool: 'vector', options: { k: 40 } },
      { tool: 'rrf', options: { k: 50 } },
      { tool: 'rerank', options: { topK: 45, keep: 25, model: 'table-tuned' } },
      { tool: 'tableAssemble', options: { includeSurrounding: true } },
      { tool: 'budget', options: { maxChars: 6000 } }
    ]
  },

  // 8. Slides & Pages - For slide decks, page-scanned PDFs
  slides_pages: {
    name: 'Slides & Pages',
    description: 'For slide decks, page-scanned PDFs',
    active: false,
    tools: [
      { tool: 'sparse', options: { k: 40, titleBoost: 1.5 } },
      { tool: 'vector', options: { k: 40 } },
      { tool: 'rrf', options: { k: 50 } },
      { tool: 'anchorBoost', options: { anchorWeight: 1.2 } },
      { tool: 'rerank', options: { topK: 45, keep: 25 } },
      { tool: 'joinParent', options: { depth: 1, pullFull: true } },
      { tool: 'budget', options: { maxChars: 7000 } }
    ]
  },

  // 9. Email & Threads - For email/chat archives
  email_threads: {
    name: 'Email & Threads',
    description: 'For email/chat archives',
    active: false,
    tools: [
      { tool: 'sparse', options: { k: 50, subjectBoost: 1.3, fromBoost: 1.2 } },
      { tool: 'vector', options: { k: 50 } },
      { tool: 'rrf', options: { k: 60 } },
      { tool: 'rerank', options: { topK: 50, keep: 30 } },
      { tool: 'threadJoin', options: { groupBy: 'thread_id' } },
      { tool: 'budget', options: { maxChars: 8000 } }
    ]
  },

  // 10. Freshness-Biased - For news, changelogs, fast-moving docs
  freshness_biased: {
    name: 'Freshness-Biased',
    description: 'For news, changelogs, fast-moving docs',
    active: false,
    tools: [
      { tool: 'hybrid', options: { kVec: 50, kSparse: 50 } },
      { tool: 'recency', options: { timeDecay: 0.1, timeField: 'created_at' } },
      { tool: 'rerank', options: { topK: 45, keep: 25 } },
      { tool: 'budget', options: { maxChars: 7000 } }
    ]
  },

  // 11. Multilingual - For mixed-language corpora
  multilingual: {
    name: 'Multilingual',
    description: 'For mixed-language corpora',
    active: false,
    tools: [
      { tool: 'multiQuery', options: { numQueries: 3, translations: true } },
      { tool: 'sparse', options: { k: 40 } },
      { tool: 'vector', options: { k: 40 } },
      { tool: 'rrf', options: { k: 50 } },
      { tool: 'rerank', options: { topK: 45, keep: 25, model: 'multilingual' } },
      { tool: 'budget', options: { maxChars: 7000 } }
    ]
  },

  // 12. Noisy OCR - For scanned PDFs / poor text quality
  noisy_ocr: {
    name: 'Noisy OCR',
    description: 'For scanned PDFs / poor text quality',
    active: true,
    tools: [
      { tool: 'hybrid', options: { kVec: 30, kSparse: 50 } },
      { tool: 'dedupe', options: { threshold: 0.85 } },
      { tool: 'rerank', options: { topK: 40, keep: 25 } },
      { tool: 'joinParent', options: { depth: 1 } },
      { tool: 'budget', options: { maxChars: 6000 } }
    ]
  }
}

/**
 * Get a strategy by name
 * @param {string} strategyName - Name of the strategy
 * @returns {Object|null} Strategy configuration or null if not found
 */
function getStrategy(strategyName) {
  return strategies[strategyName] || null
}

/**
 * Get all available strategies
 * @returns {Array} Array of strategy information
 */
function getAvailableStrategies() {
  return Object.entries(strategies).map(([key, strategy]) => ({
    key,
    active: strategy.active,
    name: strategy.name,
    description: strategy.description,
    toolCount: strategy.tools.length
  })).filter(strategy => strategy.active)
}

/**
 * Get detailed information about a strategy
 * @param {string} strategyName - Name of the strategy
 * @returns {Object} Strategy details including tools
 */
function getStrategyDetails(strategyName) {
  const strategy = strategies[strategyName]
  if (!strategy) {
    throw new Error(`Unknown strategy: ${strategyName}`)
  }
  
  return {
    name: strategy.name,
    description: strategy.description,
    tools: strategy.tools.map(tool => ({
      name: tool.tool,
      options: tool.options
    }))
  }
}

/**
 * Validate a strategy configuration
 * @param {string} strategyName - Name of the strategy
 * @returns {boolean} True if strategy is valid
 */
function validateStrategy(strategyName) {
  const strategy = strategies[strategyName]
  if (!strategy) {
    return false
  }
  
  // Check that strategy has tools
  if (!Array.isArray(strategy.tools) || strategy.tools.length === 0) {
    return false
  }
  
  // Check that each tool has required properties
  return strategy.tools.every(tool => 
    tool.tool && typeof tool.tool === 'string' && 
    tool.options && typeof tool.options === 'object'
  )
}

module.exports = {
  strategies,
  getStrategy,
  getAvailableStrategies,
  getStrategyDetails,
  validateStrategy
}
