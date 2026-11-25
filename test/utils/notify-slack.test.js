const { notifySlack } = require( '../../src/utils' );

describe( 'notifySlack', () => {
	const args = {
		url: 'https://hooks.slack.test/abc',
		project: 'my-plugin',
		version: '1.2.3',
		notes: 'v1.2.3 - 2026-11-05\n-------------------\n\n+ Fixed a bug.',
		link: 'https://github.com/o/r/releases/tag/1.2.3',
	};

	afterEach( () => {
		delete global.fetch;
	} );

	it( 'should post the title, notes and link as JSON to the webhook', async () => {
		global.fetch = jest.fn().mockResolvedValue( { ok: true, status: 200, text: async () => 'ok' } );

		await notifySlack( args );

		const [ url, { method, headers, body } ] = global.fetch.mock.calls[ 0 ];
		expect( url ).toBe( 'https://hooks.slack.test/abc' );
		expect( method ).toBe( 'POST' );
		expect( headers ).toStrictEqual( { 'Content-Type': 'application/json' } );
		expect( JSON.parse( body ) ).toStrictEqual( {
			text: 'New release published: my-plugin 1.2.3',
			attachments: [
				{ title: 'Release Notes', text: args.notes },
				{ title: 'Link to Release', text: args.link },
			],
		} );
	} );

	it( 'should leave out the link when there is none', async () => {
		global.fetch = jest.fn().mockResolvedValue( { ok: true, status: 200, text: async () => 'ok' } );

		await notifySlack( { ...args, link: '' } );

		expect( JSON.parse( global.fetch.mock.calls[ 0 ][ 1 ].body ).attachments ).toHaveLength( 1 );
	} );

	it( 'should reject when Slack does not accept the message', async () => {
		global.fetch = jest.fn().mockResolvedValue( { ok: false, status: 404, text: async () => 'no_service' } );

		await expect( notifySlack( args ) ).rejects.toThrow( 'Slack responded with HTTP 404: no_service' );
	} );
} );
