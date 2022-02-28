import {Error as ApiError} from '@natlibfi/melinda-commons';
import httpStatus from 'http-status';
import {promisify} from 'util';
import createDebugLogger from 'debug';

const debug = createDebugLogger('@natlibfi/melinda-import-importer:pollMelindaRestApi');
const setTimeoutPromise = promisify(setTimeout);

export function pollMelindaRestApi(melindaApiClient, correlationId, pollTime = 3000) {
  return pollResult();

  async function pollResult(modificationTime = null, wait = false) {
    try {
      if (wait) {
        await setTimeoutPromise(pollTime);
        return pollResult(modificationTime);
      }

      const data = await melindaApiClient.getBulkState(correlationId);

      if (data.length === 0) { // eslint-disable-line functional/no-conditional-statement
        throw new ApiError(httpStatus.NOT_FOUND, `Queue item ${correlationId} not found!`);
      }

      const [bulkData] = data;
      //debug(`bulkData: ${JSON.stringify(bulkData)}`);

      if (bulkData.queueItemState === 'DONE' || bulkData.queueItemState === 'ERROR') {
        debug('Bulk state DONE');
        return melindaApiClient.readBulk({id: correlationId});
      }

      if (modificationTime === null) {
        debug(`State: ${bulkData.queueItemState}, setting modification time: ${JSON.stringify(bulkData.modificationTime)}`);
        return pollResult(bulkData.modificationTime, false);
      }

      if (modificationTime === bulkData.modificationTime) {
        return pollResult(bulkData.modificationTime, true);
      }

      debug(`State: ${bulkData.queueItemState}, modification time: ${bulkData.modificationTime}${bulkData.handledIds ? ` , Ids handled: ${bulkData.handledIds.length}` : ''}`);
      return pollResult(bulkData.modificationTime, true);
    } catch (error) {
      if (error instanceof ApiError) {
        if (
          error.status === httpStatus.INTERNAL_SERVER_ERROR ||
          error.status === httpStatus.FORBIDDEN || // No KVP group on bulk or non KVP group user tryes to use cataloger in
          error.status === httpStatus.UNSUPPORTED_MEDIA_TYPE // Wrong content type
        ) {
          return debug(error.payload);
        }

        throw Error(error.payload);
      }

      // Keep polling
      return pollResult(modificationTime, true);
    }
  }
}
