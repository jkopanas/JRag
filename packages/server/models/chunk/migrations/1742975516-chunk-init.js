// Text chunks (retrieval units) with FTS support and ordering/overlap metadata.
exports.up = db => {
  return db.raw('CREATE EXTENSION IF NOT EXISTS vector;')
  .then(() => {
    return db.schema
    .createTable('chunks', table => {
      table.uuid('id').primary()
      table.text('type').notNullable()
      table.uuid('document_id').notNullable()
        .references('documents.id').onDelete('CASCADE')
        .comment('FK → documents; parent document.')
      table.uuid('collection_id').notNullable()
        .references('collections.id').onDelete('CASCADE')
        .comment('FK → collections; denormalized for fast scoping.')
      table.integer('chunk_index').notNullable()
        .comment('Sequential order within document (0..N).')
      table.text('text').notNullable()
        .comment('Normalized plaintext to feed into LLM.')
      table.integer('tokens').comment('Token count (optional bookkeeping).')
      table.integer('overlap_before').notNullable().defaultTo(0)
        .comment('Tokens overlapped from previous chunk.')
      table.integer('overlap_after').notNullable().defaultTo(0)
        .comment('Tokens overlapped into next chunk.')
      table.jsonb('section_path').comment('Heading hierarchy, e.g. {"5","5.2","Etymology"}.')
      table.integer('page_no').comment('Page number for PDFs, if available.')
      table.jsonb('meta').defaultTo('{}').notNullable().comment('Extra metadata: anchors, labels, etc.')
      table.specificType('tsv', 'tsvector')
        .comment('Full-text search vector for hybrid retrieval (BM25).')
      table.timestamp('created', { useTz: true }).notNullable().defaultTo(db.fn.now())
      table.timestamp('updated', { useTz: true })
    })
    .raw(`
      CREATE OR REPLACE FUNCTION chunks_tsv_update() RETURNS trigger AS $$
      BEGIN
        NEW.tsv := to_tsvector('english', NEW.text);
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
    `)
    .raw(`
      CREATE TRIGGER chunks_tsv_update_trg
      BEFORE INSERT OR UPDATE ON chunks
      FOR EACH ROW EXECUTE FUNCTION chunks_tsv_update();
    `)
    .raw(`CREATE INDEX idx_chunks_tsv ON chunks USING GIN (tsv);`)
    .raw(`COMMENT ON TABLE chunks IS 'Retrieval units with order/overlap, section path, and FTS.';`)
  })
}

exports.down = db => {
  return db.schema
    .raw(`DROP INDEX IF EXISTS idx_chunks_tsv;`)
    .raw(`DROP TRIGGER IF EXISTS chunks_tsv_update_trg ON chunks;`)
    .raw(`DROP FUNCTION IF EXISTS chunks_tsv_update;`)
    .dropTableIfExists('chunks')
}
