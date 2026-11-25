const
	fs = require( 'fs' ),
	os = require( 'os' ),
	path = require( 'path' ),
	{ options, action } = require( '../../src/cmds/update-version' );

// The command's default option values, keyed by option name.
const defaults = Object.fromEntries(
	options
		.filter( ( opt ) => undefined !== opt[ 2 ] )
		.map( ( [ flags, , value ] ) => [ flags.match( /--([\w-]+)/ )[ 1 ].replace( /-(\w)/g, ( m, c ) => c.toUpperCase() ), value ] )
);

describe( 'update-version', () => {
	let cwd, dir;

	beforeEach( () => {
		cwd = process.cwd();
		dir = fs.mkdtempSync( path.join( os.tmpdir(), 'bh-dev-update-version-' ) );
		fs.mkdirSync( path.join( dir, 'includes' ) );
		fs.writeFileSync( path.join( dir, 'includes', 'feature.php' ), '<?php\n/**\n * @since [version]\n */\n' );
		fs.writeFileSync( path.join( dir, 'AGENTS.md' ), 'Docblocks use `@since [version]`.\n' );
		process.chdir( dir );
		jest.spyOn( console, 'log' ).mockImplementation( () => {} );
	} );

	afterEach( () => {
		process.chdir( cwd );
		fs.rmSync( dir, { recursive: true, force: true } );
		jest.restoreAllMocks();
	} );

	it( 'replaces [version] in code but not in Markdown files', () => {
		action( {
			...defaults,
			replacements: JSON.parse( JSON.stringify( defaults.replacements ) ),
			force: '1.2.0',
			skipConfig: true,
		} );

		expect( fs.readFileSync( path.join( dir, 'includes', 'feature.php' ), 'utf8' ) ).toContain( '@since 1.2.0' );
		expect( fs.readFileSync( path.join( dir, 'AGENTS.md' ), 'utf8' ) ).toBe( 'Docblocks use `@since [version]`.\n' );
	} );
} );
