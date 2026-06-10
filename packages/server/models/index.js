/**
 * Only the model files
 */

const EmbeddingSpace = require('./embeddingSpace/embeddingSpace.model')
const Collection = require('./collection/collection.model')
const Document = require('./document/document.model')
const Chunk = require('./chunk/chunk.model')
const ChunkEmbedding1536 = require('./chunkEmbedding1536/chunkEmbedding1536.model')

module.exports = {
  EmbeddingSpace,
  Collection,
  Document,
  Chunk,
  ChunkEmbedding1536,
}
