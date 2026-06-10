const { EmbeddingSpace } = require('../../../models')

const resolvers = {
  Query: {
    embeddingSpaces: async (parent, args, context) => {
      return await EmbeddingSpace.query()
    },
    defaultEmbeddingSpace: async (parent, args, context) => {
      return await EmbeddingSpace.query()
        .where('name', 'default')
        .first()
    }
  }
}

module.exports = resolvers
