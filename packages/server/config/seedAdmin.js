module.exports = async () => {
  const {
    User,
    Identity,
    Team,
    TeamMember,
    useTransaction,
    logger,
    /* eslint-disable-next-line global-require */
  } = require('@coko/server')

  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    logger.info('No admin credentials in environment.')
    return
  }

  const adminTeam = await Team.findGlobalTeamByRole('admin')

  const existingAdmins = await TeamMember.find({
    teamId: adminTeam.id,
  })

  if (existingAdmins.totalCount > 0) {
    logger.info('An admin user already exists. Performing no further action.')
    return
  }

  await useTransaction(async trx => {
    const user = await User.insert(
      {
        username: 'admin',
        password: ADMIN_PASSWORD,
        agreedTc: true,
        isActive: true,
      },
      { trx },
    )

    await Identity.insert(
      {
        userId: user.id,
        email: ADMIN_EMAIL,
        isVerified: true,
        isDefault: true,
      },
      { trx },
    )

    await Team.addMemberToGlobalTeam(user.id, 'admin', { trx })
  })

  logger.info('Admin user successfully added.')
}
