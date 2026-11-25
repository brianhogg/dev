const
	chalk = require( 'chalk' ),
	{ getCurrentVersion, getProjectSlug, logResult, notifySlack } = require( '../../utils' ),
	{ getReleaseNotes } = require( './create' );

module.exports = {
	command: 'notify',
	description: 'Announce a published release in Slack, with its changelog entry. `release create` does this itself; use this for releases published another way, such as to WordPress.org, or to retry. The webhook URL is read from the SLACK_WEBHOOK_URL environment variable.',
	options: [
		[ '-r, --release-version <version>', 'Version to announce. Defaults to the current version.' ],
		[ '-u, --url <url>', 'Link to the release, such as the plugin\'s WordPress.org page or the GitHub release.' ],
		[ '-l, --logfile <file>', 'Specify the changelog file.', 'CHANGELOG.md' ],
	],
	/**
	 * The `notify` command.
	 *
	 * @since [version]
	 *
	 * @return {Promise<void>}
	 */
	action: async ( { releaseVersion, url, logfile } ) => {
		if ( ! process.env.SLACK_WEBHOOK_URL ) {
			logResult( 'Set the SLACK_WEBHOOK_URL environment variable to the Slack incoming webhook URL.', 'error' );
			process.exit( 1 );
		}

		const version = releaseVersion || getCurrentVersion();

		try {
			await notifySlack( { url: process.env.SLACK_WEBHOOK_URL, project: getProjectSlug(), version, notes: getReleaseNotes( version, logfile ), link: url } );
		} catch ( err ) {
			logResult( `The Slack announcement failed. ${ err.message }`, 'error' );
			process.exit( 1 );
		}

		logResult( `Version ${ chalk.bold( version ) } announced in Slack.`, 'success' );
	},
};
