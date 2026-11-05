const
	path = require( 'path' ),
	{ existsSync, writeFileSync } = require( 'fs' ),
	chalk = require( 'chalk' ),
	inquirer = require( 'inquirer' ),
	{ getCurrentVersion, getChangelogForVersion, getArchiveFilename, logResult, checkEddDownload, publishToEdd, pushDistFile, execSync } = require( '../../utils' );

/**
 * Retrieve the release notes for a version: its changelog entry with a version and date header.
 *
 * @since [version]
 *
 * @param {string} version Semver string for the version being published.
 * @param {string} logfile Path to the the changelog file.
 * @return {string} The release notes.
 */
function getReleaseNotes( version, logfile ) {
	const { date, logs } = getChangelogForVersion( version, logfile );

	let header = `v${ version } - ${ date }`;
	header = `${ header }\n${ '-'.repeat( header.length ) }`;

	return `${ header }\n\n${ logs }`;
}

/**
 * Create a temporary changelog file used to add the changelog to the GitHub release.
 *
 * @since 0.0.1
 * @since [version] Accepts the release notes instead of a version and changelog file.
 *
 * @param {string} notes Release notes.
 * @return {string} Path to the temporary notes file.
 */
function writeTempNotesFile( notes ) {
	const tmpFile = path.join( process.cwd(), 'tmp', 'release-notes.txt' );

	writeFileSync( tmpFile, notes );

	return tmpFile;
}


module.exports = {
	command: 'create',
	description: 'Create a GitHub release and tag from a specified file or branch.',
	options: [
		[ '-a, --archive <zip>', 'If specified, the zip file will be committed and force-pushed to the specified branch before creating the release. Pass --no-archive to skip this step.', getArchiveFilename() ],
		[ '-A, --no-archive', 'Skip creation from an archive file and use the target --branch for release creation.' ],
		[ '-c, --commit-message <message>', 'Customize the commit message used when pushing to the target branch. Used only when releasing from an archive. The placeholder "%s" is replaced with the release version.', 'Release v%s [ci skip]' ],
		[ '-d, --dir <directory>', 'Directory where distribution files are stored.', 'dist' ],
		[ '-b, --branch <branch>', 'Target branch to use when creating the release.', 'release' ],
		[ '-l, --logfile <file>', 'Specify the changelog file.', 'CHANGELOG.md' ],
		[ '-p, --prerelease', 'Mark the GitHub release as a prerelease and skip merging.' ],
		[ '-P, --prerelease-branch <branch>', 'When creating a prerelease, use this branch as the target branch in favor of the default branch specified via the --branch option.', 'prerelease' ],
		[ '-D, --draft', 'Create the release as an unpublished draft and skip merging.' ],
		[ '-M, --merge <branch>', 'Merge open PRs on the specified branch before creating the release. If publishing a prerelease, or draft merging is automatically disabled as if passing "--no-merge".', '' ],
		[ '-n, --no-merge', 'Disable merging before release creation. Automatically passed when publishing a prerelease.' ],
		[ '-e, --edd-download-id <id>', 'Easy Digital Downloads download ID. When set, the archive and release notes are also published to the EDD store after the GitHub release is created. Usually set per project in .llmsdev.yml. The store endpoint URL and secret are read from the EDD_RELEASE_URL and EDD_RELEASE_SECRET environment variables. Prereleases and drafts are not published to the store.' ],
		[ '-E, --no-edd', 'Skip publishing to the EDD store even when --edd-download-id is set.' ],
		[ '-Y, --yes', 'Skip confirmations.' ],
		[ '-v, --verbose', 'Output extra information with result messages.' ],
	],
	/**
	 * The `create` command.
	 *
	 * @since 0.0.1
	 * @since 0.2.1 Windows compatibility: account for spaces in file paths.
	 * @since [version] Publish the release to an Easy Digital Downloads store when `--edd-download-id` is set.
	 *
	 * @return {void}
	 */
	action: async ( { archive, dir, commitMessage, branch, logfile, prerelease, prereleaseBranch, draft, merge, eddDownloadId, edd, yes, verbose } ) => {
		// Ensure the CLI is installed before proceeding.
		try {
			execSync( 'which gh', true );
		} catch ( Error ) {
			logResult( 'The GitHub CLI client "gh" must be installed to use this command.', 'error' );
			process.exit( 1 );
		}

		// If there's untracked files or the working tree is dirty.
		if ( execSync( 'git status -s', true ) ) {
			logResult( 'The working tree must be clean before publishing.', 'error' );
			process.exit( 1 );
		}

		if ( archive ) {
			archive = path.join( dir, archive );

			if ( ! existsSync( archive ) ) {
				logResult( `The distribution file ${ chalk.bold( archive ) } doesn't exist.`, 'error' );
				process.exit( 1 );
			}
		}

		const version = getCurrentVersion();

		commitMessage = commitMessage.replace( '%s', version );

		// Use the prerelease branch when publishing a prerelease.
		if ( prerelease ) {
			branch = prereleaseBranch;
			merge = false;
		}

		// Disable merging if publishing a draft.
		if ( draft ) {
			merge = false;
		}

		// Publish to the EDD store only when configured, not skipped, and releasing a published, stable version.
		if ( ! edd || ! eddDownloadId ) {
			eddDownloadId = '';
		} else if ( prerelease || draft ) {
			logResult( `Not publishing a ${ prerelease ? 'prerelease' : 'draft' } to the EDD store.`, 'warning' );
			eddDownloadId = '';
		} else {
			const missing = [ 'EDD_RELEASE_URL', 'EDD_RELEASE_SECRET' ].filter( ( name ) => ! process.env[ name ] );
			if ( missing.length ) {
				logResult( `Publishing to the EDD store requires the ${ missing.join( ' and ' ) } environment variable${ missing.length > 1 ? 's' : '' }. Pass --no-edd to skip it.`, 'error' );
				process.exit( 1 );
			}
			if ( ! archive ) {
				logResult( 'Publishing to the EDD store requires an archive. Pass --no-edd to skip it.', 'error' );
				process.exit( 1 );
			}
			if ( 'function' !== typeof fetch ) {
				logResult( 'Publishing to the EDD store requires Node.js 18 or later. Pass --no-edd to skip it.', 'error' );
				process.exit( 1 );
			}
		}

		// Check the store accepts the secret and has the download before pushing or releasing anything.
		let eddVersion = '';
		if ( eddDownloadId ) {
			try {
				( { version: eddVersion } = await checkEddDownload( { url: process.env.EDD_RELEASE_URL, secret: process.env.EDD_RELEASE_SECRET, downloadId: eddDownloadId } ) );
			} catch ( err ) {
				logResult( `Could not reach EDD download ${ chalk.bold( eddDownloadId ) } on the store. Nothing was released. ${ err.message }`, 'error' );
				process.exit( 1 );
			}
		}

		// Output information and confirm the release (unless `--yes` is passed);
		if ( ! yes ) {
			logResult( `About to publish a new ${ prerelease ? 'prerelease' : 'release' }${ draft ? ' (draft)' : '' }:`, 'warning' );
			logResult( `${ chalk.bold( version ) }`, ' + Version' );
			if ( archive ) {
				logResult( `${ chalk.bold( archive ) }`, ' + Archive' );
			}
			logResult( `${ chalk.bold( branch ) }`, ' + Branch' );
			if ( merge ) {
				logResult( `${ chalk.bold( merge ) }`, ' + Merge from branch' );
			}
			if ( eddDownloadId ) {
				logResult( `${ chalk.bold( eddDownloadId ) } (store version: ${ eddVersion || 'none' })`, ' + EDD download' );
			}

			yes = await inquirer.prompt( [ {
				type: 'expand',
				message: 'Are you sure you wish to proceed?',
				name: 'yes',
				choices: [
					{
						key: 'y',
						name: 'Yes',
						value: true,
					},
					{
						key: 'n',
						name: 'No',
						value: false,
					},
				],
			} ] )
				.then( ( answers ) => answers.yes )
				.catch( ( err ) => console.log( err ) );
		}

		if ( ! yes ) {
			logResult( 'Release aborted.', 'error' );
			process.exit( 1 );
		}

		logResult( `Releasing version ${ chalk.bold( version ) } to the ${ chalk.bold( branch ) } branch.` );

		// Push the distfile to the release branch.
		if ( archive ) {
			pushDistFile( archive, branch, commitMessage, ! verbose );
		}

		// Merge open PRs against the specified branch.
		if ( merge ) {
			execSync( `gh pr merge ${ merge } --merge`, true );
		}

		// Setup the release to pass to the GH CLI.
		const
			notes = getReleaseNotes( version, logfile ),
			notesFile = writeTempNotesFile( notes ),
			createArgs = [];

		if ( archive ) {
			createArgs.push( archive );
		}

		createArgs.push( `--title "Version ${ version }"` );
		createArgs.push( `--target ${ branch }` );
		createArgs.push( `--notes-file "${ notesFile }"` );

		if ( draft ) {
			createArgs.push( '--draft' );
		}

		if ( prerelease ) {
			createArgs.push( '--prerelease' );
		}

		// Create the release.
		const res = execSync( `gh release create ${ version } ${ createArgs.join( ' ' ) }`, true );
		logResult( `Release v${ chalk.bold( version ) } published. Permalink: ${ chalk.underline( res ) }.` );

		// Cleanup the tmp notesfile.
		execSync( `rm "${ notesFile }"` );

		// Publish the archive and release notes to the EDD store.
		if ( eddDownloadId ) {
			try {
				const { file } = await publishToEdd( {
					url: process.env.EDD_RELEASE_URL,
					secret: process.env.EDD_RELEASE_SECRET,
					downloadId: eddDownloadId,
					version,
					changelog: notes,
					file: archive,
				} );
				logResult( `Version ${ chalk.bold( version ) } published to EDD download ${ chalk.bold( eddDownloadId ) }: ${ file }.`, 'success' );
			} catch ( err ) {
				logResult( `The GitHub release was created but publishing to the EDD store failed. ${ err.message }`, 'error' );
				process.exit( 1 );
			}
		}
	},
};
