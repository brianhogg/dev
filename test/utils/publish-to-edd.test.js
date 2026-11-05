const
	{ mkdtempSync, writeFileSync } = require( 'fs' ),
	{ tmpdir } = require( 'os' ),
	path = require( 'path' ),
	{ checkEddDownload, publishToEdd } = require( '../../src/utils' );

describe( 'publishToEdd', () => {
	const
		zip = path.join( mkdtempSync( path.join( tmpdir(), 'bh-dev-' ) ), 'my-plugin-1.2.3.zip' ),
		zipBytes = Buffer.from( [ 0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x0a, 0x0d ] ),
		args = {
			url: 'https://store.test/wp-json/edd-release/v1/publish',
			secret: 's3cret',
			downloadId: 42,
			version: '1.2.3',
			changelog: 'v1.2.3 - 2026-11-05\n-------------------\n\n+ Fixed a bug.',
			file: zip,
		};

	writeFileSync( zip, zipBytes );

	const mockResponse = ( status, text ) => ( { ok: status >= 200 && status < 300, status, text: async () => text } );

	afterEach( () => {
		delete global.fetch;
	} );

	it( 'should check the download with a GET request carrying the secret header', async () => {
		global.fetch = jest.fn().mockResolvedValue( mockResponse( 200, '{"download_id":42,"version":"1.2.2"}' ) );

		await expect( checkEddDownload( args ) ).resolves.toStrictEqual( { download_id: 42, version: '1.2.2' } );

		const [ url, { method, headers } ] = global.fetch.mock.calls[ 0 ];
		expect( url ).toBe( 'https://store.test/wp-json/edd-release/v1/publish?download_id=42' );
		expect( method ).toBeUndefined();
		expect( headers ).toStrictEqual( { 'X-EDD-Release-Secret': 's3cret' } );
	} );

	it( 'should keep existing query arguments, such as ?rest_route=, when checking the download', async () => {
		global.fetch = jest.fn().mockResolvedValue( mockResponse( 200, '{}' ) );

		await checkEddDownload( { ...args, url: 'https://store.test/?rest_route=/edd-release/v1/publish' } );

		expect( global.fetch.mock.calls[ 0 ][ 0 ] ).toBe( 'https://store.test/?rest_route=%2Fedd-release%2Fv1%2Fpublish&download_id=42' );
	} );

	it( 'should reject the check with the store\'s error message', async () => {
		global.fetch = jest.fn().mockResolvedValue( mockResponse( 404, '{"code":"edd_release_invalid_download","message":"Download 42 does not exist."}' ) );

		await expect( checkEddDownload( args ) ).rejects.toThrow( 'The store responded with HTTP 404: Download 42 does not exist.' );
	} );

	it( 'should upload the zip, version, changelog, and download ID with the secret header', async () => {
		global.fetch = jest.fn().mockResolvedValue( mockResponse( 200, '{"version":"1.2.3","file":"https://store.test/f.zip"}' ) );

		await expect( publishToEdd( args ) ).resolves.toStrictEqual( { version: '1.2.3', file: 'https://store.test/f.zip' } );

		const [ url, { method, headers, body } ] = global.fetch.mock.calls[ 0 ];
		expect( url ).toBe( args.url );
		expect( method ).toBe( 'POST' );
		expect( headers ).toStrictEqual( { 'X-EDD-Release-Secret': 's3cret' } );
		expect( body.get( 'download_id' ) ).toBe( '42' );
		expect( body.get( 'version' ) ).toBe( '1.2.3' );
		expect( body.get( 'changelog' ) ).toBe( args.changelog );
		expect( body.get( 'file' ).name ).toBe( 'my-plugin-1.2.3.zip' );
		expect( Buffer.from( await body.get( 'file' ).arrayBuffer() ) ).toStrictEqual( zipBytes );
	} );

	it( 'should reject with the store\'s error message when the request fails', async () => {
		global.fetch = jest.fn().mockResolvedValue( mockResponse( 403, '{"code":"edd_release_forbidden","message":"Invalid or missing release secret."}' ) );

		await expect( publishToEdd( args ) ).rejects.toThrow( 'The store responded with HTTP 403: Invalid or missing release secret.' );
	} );

	it( 'should reject with the response body when the store does not return JSON', async () => {
		global.fetch = jest.fn().mockResolvedValue( mockResponse( 502, '<html>Bad Gateway</html>' ) );

		await expect( publishToEdd( args ) ).rejects.toThrow( 'The store responded with HTTP 502: <html>Bad Gateway</html>' );
	} );

	it( 'should reject a 200 response that is not JSON, such as a URL that is not the endpoint', async () => {
		global.fetch = jest.fn().mockResolvedValue( mockResponse( 200, '<html>Home page</html>' ) );

		await expect( publishToEdd( args ) ).rejects.toThrow( 'The store responded with HTTP 200: <html>Home page</html>' );
	} );
} );
