import fetch from 'node-fetch';
import httpStatus from 'http-status';
import {URL, URLSearchParams} from 'url';
import {Error as ApiError, generateAuthorizationHeader} from '@natlibfi/melinda-commons';
import createDebugLogger from 'debug';
import {checkStatus} from './errorResponseHandler';

export function createMelindaApiLogClient({melindaApiUrl, melindaApiUsername, melindaApiPassword, userAgent = 'Melinda commons API client / Javascript'}) {
  const debug = createDebugLogger('@natlibfi/melinda-rest-api-client:log-client');
  const Authorization = generateAuthorizationHeader(melindaApiUsername, melindaApiPassword);

  return {
    getMergeLog, getMergeLogByCorrelationid
  };

  function getMergeLog({skip, blobSequence}) {
    debug(`GET merge log skip: ${skip}, blobSequence: ${blobSequence}`);
    return doRequest({method: 'get', path: `bulk/logs/`, params: {skip, blobSequence}});
  }

  function getMergeLogByCorrelationid({correlationId, blobSequence}) {
    debug(`GET merge log by correlationId: ${correlationId}, blobSequence: ${blobSequence}`);
    return doRequest({method: 'get', path: `bulk/logs/${correlationId}`, params: {blobSequence}});
  }

  async function doRequest({method, path, contentType = 'application/json', params = false, body = null}) {
    debug('Executing request');
    try {
      const query = params ? new URLSearchParams(params) : '';
      const url = new URL(`${melindaApiUrl}${path}${query === '' ? '' : '?'}${query}`);

      debug(`connection URL ${url.toString()}`);

      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': userAgent,
          'content-type': contentType,
          Authorization,
          Accept: 'application/json'
        },
        body
      });

      debug(`${method}, path: ${path}, params: ${params}, status: ${response.status}`);

      // log status check?
      await checkStatus(response);

      //logic here
      if (response.status === httpStatus.OK) {
        return response;
      }

      debug('Invalid response');
      debug(JSON.stringify(response));
      throw new ApiError(response.status);
    } catch (error) {
      debug('Api-client Error');
      if (error instanceof ApiError) { // eslint-disable-line functional/no-conditional-statement
        throw error;
      }

      debug(JSON.stringify(error));
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Unexpected internal error');
    }
  }
}
