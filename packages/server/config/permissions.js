const {
  allow,
  deny,
  or,
  rule,
} = require('@coko/server/authorization')

const isAuthenticated = () => {
  const { authenticate } = require('@coko/service-auth')
  return authenticate
}

const isAdmin = rule({ cache: 'contextual' })(async (_, __, ctx) => {
  if (!ctx.userId) return false

  /* eslint-disable-next-line global-require */
  const { User } = require('@coko/server')

  return User.hasGlobalRole(ctx.userId, 'admin')
})

const isOneself = rule({ cache: 'strict' })(async (_, { id }, ctx) => {
  return id === ctx.userId
})

const canUpdatePassword = rule({ cache: 'strict' })(
  async (_, { input }, ctx) => {
    return input.id === ctx.userId
  },
)

module.exports = {
  Query: {
    // inherited
    currentUser: isAuthenticated,
    team: deny,
    teams: deny,
    user: or(isOneself, isAdmin),
    users: isAdmin,
    // GraphQL queries
    retrieve: isAuthenticated,
    getStrategies: isAuthenticated,
    documents: isAuthenticated,
    document: isAuthenticated,
    embeddingSpaces: isAuthenticated,
    defaultEmbeddingSpace: isAuthenticated,
    collections: isAuthenticated,
    collection: isAuthenticated,
    ingestJob: isAuthenticated,
  },
  Mutation: {
    // inherited
    activateUser: deny,
    activateUsers: deny,
    addTeamMember: deny,
    createOAuthIdentity: deny,
    deactivateUser: deny,
    deactivateUsers: deny,
    deleteUser: deny,
    deleteUsers: deny,
    login: allow,
    removeTeamMember: deny,
    resendVerificationEmail: allow,
    resetPassword: allow,
    sendPasswordResetEmail: allow,
    setDefaultIdentity: deny,
    signUp: allow,
    updatePassword: canUpdatePassword,
    updateTeamMembership: deny,
    updateUser: or(isOneself, isAdmin),
    verifyEmail: allow,
    // GraphQL mutations
    createCollection: isAuthenticated,
  },
  Subscription: {
    // inherited
    userUpdated: isAuthenticated,
    // GraphQL subscriptions
    documentProcessingUpdate: allow,
  },
}
