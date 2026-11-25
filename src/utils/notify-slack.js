/**
 * Post a release announcement to a Slack incoming webhook.
 *
 * The message matches the one the "Notify Slack on Release" GitHub workflow posted: a title line, the
 * release notes, and a link to the release.
 *
 * @since [version]
 *
 * @param {Object} args         Arguments.
 * @param {string} args.url     Slack incoming webhook URL.
 * @param {string} args.project Project slug, e.g. "my-plugin".
 * @param {string} args.version Version released.
 * @param {string} args.notes   Release notes.
 * @param {string} [args.link]  URL of the release, such as the GitHub release or the plugin's WordPress.org page.
 * @return {Promise<void>} Resolves once Slack accepts the message.
 */
async function notifySlack( { url, project, version, notes, link = '' } ) {
	const attachments = [ { title: 'Release Notes', text: notes } ];

	if ( link ) {
		attachments.push( { title: 'Link to Release', text: link } );
	}

	const res = await fetch( url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( { text: `New release published: ${ project } ${ version }`, attachments } ),
	} );

	if ( ! res.ok ) {
		throw new Error( `Slack responded with HTTP ${ res.status }: ${ ( await res.text() ).slice( 0, 200 ) }` );
	}
}

module.exports = notifySlack;
