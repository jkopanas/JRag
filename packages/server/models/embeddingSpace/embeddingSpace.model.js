const { BaseModel, modelJsonSchemaTypes } = require('@coko/server')

const { id, string, integerPositive } = modelJsonSchemaTypes

class EmbeddingSpace extends BaseModel {
  static get tableName() {
    return 'embedding_spaces'
  }

  constructor(properties) {
    super(properties)
    this.type = 'EmbeddingSpace'
  }

  static get schema() {
    return {
      required: ['name', 'provider', 'model', 'dim', 'metric'],
      properties: {
        name: string,
        provider: string,
        model: string,
        dim: integerPositive,
        metric: {
          type: 'string',
          enum: ['cosine', 'ip', 'l2']
        },
        description: string,
      },
    }
  }

  static get relationMappings() {
    /* eslint-disable global-require */
    const Collection = require('../collection/collection.model')
    /* eslint-enable global-require */

    return {
      collections: {
        relation: BaseModel.HasManyRelation,
        modelClass: Collection,
        join: {
          from: 'embedding_spaces.id',
          to: 'collections.embedding_space_id',
        },
      },
    }
  }

  /** Map dim -> embeddings table name (you can customize). */
  static tableForDim(dim) {
    if (dim === 1024) return 'chunk_embeddings_1024'
    if (dim === 1536) return 'chunk_embeddings_1536'
    throw new Error(`No embeddings table configured for dim=${dim}`)
  }
}

module.exports = EmbeddingSpace
