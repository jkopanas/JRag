const modelComponents = require('../models/modelComponents')
const permissions = require('./permissions')
const seedDefaultEmbeddingSpace = require('./seedDefaultEmbeddingSpace')
const seedAdmin = require('./seedAdmin')

module.exports = {
  components: [
    '@coko/server/src/models/user',
    '@coko/server/src/models/identity',
    '@coko/server/src/models/team',
    '@coko/server/src/models/teamMember',
    '@coko/server/src/models/file',
    '@coko/service-auth',
    '@coko/service-auth/src/models/service-client',

    ...modelComponents,

    './api/graphql',
    './api/rest',
  ],
  onStartup: [
    {
      label: 'Seed admin',
      execute: seedAdmin,
    },
    {
      label: 'Seed default embedding space',
      execute: seedDefaultEmbeddingSpace,
    },
  ],
  permissions,
  teams: {
    global: [
      {
        role: 'admin',
        displayName: 'Admin',
      },
    ],
  },
  useGraphQLServer: true,
  useFileStorage: true,
}
