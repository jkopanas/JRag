// Source documents (files, URLs). Chunking/embedding produces child rows.
exports.up = db => {
  return db.schema
    .createTable('documents', table => {
      table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'))
      table.uuid('collection_id')
        .references('collections.id')
        .notNullable()
        .onDelete('CASCADE')
        .comment('FK → collections; document belongs to one collection.')
      table.string('source_uri').notNullable().comment('Original source (path, URL, S3 key).')
      table.string('mime').notNullable().comment('MIME type, e.g. application/pdf, text/markdown.')
      table.string('language').comment('Detected/declared language, e.g. "en", "el".')
      table.jsonb('meta').comment('Arbitrary JSON metadata: title, tags, author, etc.')
      table.string('status').defaultTo('QUEUED').comment('Processing status: QUEUED, PROCESSING, COMPLETED, FAILED')
      table.timestamp('processing_started_at', { useTz: true }).comment('When embedding processing started')
      table.timestamp('processing_completed_at', { useTz: true }).comment('When embedding processing completed')
      table.timestamp('processing_failed_at', { useTz: true }).comment('When embedding processing failed')
      table.text('error').comment('Error message if processing failed')
      table.integer('chunks_inserted').comment('Number of chunks created during processing')
      table.integer('embeddings_inserted').comment('Number of embeddings created during processing')
      table.timestamp('created', { useTz: true }).notNullable().defaultTo(db.fn.now())
      table.timestamp('updated', { useTz: true })
      table.text('type').notNullable()
        .comment('Type identifier for this document.')
    })
    .raw(`COMMENT ON TABLE documents IS 'Source-level records. Parsing produces child chunks.';`)
}

exports.down = db => {
  return db.schema.dropTableIfExists('documents')
}
