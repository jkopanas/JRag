/**
 * Chunk Service Module
 * Exports all chunking-related functionality
 */

const ChunkService = require('./ChunkService')
const { processWithStrategy, getAvailableStrategies, applyEnrichments, applyAttachments } = require('./textChunkerStrategies')
const chunkingTools = require('./chunkingTools')
const enrichmentTools = require('./enrichmentTools')
const attachmentTools = require('./attachmentTools')
const { simpleOverlapChunks, semanticChunks, tokenAwareChunks } = require('./textChunker')

module.exports = {
  // Main service class
  ChunkService,
  
  // Strategy processing
  processWithStrategy,
  getAvailableStrategies,
  applyEnrichments,
  applyAttachments,
  
  // Individual tools
  chunkingTools,
  enrichmentTools,
  attachmentTools,
  
  // Legacy chunking functions
  simpleOverlapChunks,
  semanticChunks,
  tokenAwareChunks,
  
  // Convenience function to create a new ChunkService instance
  createChunkService: () => new ChunkService()
}
