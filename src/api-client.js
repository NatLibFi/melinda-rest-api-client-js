import fetch from 'node-fetch';
import httpStatus from 'http-status';
import {URL} from 'url';
import {Error as ApiError, generateAuthorizationHeader} from '@natlibfi/melinda-commons';
import createDebugLogger from 'debug';
import {MarcRecord} from '@natlibfi/marc-record';

// Change to true when working
MarcRecord.setValidationOptions({subfieldValues: false});

export function createApiClient({restApiUrl, restApiUsername, restApiPassword, cataloger = false, userAgent = 'Melinda commons API client / Javascript'}) {
  const debug = createDebugLogger('@natlibfi/melinda-rest-api-client:api-client');
  const Authorization = generateAuthorizationHeader(restApiUsername, restApiPassword);

  const defaultParamsBulk = cataloger ? {pCatalogerIn: cataloger} : {};
  const defaultParamsPrio = cataloger ? {cataloger} : {};

  return {
    read, create, update, createBulk, readBulk
  };

  function read(recordId, accept = 'application/json') {
    debug('Reading record');
    return doRequest({method: 'get', path: recordId, accept});
  }

  function create(record, params = {}, accept = 'application/json') {
    debug('Posting create');
    return doRequest({method: 'post', path: '', accept, params: {...defaultParamsPrio, ...params}, body: JSON.stringify(record, undefined, '')});
  }

  function update(record, id, params = {}, accept = 'application/json') {
    debug(`Posting update ${id}`);
    return doRequest({method: 'post', path: id, accept, params: {...defaultParamsPrio, ...params}, body: JSON.stringify(record, undefined, '')});
  }

  function createBulk(stream, streamContentType, params = {}, accept = 'application/json') {
    debug('Posting bulk');
    return doRequest({method: 'post', path: 'bulk/', accept, params: {...defaultParamsBulk, ...params}, contentType: streamContentType, body: stream});
  }

  function readBulk(params = {}, accept = 'application/json') {
    debug('Reading bulk metadata');
    return doRequest({method: 'get', path: 'bulk/', accept, params});
  }

  async function doRequest({method, path, contentType = 'application/json', accept, params = false, body = null}) {
    debug('Executing request');
    try {
      const query = params ? new URLSearchParams(params) : '';
      const url = new URL(`${restApiUrl}${path}${query === '' ? '' : '?'}${query}`);

      debug(`connection URL ${url.toString()}`);

      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': userAgent,
          'Content-Type': contentType,
          Authorization,
          Accept: accept
        },
        body
      });

      debug(`${path === 'bulk/' ? 'Bulk' : 'Prio'} ${method} status: ${response.status}`);

      if (response.status === httpStatus.OK || response.status === httpStatus.CREATED) {
        if (path === '') {
          // Create new record
          const recordId = response.headers.get('Record-ID') || undefined;
          debug(`Response data: ${JSON.stringify(recordId)}`);
          return {recordId};
        }

        const data = await response.json();
        debug(`Response data: ${JSON.stringify(data)}`);

        if (path === 'bulk/') {
          if (method === 'post') {
            // Post to bulk
            const value = data.value || data;
            return value;
          }

          // Querry bulk status
          return data;
        }

        if (method === 'get') {
          const record = new MarcRecord(parseJson(data));
          return {record};
        }

        // Validation results & update record
        return data;
      }

      debug('Invalid response');
      debug(JSON.stringify(response));
      throw new ApiError(response.status);
    } catch (error) {
      debug('Api-client Error');
      debug(error.stack);

      if (error instanceof ApiError) { // eslint-disable-line functional/no-conditional-statement
        debug(error.code);
        debug(error.payload);
        throw error;
      }

      debug(JSON.stringify(error));
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Unexpected internal error');
    }
  }

  function parseJson(record) {
    if (typeof record === 'string') {
      return JSON.parse(record);
    }

    return record;
  }
}
