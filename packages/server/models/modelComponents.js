/**
 * For use by config/components.js
 */

const modelPaths = [
  'embeddingSpace',
  'collection',
  'document',
  'chunk',
  'chunkEmbedding1536',
].map(name => `./models/${name}`)

module.exports = modelPaths
