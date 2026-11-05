const
	{ basename } = require( 'path' ),
	{ readFileSync } = require( 'fs' );

/**
 * Send a request to an Easy Digital Downloads store's release endpoint (the "EDD Release Endpoint" mu-plugin).
 *
 * @since [version]
 *
 * @param {string}   url    Full URL of the store's release endpoint.
 * @param {string}   secret Shared secret sent in the `X-EDD-Release-Secret` header.
 * @param {Object}   opts   Additional options passed to `fetch()`.
 * @return {Promise<Object>} The endpoint's JSON response.
 */
async function request( url, secret, opts = {} ) {
	const res = await fetch( url, { ...opts, headers: { 'X-EDD-Release-Secret': secret } } ),
		text = await res.text();

	let data = null;
	try {
		data = JSON.parse( text );
	} catch ( e ) {}

	// A non-JSON response, even with a 200 status, means the URL doesn't point at the endpoint.
	if ( ! res.ok || ! data ) {
		throw new Error( `The store responded with HTTP ${ res.status }: ${ data?.message || text.slice( 0, 500 ) }` );
	}

	return data;
}

/**
 * Check that the store accepts the secret and has the download, before anything is released.
 *
 * @since [version]
 *
 * @param {Object} args            Arguments.
 * @param {string} args.url        Full URL of the store's release endpoint.
 * @param {string} args.secret     Shared secret.
 * @param {string} args.downloadId EDD download ID.
 * @return {Promise<Object>} The download's ID and current Software Licensing version.
 */
function checkEddDownload( { url, secret, downloadId } ) {
	const checkUrl = new URL( url );
	checkUrl.searchParams.set( 'download_id', String( downloadId ) );

	return request( checkUrl.toString(), secret );
}

/**
 * Publish a release to an Easy Digital Downloads store.
 *
 * Uploads the distribution zip, version, and changelog to the store's release endpoint,
 * which replaces the download's file and its Software Licensing version and changelog.
 *
 * @since [version]
 *
 * @param {Object} args            Arguments.
 * @param {string} args.url        Full URL of the store's release endpoint.
 * @param {string} args.secret     Shared secret.
 * @param {string} args.downloadId EDD download ID.
 * @param {string} args.version    Version being released.
 * @param {string} args.changelog  Release notes for the version.
 * @param {string} args.file       Path to the distribution zip.
 * @return {Promise<Object>} The endpoint's JSON response.
 */
function publishToEdd( { url, secret, downloadId, version, changelog, file } ) {
	const body = new FormData();
	body.append( 'download_id', String( downloadId ) );
	body.append( 'version', version );
	body.append( 'changelog', changelog );
	body.append( 'file', new Blob( [ readFileSync( file ) ], { type: 'application/zip' } ), basename( file ) );

	return request( url, secret, { method: 'POST', body } );
}

module.exports = {
	checkEddDownload,
	publishToEdd,
};
