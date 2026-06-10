// Developer-defined vector spaces (provider+model+dim+metric).
exports.up = db => {
  return db.schema
    .createTable('embedding_spaces', table => {
      table.uuid('id').primary()
      table
        .timestamp('created', { useTz: true })
        .notNullable()
        .defaultTo(db.fn.now())
      table
        .timestamp('updated', { useTz: true })
        .notNullable()
        .defaultTo(db.fn.now())
      table.string('name').notNullable().unique()
        .comment('Unique code name, e.g. "openai_3_large".')
      table.string('provider').notNullable()
        .comment('Provider: "openai", "hf", "cohere", etc.')
      table.string('model').notNullable()
        .comment('Model id, e.g. "text-embedding-3-large", "BAAI/bge-m3".')
      table.integer('dim').notNullable()
        .comment('Embedding dimensionality (e.g., 1024, 1536, 3072).')
      table.enu('metric', ['cosine', 'ip', 'l2']).notNullable()
        .comment('Similarity metric for ANN search.')
      table.text('description').comment('Human-readable description of this embedding space.')
      table.text('type').notNullable()
        .comment('Type identifier for this embedding space.')
    })
    .raw(`COMMENT ON TABLE embedding_spaces IS 'Developer-defined vector spaces. Collections must reference one.';`)
}

exports.down = db => {
  return db.schema.dropTableIfExists('embedding_spaces')
}
