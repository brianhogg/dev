const
	fs = require( 'fs' ),
	utils = require( '../../../src/utils' ),
	{ action } = require( '../../../src/cmds/release/create' );

jest.mock( 'fs', () => ( {
	...jest.requireActual( 'fs' ),
	existsSync: jest.fn( () => true ),
	writeFileSync: jest.fn(),
} ) );

jest.mock( '../../../src/utils', () => ( {
	...jest.requireActual( '../../../src/utils' ),
	execSync: jest.fn(),
	getChangelogForVersion: jest.fn( () => ( { date: '2026-11-05', logs: '+ Fixed a bug.' } ) ),
	getCurrentVersion: jest.fn( () => '1.2.3' ),
	logResult: jest.fn(),
	checkEddDownload: jest.fn(),
	publishToEdd: jest.fn(),
	pushDistFile: jest.fn(),
} ) );

const NOTES = 'v1.2.3 - 2026-11-05\n-------------------\n\n+ Fixed a bug.';

// Every step the command takes that reaches outside the process, in order.
let steps;

/**
 * Run the `release create` action with the options of `bh-dev release create -n -Y`, merged with `opts`.
 *
 * @param {Object} opts Options to override.
 * @return {Promise} Resolves when the action completes.
 */
function run( opts = {} ) {
	return action( {
		archive: 'my-plugin-1.2.3.zip',
		dir: 'dist',
		commitMessage: 'Release v%s [ci skip]',
		branch: 'release',
		logfile: 'CHANGELOG.md',
		prereleaseBranch: 'prerelease',
		merge: false,
		edd: true,
		yes: true,
		...opts,
	} );
}

describe( 'release create', () => {
	const env = process.env;

	beforeEach( () => {
		jest.clearAllMocks();
		steps = [];
		process.env = { ...env, EDD_RELEASE_URL: 'https://store.test/wp-json/edd-release/v1/publish', EDD_RELEASE_SECRET: 's3cret' };

		utils.execSync.mockImplementation( ( cmd ) => {
			steps.push( cmd );
			return cmd.startsWith( 'gh release create' ) ? 'https://github.com/o/r/releases/tag/1.2.3' : '';
		} );
		utils.pushDistFile.mockImplementation( () => steps.push( 'pushDistFile' ) );
		utils.checkEddDownload.mockImplementation( async () => {
			steps.push( 'checkEddDownload' );
			return { download_id: 42, version: '1.2.2' };
		} );
		utils.publishToEdd.mockImplementation( async () => {
			steps.push( 'publishToEdd' );
			return { file: 'https://store.test/f.zip' };
		} );
		jest.spyOn( process, 'exit' ).mockImplementation( ( code ) => {
			throw new Error( `exit ${ code }` );
		} );
	} );

	afterEach( () => {
		process.env = env;
		process.exit.mockRestore();
	} );

	it( 'should not publish to EDD when no download ID is configured', async () => {
		// The store's environment variables are set but must not matter.
		await run();

		expect( utils.checkEddDownload ).not.toHaveBeenCalled();
		expect( utils.publishToEdd ).not.toHaveBeenCalled();
		expect( steps ).toStrictEqual( [
			'which gh',
			'git status -s',
			'pushDistFile',
			expect.stringMatching( /^gh release create 1\.2\.3 dist\/my-plugin-1\.2\.3\.zip --title "Version 1\.2\.3" --target release --notes-file ".+release-notes\.txt"$/ ),
			expect.stringMatching( /^rm ".+release-notes\.txt"$/ ),
		] );
	} );

	it( 'should not require the EDD environment variables when no download ID is configured', async () => {
		process.env = { ...env };
		delete process.env.EDD_RELEASE_URL;
		delete process.env.EDD_RELEASE_SECRET;

		await run();

		expect( steps ).toContainEqual( expect.stringMatching( /^gh release create / ) );
	} );

	it( 'should check the EDD download before pushing and publish the archive and GitHub release notes after creating the release', async () => {
		await run( { eddDownloadId: '42' } );

		expect( steps.slice( 0, 4 ) ).toStrictEqual( [ 'which gh', 'git status -s', 'checkEddDownload', 'pushDistFile' ] );
		expect( utils.checkEddDownload ).toHaveBeenCalledWith( {
			url: 'https://store.test/wp-json/edd-release/v1/publish',
			secret: 's3cret',
			downloadId: '42',
		} );

		expect( steps.slice( -3 ) ).toStrictEqual( [
			expect.stringMatching( /^gh release create / ),
			expect.stringMatching( /^rm / ),
			'publishToEdd',
		] );
		expect( fs.writeFileSync ).toHaveBeenCalledWith( expect.stringMatching( /release-notes\.txt$/ ), NOTES );
		expect( utils.publishToEdd ).toHaveBeenCalledWith( {
			url: 'https://store.test/wp-json/edd-release/v1/publish',
			secret: 's3cret',
			downloadId: '42',
			version: '1.2.3',
			changelog: NOTES,
			file: 'dist/my-plugin-1.2.3.zip',
		} );
	} );

	it.each( [
		[ '--no-edd', { edd: false } ],
		[ '--prerelease', { prerelease: true } ],
		[ '--draft', { draft: true } ],
	] )( 'should skip publishing to EDD with %s', async ( flag, opts ) => {
		await run( { eddDownloadId: '42', ...opts } );

		expect( utils.checkEddDownload ).not.toHaveBeenCalled();
		expect( utils.publishToEdd ).not.toHaveBeenCalled();
		expect( steps ).toContainEqual( expect.stringMatching( /^gh release create / ) );
	} );

	it.each( [ 'EDD_RELEASE_URL', 'EDD_RELEASE_SECRET' ] )( 'should exit before releasing anything when %s is missing', async ( name ) => {
		delete process.env[ name ];

		await expect( run( { eddDownloadId: '42' } ) ).rejects.toThrow( 'exit 1' );
		expect( steps ).toStrictEqual( [ 'which gh', 'git status -s' ] );
	} );

	it( 'should exit before releasing anything when there is no archive to publish', async () => {
		await expect( run( { eddDownloadId: '42', archive: false } ) ).rejects.toThrow( 'exit 1' );
		expect( steps ).toStrictEqual( [ 'which gh', 'git status -s' ] );
	} );

	it( 'should exit before releasing anything when the store rejects the check', async () => {
		utils.checkEddDownload.mockRejectedValue( new Error( 'The store responded with HTTP 403: Invalid or missing release secret.' ) );

		await expect( run( { eddDownloadId: '42' } ) ).rejects.toThrow( 'exit 1' );
		expect( steps ).toStrictEqual( [ 'which gh', 'git status -s' ] );
		expect( utils.logResult ).toHaveBeenLastCalledWith( expect.stringContaining( 'Nothing was released.' ), 'error' );
	} );

	it( 'should exit with an error when publishing to EDD fails', async () => {
		utils.publishToEdd.mockRejectedValue( new Error( 'The store responded with HTTP 403: Invalid or missing release secret.' ) );

		await expect( run( { eddDownloadId: '42' } ) ).rejects.toThrow( 'exit 1' );
		expect( utils.logResult ).toHaveBeenLastCalledWith( expect.stringContaining( 'HTTP 403: Invalid or missing release secret.' ), 'error' );
	} );
} );
