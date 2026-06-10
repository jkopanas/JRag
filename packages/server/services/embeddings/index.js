const EmbeddingClient = require('./EmbeddingClient')
const OpenAIEmbeddingClient = require('./OpenAIEmbeddingClient')
const EmbeddingService = require('./EmbeddingService')
const DocumentIngestionService = require('./DocumentIngestionService')

// Re-export chunk service functionality
const chunkService = require('../chunk')

module.exports = {
  // Base classes
  EmbeddingClient,
  
  // Provider implementations
  OpenAIEmbeddingClient,
  
  // Services
  EmbeddingService,
  DocumentIngestionService,
  
  // Chunk service functionality
  ...chunkService
}
