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

  if ((/.*\/$/u).test(melindaApiUrl)) {
    debug(`WARNING: URL ${melindaApiUrl} ends in a slash - remove slash!`);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Invalid URL ${melindaApiUrl}. Use URL without slash in the end`);
  }

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
   * @param {{correlationId?: string; logItemType?: string; blobSequence?: number; standardIdentifiers?: string; databaseId?: string; sourceIds?: string; skip?: number; limit?: number;}} params
   * @param {string} [params.correlationId] - identifier for log
   * @param {string} [params.logItemType] - LOG_ITEM_TYPE constant
   * @param {number} [params.blobSequence] - Blob sequence for log in correlation
   * @param {string} [params.standardIdentifiers] - ISBN etc.
   * @param {string} [params.databaseId] - Melinda-ID
   * @param {} [params.sourceIds] - SID
   * @param {number} [params.skip] - Skip n log items
   * @param {number} [params.limit] - Limit results to n log items
   * @returns List of logs based on search params
   */
  function getLog({correlationId, logItemType, blobSequence, standardIdentifiers, databaseId, sourceIds, skip = 0, limit}) {
    const params = removesUndefinedObjectValues({correlationId, logItemType, blobSequence, standardIdentifiers, databaseId, sourceIds, skip, limit});
    return doRequest({method: 'get', path: 'logs', params});
  }

  /**
   * Sets protect flag to logs
   * @param {string} correlationId identifier for log
   * @param {{blobSequence?: number;}} params
   * @param {number} [params.blobSequence] - Sequence numer for record log
   * @returns {status, payload}
   */
  function protectLog(correlationId, {blobSequence}) {
    const params = removesUndefinedObjectValues({blobSequence});
    return doRequest({method: 'put', path: `logs/${correlationId}`, params});
  }

  /**
   * Removes log
   * @param {string} CorrelationId identifier for log
   * @param {{force?: number;}} params
   * @param {number} params.force - 0|1 Boolean for removal done by force. Defaults 0
   * @returns {status, payload}
   */
  function removeLog(correlationId, {force = 0}) {
    return doRequest({method: 'delete', path: `logs/${correlationId}`, params: {force}});
  }

  /**
   * Get list of logs based on search params
   * @param {{expanded?: boolean; logItemTypes?: string; catalogers?: string; dateBefore?: string; dateAfter?: string;}} params
   * @param {boolean} [params.expanded] - Get list of log items in expanded schema. Defaults undefined
   * @param {string} [params.logItemTypes] - has comma-separated list of logItemTypes. Defaults undefined
   * @param {string} [params.catalogers] - has comma-separated list of catalogers (1-10 word characters each). Defaults undefined
   * @param {string} [params.dateBefore] - 'YYYY-MM-DD'. Defaults undefined
   * @param {string} [params.dateAfter] - 'YYYY-MM-DD'. Defaults undefined
   * @returns List matched of logs
   */
  function getLogsList({expanded, logItemTypes, catalogers, dateBefore, dateAfter}) {
    const params = removesUndefinedObjectValues({expanded, logItemTypes, catalogers, dateBefore, dateAfter});

    return doRequest({method: 'get', path: 'logs/list', params});
  }

  /**
   * Base function to do requests to api
   * @param {{method: string; path: string; contentType?: string; params?: object; body?: string;}} params
   * @param {string} params.method Request method
   * @param {string} params.path Request URL path
   * @param {string} [params.contentType] request body content type. Defaults 'application/json'
   * @param {Object} [params.params] URL query params to be url encoded. Defaults false
   * @param {string} [params.body] String data. Defaults null
   * @returns response Json
   */
  async function doRequest({method, path, contentType = 'application/json', params = false, body = null}) {
    debug('Executing request');
    try {
      const query = params ? new URLSearchParams(params) : '';
      const url = new URL(`${melindaApiUrl}/${path}${query === '' ? '' : '?'}${query}`);

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
