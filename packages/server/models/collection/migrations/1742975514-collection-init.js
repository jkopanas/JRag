// User-created buckets tied to an embedding_space. Enforces one model/dim/metric per collection.
exports.up = db => {
  return db.schema
    .createTable('collections', table => {
      table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'))
      table.timestamp('created', { useTz: true }).notNullable().defaultTo(db.fn.now())
      table.timestamp('updated', { useTz: true })
      table.uuid('user_id').notNullable()
        .comment('Tenant/workspace owner (multi-tenant).')
      table.string('name').notNullable()
        .comment('Collection name (unique per tenant).')
      table.text('description').comment('Optional description shown in UI.')
      table.uuid('embedding_space_id').notNullable()
        .references('embedding_spaces.id')
        .comment('FK → embedding_spaces; pins model/dim/metric.')
      table.boolean('is_system').notNullable().defaultTo(false)
        .comment('True if created by dev/ops.')
      table.text('type').notNullable()
        .comment('Type identifier for this collection.')
      table.unique(['user_id', 'name'])
    })
    .raw(`COMMENT ON TABLE collections IS 'User buckets; all docs/chunks here share one embedding_space.';`)
}

exports.down = db => {
  return db.schema.dropTableIfExists('collections')
}
