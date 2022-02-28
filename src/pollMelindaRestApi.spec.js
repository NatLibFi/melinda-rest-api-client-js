import {expect} from 'chai';
import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen-http-client';
import {pollMelindaRestApi} from './pollMelindaRestApi';
import createDebugLogger from 'debug';
import {createApiClient} from './api-client';

const debug = createDebugLogger('@natlibfi/melinda-import-importer:pollMelindaRestApi:test');
const melindaApiClient = createApiClient({
  melindaApiUrl: 'http://foo.bar/',
  melindaApiUsername: 'foo',
  melindaApiPassword: 'bar'
});

generateTests({
  callback,
  path: [__dirname, '..', 'test-fixtures', 'pollMelindaRestApi'],
  useMetadataFile: true,
  recurse: false,
  fixura: {
    reader: READERS.JSON
  }
});

async function callback({getFixture, enabled = true, correlationId}) {
  if (enabled === false) {
    debug('TEST SKIPPED!');
    return;
  }
  debug(correlationId);
  const expectedResponse = getFixture('output.json');
  const response = await pollMelindaRestApi(melindaApiClient, correlationId, 100);
  //debug(response);
  expect(response).to.deep.equal(expectedResponse);
}
