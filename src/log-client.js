import fetch from 'node-fetch';
import httpStatus from 'http-status';
import {URL, URLSearchParams} from 'url';
import {Error as ApiError, generateAuthorizationHeader} from '@natlibfi/melinda-commons';
import createDebugLogger from 'debug';
import {checkStatus} from './errorResponseHandler';
import {removesUndefinedObjectValues} from './utils';

export function createMelindaApiLogClient({melindaApiUrl, melindaApiUsername, melindaApiPassword, userAgent = 'Melinda commons API client / Javascript'}) {
  const debug = createDebugLogger('@natlibfi/melinda-rest-api-client:log-client');
  const Authorization = generateAuthorizationHeader(melindaApiUsername, melindaApiPassword);

  return {
    getCatalogers, getLog, protectLog, removeLog, getLogsList
  };

  /**
   * Get catalogers who has made logs
   * @returns List on catalogers based on search params
   */
  function getCatalogers() {
    return doRequest({method: 'get', path: 'logs/catalogers'});
  }

  /**
   * Get specific log item
   * @param {String} correlationId OR id: {String} identifier for log
   * @param {String} logItemType LOG_ITEM_TYPE constant
   * @param {Integer} blobSequence for log in correlation
   * @param {String} standardIdentifiers ISBN etc.
   * @param {String} databaseId Melinda-ID
   * @param {} sourceIds SID
   * @param {Integer} skip n log items
   * @param {Integer} limit results to n log items
   * @returns List of logs based on search params
   */
  function getLog({correlationId, logItemType, blobSequence, standardIdentifiers, databaseId, sourceIds, skip = 0, limit}) {
    const params = removesUndefinedObjectValues({correlationId, logItemType, blobSequence, standardIdentifiers, databaseId, sourceIds, skip, limit});
    return doRequest({method: 'get', path: 'logs', params});
  }

  /**
   * Sets protect flag to logs
   * @param {String} CorrelationId identifier for log
   * @param {Integer} blobSequence Sequence numer for record log
   * @returns {status, payload}
   */
  function protectLog(correlationId, {blobSequence}) {
    const params = removesUndefinedObjectValues({blobSequence});
    return doRequest({method: 'put', path: `logs/${correlationId}`, params});
  }

  /**
   * Removes log
   * @param {String} CorrelationId identifier for log
   * @param {Integer} force 0|1 Boolean for removal done by force. Defaults 0
   * @returns {status, payload}
   */
  function removeLog(correlationId, {force = 0}) {
    return doRequest({method: 'delete', path: `logs/${correlationId}`, params: {force}});
  }

  /**
   * Get list of logs based on search params
   * @param {String|undefined} [logItemTypes] - has comma-separated list of logItemTypes. Defaults undefined
   * @param {String|undefined} [catalogers] - has comma-separated list of catalogers (1-10 word characters each). Defaults undefined
   * @param {String|undefined} [dateBefore] - 'YYYY-MM-DD'. Defaults undefined
   * @param {String|undefined} [dateAfter] - 'YYYY-MM-DD'. Defaults undefined
   * @returns List matched of logs
   */
  function getLogsList({logItemTypes, catalogers, dateBefore, dateAfter}) {
    const params = removesUndefinedObjectValues({logItemTypes, catalogers, dateBefore, dateAfter});

    return doRequest({method: 'get', path: 'logs/list', params});
  }

  /**
   * Base function to do requests to api
   * @param {String} method Request method
   * @param {String} path Request URL path
   * @param {String} contentType request body content type. Defaults 'application/json'
   * @param {Object} params URL query params to be url encoded. Defaults false
   * @param {String} body String data. Defaults null
   * @returns response Json
   */
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

      debug(`${method}, path: ${path}, params: ${JSON.stringify(params)}, status: ${response.status}`);

      // log status check?
      await checkStatus(response);

      //logic here
      if (response.status === httpStatus.OK) {
        const result = await response.json();
        debug(`result: ${JSON.stringify(result)}`);
        return result;
      }

      debug('Invalid response');
      debug(JSON.stringify(response));
      throw new ApiError(response.status);
    } catch (error) {
      debug('Api-client Error');
      if (error instanceof ApiError) { // eslint-disable-line functional/no-conditional-statements
        throw error;
      }

      debug(JSON.stringify(error));
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Unexpected internal error');
    }
  }
}
