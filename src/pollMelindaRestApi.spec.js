import {expect} from 'chai';
import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen-http-client';
import {pollMelindaRestApi} from './pollMelindaRestApi';
import createDebugLogger from 'debug';
import {createMelindaApiRecordClient} from './record-client';

const debug = createDebugLogger('@natlibfi/melinda-rest-api-client:pollMelindaRestApi:test');
const melindaApiClient = createMelindaApiRecordClient({
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

async function callback({getFixture, correlationId}) {
  debug(correlationId);
  const expectedResponse = getFixture('output.json');
  const poller = pollMelindaRestApi(melindaApiClient, correlationId, false, 10);
  const response = await poller();
  console.log(response); // eslint-disable-line
  debug(response);
  expect(response).to.eql(expectedResponse);
}
