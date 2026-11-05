const
	{ mkdtempSync, writeFileSync } = require( 'fs' ),
	{ tmpdir } = require( 'os' ),
	path = require( 'path' ),
	semver = require( 'semver' ),
	{ parseChangelogFile } = require( '../../src/utils' );

describe( 'parseChangelogFile', () => {
	it( 'should parse the changelog file', () => {
		const parsed = parseChangelogFile( process.cwd() + '/CHANGELOG.md' );

		parsed.forEach( ( { date, version, logs } ) => {
			// Valid version.
			expect( semver.valid( version ) ).toStrictEqual( version );

			// Valid date.
			expect( Date.parse( date ) ).not.toBeNaN();

			// Should be a string.
			expect( typeof logs ).toStrictEqual( 'string' );
		} );
	} );

	it.each( [
		[ 'a title, underline, and blank line', 'My Plugin CHANGELOG\n==================\n\n' ],
		[ 'a title and underline without a blank line', 'My Plugin CHANGELOG\n==================\n' ],
		[ 'leading blank lines and no title', '\n\n' ],
		[ 'no title', '' ],
	] )( 'should parse every version when the file starts with %s', ( desc, preamble ) => {
		const file = path.join( mkdtempSync( path.join( tmpdir(), 'bh-dev-' ) ), 'CHANGELOG.md' );
		writeFileSync( file, `${ preamble }v1.1.0 - 2026-11-05\n-------------------\n\n##### Bug Fixes\n\n+ Fixed a bug.\n\n\nv1.0.0 - 2026-10-01\n-------------------\n\n+ Initial release.\n` );

		expect( parseChangelogFile( file ) ).toStrictEqual( [
			{ version: '1.1.0', date: '2026-11-05', logs: '##### Bug Fixes\n\n+ Fixed a bug.' },
			{ version: '1.0.0', date: '2026-10-01', logs: '+ Initial release.' },
		] );
	} );
} );
