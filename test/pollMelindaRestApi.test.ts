import assert from 'node:assert';
import createDebugLogger from 'debug';
import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen-http-client';
import {pollMelindaRestApi} from '../src/pollMelindaRestApi.ts';
import {createMelindaApiRecordClient} from '../src/record-client.ts';

const debug = createDebugLogger('@natlibfi/melinda-rest-api-client:pollMelindaRestApi:test');
const melindaApiClient = createMelindaApiRecordClient({
  melindaApiUrl: 'http://foo.bar',
  melindaApiUsername: 'foo',
  melindaApiPassword: 'bar'
});

generateTests({
  callback,
  path: [import.meta.dirname, '..', 'test-fixtures', 'pollMelindaRestApi'],
  useMetadataFile: true,
  recurse: false,
  fixura: {
    reader: READERS.JSON
  }
});

async function callback({getFixture, correlationId}: {getFixture: (name: string) => unknown; correlationId?: unknown}) {
  debug(correlationId as string);
  const expectedResponse = getFixture('output.json');
  const poller = pollMelindaRestApi(melindaApiClient, correlationId as string, false, 10);
  const response = await poller();
  debug(response);
  assert.deepStrictEqual(response, expectedResponse);
}
