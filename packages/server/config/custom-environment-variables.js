module.exports = {
  secret: 'SECRET',
  db: {
    host: 'POSTGRES_HOST',
    port: 'POSTGRES_PORT',
    database: 'POSTGRES_DB',
    user: 'POSTGRES_USER',
    password: 'POSTGRES_PASSWORD',
    allowSelfSignedCertificates: {
      __name: 'POSTGRES_ALLOW_SELF_SIGNED_CERTIFICATES',
      __format: 'json',
    },
    caCert: 'POSTGRES_CA_CERT',
  },
  subscriptionsDb: {
    host: 'SUBSCRIPTIONS_POSTGRES_HOST',
    port: 'SUBSCRIPTIONS_POSTGRES_PORT',
    database: 'SUBSCRIPTIONS_POSTGRES_DB',
    user: 'SUBSCRIPTIONS_POSTGRES_USER',
    password: 'SUBSCRIPTIONS_POSTGRES_PASSWORD',
    allowSelfSignedCertificates: {
      __name: 'SUBSCRIPTIONS_POSTGRES_ALLOW_SELF_SIGNED_CERTIFICATES',
      __format: 'json',
    },
    caCert: 'SUBSCRIPTIONS_POSTGRES_CA_CERT',
  },

  port: 'SERVER_PORT',
  serverUrl: 'SERVER_URL',
  clientUrl: 'CLIENT_URL',
  corsOrigin: 'CORS_ORIGIN',

  openAiApiKey: 'OPEN_AI_API_KEY',
  fileStorage: {
    accessKeyId: 'S3_ACCESS_KEY_ID',
    secretAccessKey: 'S3_SECRET_ACCESS_KEY',
    bucket: 'S3_BUCKET',
    url: 'S3_URL',
    region: 'S3_REGION',
  },
  mailer: {
    from: 'MAILER_SENDER',
    transport: {
      host: 'MAILER_HOSTNAME',
      port: 'MAILER_PORT',
      auth: {
        user: 'MAILER_USER',
        pass: 'MAILER_PASSWORD',
      },
    },
  },
}
