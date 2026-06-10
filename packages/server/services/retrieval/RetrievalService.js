const EmbeddingService = require('../embeddings/EmbeddingService')
const Collection = require('../../models/collection/collection.model')
const Chunk = require('../../models/chunk/chunk.model')
const retrievalStrategies = require('./retrievalStrategies')
const retrievalTools = require('./retrievalTools')

/**
 * Service for retrieving relevant chunks using various strategies and tools
 */
class RetrievalService {
  constructor() {
    this.embeddingService = new EmbeddingService()
  }

  /**
   * Retrieve relevant chunks using a specific strategy
   * @param {Object} params - Retrieval parameters
   * @param {string} params.collectionId - ID of the collection to search
   * @param {string} params.query - Search query
   * @param {string} params.strategy - Strategy name (e.g., 'generalist', 'high_recall')
   * @param {Object} params.options - Additional options for the strategy
   * @param {number} params.limit - Maximum number of results to return
   * @returns {Promise<Array>} Array of relevant chunks with scores
   */
  async retrieve({
    collectionId,
    query,
    strategy = 'generalist',
    options = {},
    limit = 50
  }) {
    // Get collection and embedding space
    const collection = await Collection.query()
      .findById(collectionId)
      .withGraphFetched('embeddingSpace')
    
    if (!collection) {
      throw new Error('Collection not found')
    }
    
    const space = collection.embeddingSpace
    if (!space) {
      throw new Error('Embedding space not found for collection')
    }

    // Get strategy configuration
    const strategyConfig = retrievalStrategies.getStrategy(strategy)
    if (!strategyConfig) {
      throw new Error(`Unknown retrieval strategy: ${strategy}`)
    }

    // Create embedding client
    const embedder = this.embeddingService.createClient(space, options.embeddingOptions || {})

    // Execute the strategy pipeline
    const results = await this._executeStrategy({
      collectionId,
      query,
      strategy: strategyConfig,
      embedder,
      space,
      options,
      limit
    })

    return results
  }

  /**
   * Execute a retrieval strategy pipeline
   * @param {Object} params - Strategy execution parameters
   * @returns {Promise<Array>} Retrieved chunks
   * @private
   */
  async _executeStrategy({
    collectionId,
    query,
    strategy,
    embedder,
    space,
    options,
    limit
  }) {
    let results = []
    let context = {
      collectionId,
      query,
      embedder,
      space,
      options,
      limit,
    }

    // Execute each tool in the strategy pipeline
    for (const toolConfig of strategy.tools) {
      const tool = retrievalTools.getTool(toolConfig.tool)
      if (!tool) {
        throw new Error(`Unknown retrieval tool: ${toolConfig.tool}`)
      }

      // Merge tool options with strategy defaults
      const toolOptions = {
        ...toolConfig.options,
        ...options[toolConfig.tool] || {}
      }

      // Execute the tool
      results = await tool.execute(results, context, toolOptions)
      
      // Update context with results for next tool
      context.results = results
    }

    return results
  }

  /**
   * Get available retrieval strategies
   * @returns {Array} Array of strategy information
   */
  getAvailableStrategies() {
    return retrievalStrategies.getAvailableStrategies()
  }

  /**
   * Get strategy details
   * @param {string} strategyName - Name of the strategy
   * @returns {Object} Strategy details
   */
  getStrategyDetails(strategyName) {
    return retrievalStrategies.getStrategyDetails(strategyName)
  }

  /**
   * Get available retrieval tools
   * @returns {Array} Array of tool information
   */
  getAvailableTools() {
    return retrievalTools.getAvailableTools()
  }

  /**
   * Get tool details
   * @param {string} toolName - Name of the tool
   * @returns {Object} Tool details
   */
  getToolDetails(toolName) {
    return retrievalTools.getToolDetails(toolName)
  }
}

module.exports = RetrievalService
