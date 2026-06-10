/**
 * ChunkService - Dedicated service for text chunking operations
 * Handles all chunking strategies, enrichments, and attachments
 */

const { simpleOverlapChunks, semanticChunks } = require('./textChunker')
const { processWithStrategy, getAvailableStrategies } = require('./textChunkerStrategies')

/**
 * Service for text chunking with multiple strategies and processing options
 */
class ChunkService {
  constructor() {
    // Initialize any required dependencies
  }

  /**
   * Chunk text using legacy strategies (simple, semantic)
   * @param {string} text - Text to chunk
   * @param {Object} options - Chunking options
   * @param {string} options.strategy - 'simple' or 'semantic' (default: 'simple')
   * @param {number} options.size - Chunk size for simple strategy (characters)
   * @param {number} options.overlap - Overlap size (characters)
   * @param {number} options.maxSize - Max size for semantic strategy (characters)
   * @param {number} options.minSize - Min size for semantic strategy (characters)
   * @param {number} options.maxTokens - Max tokens for token-aware simple strategy
   * @param {number} options.overlapTokens - Overlap in tokens for token-aware strategy
   * @param {string} options.model - Model name for tokenization
   * @returns {Array} Array of chunk objects
   */
  chunkTextLegacy(text, options = {}) {
    const {
      strategy = 'simple',
      size = 800,
      overlap = 120,
      maxSize = 1000,
      minSize = 200,
      maxTokens,
      overlapTokens,
      model = 'text-embedding-ada-002'
    } = options

    switch (strategy) {
      case 'semantic':
        return semanticChunks(text, { maxSize, minSize, overlap })
      case 'simple':
      default:
        return simpleOverlapChunks(text, { 
          size, 
          overlap, 
          minSize,
          maxTokens,
          overlapTokens,
          model
        })
    }
  }

  /**
   * Chunk text using advanced strategies
   * @param {string} text - Text to chunk
   * @param {string} strategyName - Name of the advanced strategy to use
   * @param {Object} options - Processing options
   * @param {number} options.minSize - Minimum chunk size (default: 200)
   * @param {number} options.maxSize - Maximum chunk size (default: 1000)
   * @param {number} options.size - Chunk size for fixed window strategies
   * @param {number} options.overlap - Overlap size for fixed window strategies
   * @param {string} options.model - Model name for tokenization
   * @param {Object} options.enrichmentOptions - Options for enrichment functions
   * @param {Object} options.attachmentOptions - Options for attachment functions
   * @returns {Promise<Array>} Array of processed chunk objects
   */
  async chunkTextAdvanced(text, strategyName, options = {}) {
    return await processWithStrategy(text, strategyName, options)
  }

  /**
   * Chunk text using any available strategy (legacy or advanced)
   * @param {string} text - Text to chunk
   * @param {Object} options - Chunking options
   * @param {string} options.strategy - Strategy name (legacy or advanced)
   * @param {Object} options.advancedOptions - Additional options for advanced strategies
   * @returns {Promise<Array>} Array of chunk objects
   */
  async chunkText(text, options = {}) {
    const {
      strategy = 'generalist',
      advancedOptions = {}
    } = options

    // Check if this is an advanced strategy
    const advancedStrategies = getAvailableStrategies()
    const isAdvancedStrategy = advancedStrategies.some(s => s.key === strategy)

    if (isAdvancedStrategy) {
      // Use advanced strategy processing
      return await this.chunkTextAdvanced(text, strategy, {
        ...advancedOptions,
        ...options
      })
    }

    // Use legacy chunking methods
    return this.chunkTextLegacy(text, options)
  }

  /**
   * Get available legacy chunking strategies
   * @returns {Array} Array of legacy strategy names
   */
  getLegacyStrategies() {
    return ['simple', 'semantic']
  }

  /**
   * Get available advanced chunking strategies
   * @returns {Array} Array of advanced strategy objects
   */
  getAdvancedStrategies() {
    return getAvailableStrategies()
  }

  /**
   * Get all available strategies (legacy + advanced)
   * @returns {Object} Object with legacy and advanced strategies
   */
  getAllStrategies() {
    return {
      legacy: this.getLegacyStrategies(),
      advanced: this.getAdvancedStrategies()
    }
  }

  /**
   * Get strategy details
   * @param {string} strategyName - Name of the strategy
   * @returns {Object} Strategy details
   */
  getStrategyDetails(strategyName) {
    const legacyStrategies = this.getLegacyStrategies()
    
    if (legacyStrategies.includes(strategyName)) {
      return {
        name: strategyName,
        type: 'legacy',
        description: strategyName === 'simple' 
          ? 'Simple overlapping chunks with word boundary detection'
          : 'Semantic chunks based on paragraph boundaries'
      }
    }

    // Check advanced strategies
    const advancedStrategies = this.getAdvancedStrategies()
    const strategy = advancedStrategies.find(s => s.key === strategyName)
    
    if (strategy) {
      return {
        ...strategy,
        type: 'advanced'
      }
    }

    throw new Error(`Unknown strategy: ${strategyName}`)
  }

  /**
   * Validate chunking options
   * @param {Object} options - Options to validate
   * @param {string} strategy - Strategy name
   * @returns {Object} Validated and normalized options
   */
  validateOptions(options, strategy) {
    const validated = { ...options }

    // Common validations
    if (validated.minSize && validated.minSize < 10) {
      console.warn('minSize too small, setting to 10')
      validated.minSize = 10
    }

    if (validated.maxSize && validated.minSize && validated.maxSize <= validated.minSize) {
      console.warn('maxSize must be greater than minSize, adjusting')
      validated.maxSize = validated.minSize * 2
    }

    if (validated.overlap && validated.size && validated.overlap >= validated.size) {
      console.warn('overlap must be less than size, adjusting')
      validated.overlap = Math.max(0, validated.size - 1)
    }

    return validated
  }

  /**
   * Get chunking statistics
   * @param {Array} chunks - Array of chunk objects
   * @returns {Object} Statistics about the chunks
   */
  getChunkStatistics(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return {
        totalChunks: 0,
        totalCharacters: 0,
        averageChunkSize: 0,
        minChunkSize: 0,
        maxChunkSize: 0,
        strategies: []
      }
    }

    const sizes = chunks.map(chunk => chunk.text ? chunk.text.length : 0)
    const strategies = [...new Set(chunks.map(chunk => (chunk.meta && chunk.meta.strategy_name) || 'unknown'))]

    return {
      totalChunks: chunks.length,
      totalCharacters: sizes.reduce((sum, size) => sum + size, 0),
      averageChunkSize: Math.round(sizes.reduce((sum, size) => sum + size, 0) / chunks.length),
      minChunkSize: Math.min(...sizes),
      maxChunkSize: Math.max(...sizes),
      strategies
    }
  }

  /**
   * Process text with multiple strategies for comparison
   * @param {string} text - Text to process
   * @param {Array} strategyNames - Array of strategy names to test
   * @param {Object} options - Common options for all strategies
   * @returns {Object} Results from all strategies with statistics
   */
  compareStrategies(text, strategyNames, options = {}) {
    const results = {}

    for (const strategyName of strategyNames) {
      try {
        const chunks = this.chunkText(text, { ...options, strategy: strategyName })
        const stats = this.getChunkStatistics(chunks)
        
        results[strategyName] = {
          chunks,
          statistics: stats,
          success: true
        }
      } catch (error) {
        results[strategyName] = {
          chunks: [],
          statistics: this.getChunkStatistics([]),
          success: false,
          error: error.message
        }
      }
    }

    return results
  }

  /**
   * Export chunks to different formats
   * @param {Array} chunks - Array of chunk objects
   * @param {string} format - Export format ('json', 'csv', 'text')
   * @returns {string} Exported data
   */
  exportChunks(chunks, format = 'json') {
    if (!Array.isArray(chunks)) {
      throw new Error('Chunks must be an array')
    }

    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(chunks, null, 2)
      
      case 'csv':
        const headers = ['chunk_index', 'text', 'overlap_before', 'overlap_after', 'section_path', 'page_no']
        const csvRows = chunks.map(chunk => 
          headers.map(header => {
            const value = chunk[header] || ''
            return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
          }).join(',')
        )
        return [headers.join(','), ...csvRows].join('\n')
      
      case 'text':
        return chunks.map((chunk, index) => 
          `--- Chunk ${index + 1} ---\n${chunk.text}\n`
        ).join('\n')
      
      default:
        throw new Error(`Unsupported export format: ${format}`)
    }
  }
}

module.exports = ChunkService
