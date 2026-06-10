const { commitizen } = require('@coko/lint')

commitizen.scopes = ['client', 'ui', 'api', 'models', '*']

module.exports = commitizen
