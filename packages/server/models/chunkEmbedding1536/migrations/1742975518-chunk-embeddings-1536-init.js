// Per-chunk embeddings for 1536-d models (e.g., OpenAI text-embedding-3-small).
exports.up = db => {
  return db.raw('CREATE EXTENSION IF NOT EXISTS vector;')
    .then(() => {
      return db.schema
        .createTable('chunk_embeddings_1536', table => {
          table.uuid('chunk_id').primary()
            .references('chunks.id').onDelete('CASCADE')
            .comment('FK → chunks; vector embedding for this chunk.')
          table.specificType('embedding', 'vector(1536)').notNullable()
            .comment('1536-d float vector for this chunk (pgvector).')
          table.timestamp('created', { useTz: true }).notNullable().defaultTo(db.fn.now())
          table.timestamp('updated', { useTz: true })
          table.text('type').notNullable()
            .comment('Type identifier for this chunk embedding.')
        })
        .raw(`
          CREATE INDEX idx_chunk_embeddings_1536_cos
          ON chunk_embeddings_1536
          USING ivfflat (embedding vector_cosine_ops)
          WITH (lists = 100);
        `)
        .raw(`COMMENT ON TABLE chunk_embeddings_1536 IS 'Chunk embeddings (1536-d). Join to chunks by chunk_id.';`)
    })
}

exports.down = db => {
  return db.schema
    .raw(`DROP INDEX IF EXISTS idx_chunk_embeddings_1536_cos;`)
    .dropTableIfExists('chunk_embeddings_1536')
}
