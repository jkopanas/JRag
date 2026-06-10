/**
 * Text chunking strategies with their tool combinations
 */

const chunkingTools = require('./chunkingTools')
const enrichmentTools = require('./enrichmentTools')
const attachmentTools = require('./attachmentTools')

/**
 * Strategy definitions with their chunking, attachment, and enrichment tools
 */
const strategies = {
  // Generalist - Best default for generic text & Markdown
  generalist: {
    name: 'Generalist',
    description: 'Best default for generic text & Markdown',
    chunker: (text, options) => chunkingTools.sentenceWindow(text, { 
      windowSize: 3, 
      overlap: 1, 
      minSize: options.minSize || 200
    }),
    active: true,
    attachments: ['anchors'],
    enrichments: ['normalize_text', 'dedupe_near_duplicate', 'chunk_summary'],
    enrichmentOptions: { chunk_summary: { maxLength: 80 } }
  },

  // Manuals Classic - For docs with strong headings
  manuals_classic: {
    name: 'Manuals Classic',
    description: 'For docs with strong headings (guides, manuals, wikis)',
    chunker: (text, options) => chunkingTools.headingSection(text, { 
      minSize: options.minSize || 200,
      maxSize: options.maxSize || 2000
    }),
    active: true,
    attachments: ['parent_child', 'anchors'],
    enrichments: ['normalize_text', 'dedupe_near_duplicate', 'chunk_summary'],
    enrichmentOptions: { chunk_summary: { maxLength: 80 } }
  },

  // Semantic Chapters - Long-form Markdown with natural topic shifts
  semantic_chapters: {
    name: 'Semantic Chapters',
    description: 'Long-form Markdown or text with natural topic shifts',
    chunker: (text, options) => chunkingTools.semanticBreaks(text, { 
      minSize: options.minSize || 200,
      maxSize: options.maxSize || 1500
    }),
    active: true,
    attachments: ['anchors'],
    enrichments: ['normalize_text', 'chunk_summary', 'passage_expansion'],
    enrichmentOptions: { 
      chunk_summary: { maxLength: 80 },
      passage_expansion: { contextLength: 200 }
    }
  },

  // Fixed Window - Robust fallback when structure is weak
  fixed_window: {
    name: 'Fixed Window',
    description: 'Robust fallback when structure is weak',
    chunker: (text, options) => chunkingTools.fixedWindow(text, { 
      size: options.size || 400, 
      overlap: options.overlap || 80,
      minSize: options.minSize || 200
    }),
    active: true,
    attachments: ['anchors'],
    enrichments: ['normalize_text', 'dedupe_near_duplicate', 'chunk_summary'],
    enrichmentOptions: { chunk_summary: { maxLength: 60 } }
  },

  // Code Search - For repos & technical docs
  code_search: {
    name: 'Code Search',
    description: 'For repos & technical docs',
    chunker: (text, options) => {
      const codeChunks = chunkingTools.codeBlocks(text, { 
        minSize: options.minSize || 200,
        maxSize: options.maxSize || 2000
      })
      
      // Fallback to fixed window for non-code text
      if (codeChunks.length === 0) {
        return chunkingTools.fixedWindow(text, { 
          size: 300, 
          overlap: 60,
          minSize: options.minSize || 200
        })
      }
      
      return codeChunks
    },
    active: false,
    attachments: ['anchors', 'symbols'],
    enrichments: ['normalize_text', 'dedupe_near_duplicate', 'chunk_summary'],
    enrichmentOptions: { chunk_summary: { maxLength: 60 } },
    metadata: ['file_path', 'symbol']
  },

  // Tabular QA - For datasets, reports, tables with supporting prose
  tabular_qa: {
    name: 'Tabular QA',
    description: 'For datasets, reports, tables with supporting prose',
    chunker: (text, options) => {
      const tableChunks = chunkingTools.tablesAsUnits(text, { 
        minSize: options.minSize || 200
      })
      
      // For surrounding text, use sentence window
      if (tableChunks.length === 0) {
        return chunkingTools.sentenceWindow(text, { 
          windowSize: 2, 
          overlap: 1,
          minSize: options.minSize || 200
        })
      }
      
      return tableChunks
    },
    active: false,
    attachments: ['anchors'],
    enrichments: ['normalize_text'],
    metadata: ['table_csv', 'table_json']
  },

  // Slides & Pages - For decks, presentations, page-scanned notes
  slides_pages: {
    name: 'Slides & Pages',
    description: 'For decks, presentations, page-scanned notes',
    chunker: (text, options) => chunkingTools.slidesPages(text, { 
      minSize: options.minSize || 200
    }),
    active: false,
    attachments: ['parent_child', 'anchors'],
    enrichments: ['normalize_text', 'chunk_summary'],
    enrichmentOptions: { chunk_summary: { maxLength: 60 } },
    metadata: ['slide_metadata']
  },

  // Email Threads - For corporate email archives & threaded discussions
  email_threads: {
    name: 'Email Threads',
    description: 'For corporate email archives & threaded discussions',
    chunker: (text, options) => chunkingTools.emailsThreads(text, { 
      minSize: options.minSize || 200
    }),
    active: false,
    attachments: ['anchors'],
    enrichments: ['normalize_text', 'dedupe_near_duplicate'],
    metadata: ['sender', 'timestamp', 'thread_id', 'subject']
  },

  // High-Recall - For search-focused ingestion when coverage matters more than precision
  high_recall: {
    name: 'High-Recall',
    description: 'For search-focused ingestion when coverage matters more than precision',
    chunker: (text, options) => chunkingTools.sentenceWindow(text, { 
      windowSize: 2, 
      overlap: 1,
      minSize: options.minSize || 200
    }),
    active: false,
    attachments: ['anchors'],
    enrichments: ['normalize_text', 'passage_expansion', 'chunk_summary'],
    enrichmentOptions: { 
      chunk_summary: { maxLength: 70 },
      passage_expansion: { contextLength: 300 }
    }
  },

  // High-Precision - For compliance/legal docs where precision > recall
  high_precision: {
    name: 'High-Precision',
    description: 'For compliance/legal docs where precision > recall',
    chunker: (text, options) => chunkingTools.headingSection(text, { 
      minSize: options.minSize || 200,
      maxSize: options.maxSize || 2000
    }),
    active: false,
    attachments: ['parent_child', 'anchors'],
    enrichments: ['normalize_text']
  },

  // MetaRich - For blogs, docs with frontmatter metadata
  metarich: {
    name: 'MetaRich',
    description: 'For blogs, docs with frontmatter metadata',
    chunker: (text, options) => {
      // Try heading section first, fallback to sentence window
      const headingChunks = chunkingTools.headingSection(text, { 
        minSize: options.minSize || 200,
        maxSize: options.maxSize || 2000
      })
      
      if (headingChunks.length > 0) {
        return headingChunks
      }
      
      return chunkingTools.sentenceWindow(text, { 
        windowSize: 3, 
        overlap: 1,
        minSize: options.minSize || 200
      })
    },
    active: false,
    attachments: ['anchors'],
    enrichments: ['normalize_text', 'chunk_summary'],
    enrichmentOptions: { chunk_summary: { maxLength: 80 } },
    metadata: ['md_frontmatter', 'language_detect']
  },

  // Longform Legal - For contracts, policies, ToS
  longform_legal: {
    name: 'Longform Legal',
    description: 'For contracts, policies, ToS',
    chunker: (text, options) => {
      // Try heading section first, fallback to large fixed window
      const headingChunks = chunkingTools.headingSection(text, { 
        minSize: options.minSize || 200,
        maxSize: options.maxSize || 2000
      })
      
      if (headingChunks.length > 0) {
        return headingChunks
      }
      
      return chunkingTools.fixedWindow(text, { 
        size: 800, 
        overlap: 120,
        minSize: options.minSize || 200
      })
    },
    active: false,
    attachments: ['anchors'],
    enrichments: ['normalize_text', 'chunk_summary'],
    enrichmentOptions: { chunk_summary: { maxLength: 100 } }
  }
}

/**
 * Apply enrichments to chunks
 * @param {Array} chunks - Array of chunk objects
 * @param {Array} enrichmentNames - Array of enrichment function names
 * @param {Object} options - Enrichment options
 * @param {string} fullText - Full document text for context
 * @returns {Promise<Array>} Enriched chunks
 */
async function applyEnrichments(chunks, enrichmentNames, options = {}, fullText = '') {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return chunks || []
  }

  let enrichedChunks = [...chunks]

  for (const enrichmentName of enrichmentNames) {
    switch (enrichmentName) {
      case 'normalize_text':
        enrichedChunks = enrichedChunks.map(chunk => ({
          ...chunk,
          text: enrichmentTools.normalizeText(chunk.text)
        }))
        break

      case 'dedupe_near_duplicate':
        enrichedChunks = enrichmentTools.dedupeNearDuplicate(enrichedChunks, options.dedupe || {})
        break

      case 'chunk_summary':
        const summaryOptions = options.chunk_summary || { maxLength: 80 }
        enrichedChunks = await Promise.all(enrichedChunks.map(async chunk => ({
          ...chunk,
          meta: {
            ...chunk.meta,
            summary: await enrichmentTools.chunkSummary(chunk.text, summaryOptions)
          }
        })))
        break

      case 'passage_expansion':
        const expansionOptions = options.passage_expansion || { contextLength: 200 }
        enrichedChunks = enrichedChunks.map(chunk => ({
          ...chunk,
          text: enrichmentTools.passageExpansion(chunk.text, fullText, expansionOptions)
        }))
        break

      case 'language_detect':
        enrichedChunks = enrichedChunks.map(chunk => ({
          ...chunk,
          meta: {
            ...chunk.meta,
            language: enrichmentTools.languageDetect(chunk.text)
          }
        }))
        break

      case 'md_frontmatter':
        const frontmatter = enrichmentTools.extractFrontmatter(fullText)
        enrichedChunks = enrichedChunks.map(chunk => ({
          ...chunk,
          meta: {
            ...chunk.meta,
            frontmatter
          }
        }))
        break

      case 'table_csv':
        enrichedChunks = enrichedChunks.map(chunk => {
          if (chunk.meta && chunk.meta.type === 'table') {
            return {
              ...chunk,
              meta: {
                ...chunk.meta,
                table_csv: enrichmentTools.extractTableCsv(chunk.text)
              }
            }
          }
          return chunk
        })
        break

      case 'table_json':
        enrichedChunks = enrichedChunks.map(chunk => {
          if (chunk.meta && chunk.meta.type === 'table') {
            return {
              ...chunk,
              meta: {
                ...chunk.meta,
                table_json: enrichmentTools.extractTableJson(chunk.text)
              }
            }
          }
          return chunk
        })
        break
    }
  }

  return enrichedChunks
}

/**
 * Apply attachments to chunks
 * @param {Array} chunks - Array of chunk objects
 * @param {Array} attachmentNames - Array of attachment function names
 * @param {Object} options - Attachment options
 * @param {string} fullText - Full document text for context
 * @returns {Array} Chunks with attachments
 */
function applyAttachments(chunks, attachmentNames, options = {}, fullText = '') {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return chunks || []
  }

  let attachedChunks = [...chunks]

  for (const attachmentName of attachmentNames) {
    switch (attachmentName) {
      case 'anchors':
        attachedChunks = attachmentTools.addAnchors(attachedChunks, fullText)
        break

      case 'parent_child':
        const parentChildOptions = { ...options.parent_child }
        // Add documentId if available in options
        if (options.documentId) {
          parentChildOptions.documentId = options.documentId
        }
        attachedChunks = attachmentTools.addParentChild(attachedChunks, parentChildOptions)
        break

      case 'symbols':
        attachedChunks = attachmentTools.addSymbols(attachedChunks, fullText)
        break

      case 'file_path':
        if (options.file_path) {
          attachedChunks = attachmentTools.addFilePath(attachedChunks, options.file_path)
        }
        break

      case 'email_metadata':
        attachedChunks = attachmentTools.addEmailMetadata(attachedChunks, options.email_metadata || {})
        break

      case 'table_metadata':
        attachedChunks = attachmentTools.addTableMetadata(attachedChunks, options.table_metadata || {})
        break

      case 'slide_metadata':
        attachedChunks = attachmentTools.addSlideMetadata(attachedChunks, options.slide_metadata || {})
        break
    }
  }

  return attachedChunks
}

/**
 * Create a fallback chunk for text that's shorter than minSize
 * @param {string} text - Text to create fallback chunk for
 * @param {string} strategyName - Name of the strategy
 * @param {Object} strategy - Strategy object with description
 * @param {number} minSize - Minimum chunk size
 * @returns {Object} Fallback chunk object
 */
function createFallbackChunk(text, strategyName, strategy, minSize) {
  const fallbackReason = text.length < minSize ? 'text_shorter_than_min_size' : 'text_equals_min_size'
  
  console.warn(`Text length (${text.length}) is shorter than or equal to minSize (${minSize}) for strategy '${strategyName}'. Creating single chunk with full text.`)
  
  return {
    chunk_index: 0,
    text: text.trim(),
    overlap_before: 0,
    overlap_after: 0,
    section_path: null,
    page_no: null,
    meta: {
      strategy: strategyName,
      strategy_description: strategy.description,
      chunk_length: text.trim().length,
      fallback_reason: fallbackReason,
      original_min_size: minSize,
      start_pos: 0,
      end_pos: text.length,
      line_number: 1
    }
  }
}

/**
 * Process text using a specific strategy
 * @param {string} text - Text to process
 * @param {string} strategyName - Name of the strategy to use
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Processed chunks
 */
async function processWithStrategy(text, strategyName, options = {}) {
  const strategy = strategies[strategyName]
  
  if (!strategy) {
    throw new Error(`Unknown strategy: ${strategyName}`)
  }

  if (!text || typeof text !== 'string') {
    return []
  }

  // Check if text is shorter than minSize and create single chunk fallback
  const { minSize = 200 } = options
  let chunks
  
  if (text.length > 0 && text.length <= minSize) {
    // Create fallback chunk using helper function
    chunks = [createFallbackChunk(text, strategyName, strategy, minSize)]
  } else {
    // Step 1: Chunk the text normally
    chunks = strategy.chunker(text, options)
  }
  
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return []
  }

  // Step 2: Apply enrichments
  const enrichmentOptions = { ...strategy.enrichmentOptions, ...options.enrichmentOptions }
  chunks = await applyEnrichments(chunks, strategy.enrichments, enrichmentOptions, text)

  // Step 3: Apply attachments
  const attachmentOptions = { ...options.attachmentOptions }
  chunks = applyAttachments(chunks, strategy.attachments, attachmentOptions, text)

  // Step 4: Add strategy metadata
  chunks = chunks.map(chunk => ({
    ...chunk,
    meta: {
      ...chunk.meta,
      strategy_name: strategyName,
      strategy_description: strategy.description
    }
  }))

  return chunks
}

/**
 * Get available strategies
 * @returns {Array} Array of strategy names and descriptions
 */
function getAvailableStrategies() {
  return Object.entries(strategies).map(([key, strategy]) => ({
    key,
    active: strategy.active,
    name: strategy.name,
    description: strategy.description
  })).filter(strategy => strategy.active)
}

/**
 * Get strategy details
 * @param {string} strategyName - Name of the strategy
 * @returns {Object} Strategy details
 */
function getStrategyDetails(strategyName) {
  const strategy = strategies[strategyName]
  if (!strategy) {
    throw new Error(`Unknown strategy: ${strategyName}`)
  }
  
  return {
    name: strategy.name,
    description: strategy.description,
    chunker: strategy.chunker.name || 'anonymous',
    attachments: strategy.attachments,
    enrichments: strategy.enrichments,
    metadata: strategy.metadata || []
  }
}

module.exports = {
  strategies,
  processWithStrategy,
  getAvailableStrategies,
  getStrategyDetails,
  applyEnrichments,
  applyAttachments
}
