const EmbeddingService = require('./EmbeddingService')
const Collection = require('../../models/collection/collection.model')
const Chunk = require('../../models/chunk/chunk.model')
const ChunkService = require('../chunk/ChunkService')

/**
 * Service for ingesting documents with automatic chunking and embedding
 */
class DocumentIngestionService {
  constructor() {
    this.embeddingService = new EmbeddingService()
    this.chunkService = new ChunkService()
  }

  /**
   * Ingest a text document by chunking it and creating embeddings
   * @param {Object} params - Ingestion parameters
   * @param {string} params.collectionId - ID of the collection to ingest into
   * @param {Object} params.source - Source document information
   * @param {string} params.source.uri - Source URI
   * @param {string} params.source.mime - MIME type
   * @param {string} params.source.language - Language code
   * @param {Object} params.source.meta - Additional metadata
   * @param {string} params.rawText - Raw text content to ingest
   * @param {Object} params.chunkingOptions - Options for text chunking
   * @param {string} params.chunkingOptions.strategy - 'simple', 'semantic', or advanced strategy name (default: 'simple')
   * @param {number} params.chunkingOptions.size - Chunk size for simple strategy (characters)
   * @param {number} params.chunkingOptions.overlap - Overlap size (characters)
   * @param {number} params.chunkingOptions.maxSize - Max size for semantic strategy (characters)
   * @param {number} params.chunkingOptions.minSize - Min size for semantic strategy (characters)
   * @param {number} params.chunkingOptions.maxTokens - Max tokens for token-aware simple strategy (default: 200)
   * @param {number} params.chunkingOptions.overlapTokens - Overlap in tokens for token-aware strategy
   * @param {string} params.chunkingOptions.model - Model name for tokenization (defaults to embedding space model)
   * @param {Object} params.chunkingOptions.advancedOptions - Additional options for advanced strategies
   * @param {number} params.batchSize - Batch size for embedding API calls (default: 64)
   * @param {Object} params.embeddingOptions - Additional options for embedding client
   * @returns {Promise<Object>} Result with documentId, chunksInserted, embeddingsInserted, and dim
   */
  async ingestDocument(trx, {
    documentId,
    collectionId,
    source,
    rawText,
    chunkingOptions = {},
    batchSize = 64,
    embeddingOptions = {}
  }) {
    // Resolve the collection's embedding space
    const collection = await Collection.query(trx)
      .findById(collectionId)
      .withGraphFetched('embeddingSpace')
    
    if (!collection) {
      throw new Error('Collection not found')
    }
    
    const space = collection.embeddingSpace
    if (!space) {
      throw new Error('Embedding space not found for collection')
    }

    // Create embedding client
    const embedder = this.embeddingService.createClient(space, embeddingOptions)
    
    // Use the embedding model for tokenization if not specified
    const chunkingOptionsWithModel = {
      ...chunkingOptions,
      documentId,
      model: chunkingOptions.model || space.model
    }
    
    // Chunk the text using appropriate method
    const chunks = await this._chunkText(rawText, chunkingOptionsWithModel)

    // Create embeddings in batches
    const vectors = await this._createEmbeddings(embedder, chunks, batchSize, space)

    // Insert document, chunks, and vectors
    return await Chunk.updateDocumentWithChunksAndVectors({
      collectionId,
      docPayload: {
        documentId,
        source_uri: source.uri,
        mime: source.mime || 'text/plain',
        language: source.language || null,
        meta: source.meta || null
      },
      chunkRecords: chunks,
      vectors
    })
  }

  /**
   * Chunk text based on the specified strategy
   * @param {string} text - Text to chunk
   * @param {Object} options - Chunking options
   * @returns {Promise<Array>} Array of chunk objects
   * @private
   */
  async _chunkText(text, options = {}) {
    return await this.chunkService.chunkText(text, options)
  }

  /**
   * Create embeddings for chunks in batches
   * @param {EmbeddingClient} embedder - The embedding client to use
   * @param {Array} chunks - Array of chunk objects
   * @param {number} batchSize - Size of batches for API calls
   * @param {Object} space - Embedding space configuration
   * @returns {Promise<Float32Array[]>} Array of embedding vectors
   * @private
   */
  async _createEmbeddings(embedder, chunks, batchSize, space) {
    const vectors = []
    
    console.log(`Creating embeddings for ${chunks.length} chunks in batches of ${batchSize}`)
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)
      const texts = batch.map(chunk => chunk.text)
      
      const batchVectors = await embedder.embedBatch(texts)
      
      // Verify dimensions match the space configuration
      batchVectors.forEach((vec, idx) => {
        if (vec.length !== space.dim) {
          throw new Error(
            `Dimension mismatch: expected ${space.dim}, got ${vec.length} for chunk ${i + idx}`
          )
        }
      })
      
      vectors.push(...batchVectors)
    }
    
    console.log(`Total vectors created: ${vectors.length}`)
    return vectors
  }

  /**
   * Get chunking service instance for advanced operations
   * @returns {ChunkService} ChunkService instance
   */
  getChunkService() {
    return this.chunkService
  }

  /**
   * Get available embedding providers
   * @returns {Array} Array of available provider names
   */
  getAvailableProviders() {
    return this.embeddingService.getAvailableProviders()
  }
}

module.exports = DocumentIngestionService
