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
   * @param {Object} {
   * correlationId OR id: {String} identifier for log,
   * logItemType: {String} LOG_ITEM_TYPE constant,
   * blobSequence: {Integer} sequence for log in correlation,
   * standardIdentifiers: {String} ISBN etc.,
   * databaseId: {String} Melinda-ID,
   * sourceIds: SID,
   * skip: {Integer} skip n log items,
   * limit: {Integer} Limit results to n log items
   * }
   * @returns List of logs based on search params
   */
  function getLog(params) {
    return doRequest({method: 'get', path: 'logs', params});
  }

  /**
   * Sets protect flag to logs
   * @param {String} CorrelationId identifier for log
   * @param {Object} {
   * blobSequence: {Integer} Sequence numer for record log
   * }
   * @returns {status, payload}
   */
  function protectLog(correlationId, params) {
    return doRequest({method: 'put', path: `logs/${correlationId}`, params});
  }

  /**
   * Removes log
   * @param {String} CorrelationId identifier for log
   * @param {Object} {
   * force: {Integer} 0|1 Boolean for removal done by force
   * }
   * @returns {status, payload}
   */
  function removeLog(correlationId, params) {
    return doRequest({method: 'delete', path: `logs/${correlationId}`, params});
  }

  /**
   * Get list of logs based on search params
   * @param {Object} {
   * logItemTypes: {String} logItemTypes has comma-separated list of logItemTypes
   * catalogers: {String} catalogers has comma-separated list of catalogers (1-10 word characters each)
   * dateBefore: {String} 'YYYY-MM-DD',
   * dateAfter:  {String} 'YYYY-MM-DD'}
   * @returns List matched of logs
   */
  function getLogsList(params) {
    return doRequest({method: 'get', path: 'logs/list', params});
  }

  /**
   * <Description>
   * @param {<type>} <Description 1st parameter>
   * @param {<type>} <Description 2nd parameter>
   * @returns <Description return value>
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
