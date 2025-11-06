import createDebugLogger from 'debug';
import httpStatus from 'http-status';
import {promisify} from 'util';
import {Error as ApiError} from '@natlibfi/melinda-commons';

export function pollMelindaRestApi(melindaApiClient, correlationId, breakLoopOnStateChange = false, pollTime = 3000) {
  const debug = createDebugLogger('@natlibfi/melinda-rest-api-client:pollMelindaRestApi');
  const setTimeoutPromise = promisify(setTimeout);
  const finalBulkStates = ['DONE', 'ERROR', 'ABORT', undefined];

  return pollResult;

  async function pollResult(modificationTime = null, wait = false) {
    try {
      if (wait) {
        await setTimeoutPromise(pollTime);
        return pollResult(modificationTime);
      }

      debug(`Polling bulk state: ${correlationId}`);
      const bulkData = await melindaApiClient.getBulkState(correlationId);
      debug(`Got bulk state info: ${JSON.stringify(bulkData)}`);

      if (finalBulkStates.includes(bulkData.queueItemState)) {
        debug(`Bulk final state ${bulkData.queueItemState}`);
        const [bulkMetadata] = await melindaApiClient.readBulk({correlationId});
        return bulkMetadata;
      }

      if (modificationTime === null) {
        debug(`State: ${bulkData.queueItemState}, setting modification time: ${JSON.stringify(bulkData.modificationTime)}`);
        return pollResult(bulkData.modificationTime, false);
      }

      if (modificationTime === bulkData.modificationTime) {
        return pollResult(bulkData.modificationTime, true);
      }

      if (breakLoopOnStateChange && modificationTime !== bulkData.modificationTime) {
        const [bulkMetadata] = await melindaApiClient.readBulk({correlationId});
        return bulkMetadata;
      }

      debug(`State: ${bulkData.queueItemState}, modification time: ${bulkData.modificationTime}${bulkData.records ? ` , Records handled: ${bulkData.records.length}` : ''}`);
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
