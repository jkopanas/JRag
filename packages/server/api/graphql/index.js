const fs = require('fs')
const path = require('path')
const merge = require('lodash/merge')

// Load all resolver files
const embeddingSpaceResolvers = require('./embeddingSpace/resolvers')
const collectionResolvers = require('./collection/resolvers')
const documentResolvers = require('./document/resolvers')
const chunkResolvers = require('./chunk/resolvers')
const ingestResolvers = require('./ingest/resolvers')

const typeDefFilePaths = [
  'embeddingSpace/embeddingSpace.graphql',
  'collection/collection.graphql',
  'document/document.graphql',
  'chunk/chunk.graphql',
  'ingest/ingest.graphql'
]

const createTotalTypeDefs = paths => {
  return paths
    .map(p => fs.readFileSync(path.join(__dirname, p), 'utf-8'))
    .join(' ')
}

const typeDefs = createTotalTypeDefs(typeDefFilePaths)

const resolvers = merge(
  {},
  embeddingSpaceResolvers,
  collectionResolvers,
  documentResolvers,
  chunkResolvers,
  ingestResolvers
)

module.exports = {
  typeDefs,
  resolvers,
}
