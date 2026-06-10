const Collection = require("../../../models/collection/collection.model")

const resolvers = {
  Query: {
    collections: async (parent, { userId }) => {
      await Collection.insertDefaultCollection({ userId })
      return await Collection.query().where({ userId }).withGraphFetched('embeddingSpace')
    }
    ,
    collection: async (parent, { userId, id }) => 
      Collection.query().where({ id, user_id: userId }).withGraphFetched('embeddingSpace')
  },
  Mutation: {
    createCollection: async (_, { input }) => Collection.createForUser(input)
  },
  Collection: {
    embeddingSpace: parent => { 
      if (parent.embeddingSpace) return parent.embeddingSpace
      return parent.$relatedQuery('embeddingSpace')
    }
  }
}

module.exports = resolvers