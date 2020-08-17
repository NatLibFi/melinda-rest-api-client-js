import fetch from 'node-fetch';
import httpStatus from 'http-status';
import {URL} from 'url';
import {Error as ApiError, generateAuthorizationHeader} from '@natlibfi/melinda-commons';
import {createLogger} from '@natlibfi/melinda-backend-commons';
import {MarcRecord} from '@natlibfi/marc-record';

// Change to true when working
MarcRecord.setValidationOptions({subfieldValues: false});

export function createApiClient({restApiUrl, restApiUsername, restApiPassword, cataloger = false, userAgent = 'Melinda commons API client / Javascript'}) {
  const logger = createLogger();
  const Authorization = generateAuthorizationHeader(restApiUsername, restApiPassword);

  const defaultParamsBulk = cataloger ? {pCatalogerIn: cataloger} : {};
  const defaultParamsPrio = cataloger ? {cataloger} : {};

  return {
    read, create, update, createBulk, readBulk
  };

  function read(recordId) {
    logger.log('silly', 'Reading record');
    return doRequest({method: 'get', path: recordId});
  }

  function create(record, params = {noop: 0, unique: 0}) {
    logger.log('silly', 'Posting create');
    return doRequest({method: 'post', path: '', params: {...defaultParamsPrio, ...params}, body: JSON.stringify(record, undefined, '')});
  }

  function update(record, id, params = {noop: 0, unique: 0}) {
    logger.log('silly', `Posting update ${id}`);
    return doRequest({method: 'post', path: id, params: {...defaultParamsPrio, ...params}, body: JSON.stringify(record, undefined, '')});
  }

  function createBulk(stream, streamContentType, params) {
    logger.log('silly', 'Posting bulk');
    return doRequest({method: 'post', path: 'bulk/', params: {...defaultParamsBulk, ...params}, contentType: streamContentType, body: stream});
  }

  function readBulk(params) {
    logger.log('silly', 'Reading bulk metadata');
    return doRequest({method: 'get', path: 'bulk/', params});
  }

  async function doRequest({method, path, contentType = 'application/json', params = false, body = null}) {
    logger.log('silly', 'Doing request');
    try {
      const query = params ? new URLSearchParams(params) : '';
      const url = new URL(`${restApiUrl}${path}${query === '' ? '' : '?'}${query}`);

      logger.log('debug', `connection URL ${url.toString()}`);

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

      logger.log('http', `${path === 'bulk/' ? 'Bulk' : 'Prio'} ${method} status: ${response.status}`);

      if (response.status === httpStatus.OK || response.status === httpStatus.CREATED) {
        if (path === '') {
          // Create new record
          const recordId = response.headers.get('Record-ID') || undefined;
          logger.log('silly', `Response data: ${JSON.stringify(recordId)}`);
          return {recordId};
        }

        const data = await response.json();
        logger.log('silly', `Response data: ${JSON.stringify(data)}`);

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

      logger.log('error', response);
      throw new ApiError(response.status);
    } catch (error) {
      logger.log('debug', 'Api-client Error');
      if (error instanceof ApiError) { // eslint-disable-line functional/no-conditional-statement
        throw error;
      }

      logError(error);
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
