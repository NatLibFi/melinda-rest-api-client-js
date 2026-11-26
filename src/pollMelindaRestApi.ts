import createDebugLogger from 'debug';
import httpStatus from 'http-status';
import {promisify} from 'util';
import {Error as ApiError} from '@natlibfi/melinda-commons';
import type {ReadBulkParams} from './record-client.ts';
import type {QueueItemState} from './utils.ts';

interface BulkState {
  correlationId?: string;
  queueItemState?: QueueItemState;
  modificationTime?: string;
  records?: unknown[];
};

// Terminal bulk queue item states (non-terminal states keep polling)
type TerminalBulkState = 'DONE' | 'ERROR' | 'ABORT';

// Terminal states plus undefined (an API response without queueItemState is treated as terminal)
const finalBulkStates: readonly (TerminalBulkState | undefined)[] = ['DONE', 'ERROR', 'ABORT', undefined];

/**
 * Verify that a value is a terminal bulk queue item state (or undefined)
 * @param state Value to check
 * @returns true if the value ends the polling loop
 */
function isFinalBulkState(state: string | undefined): state is TerminalBulkState | undefined {
  return finalBulkStates.some((finalState) => finalState === state);
}

export interface BulkApiClient {
  getBulkState(correlationId: string): Promise<unknown>;
  readBulk(params: Pick<ReadBulkParams, 'correlationId'>): Promise<unknown>;
};

export interface PollParams {
  client: BulkApiClient;
  correlationId: string;
  breakLoopOnStateChange?: boolean;
  pollTime?: number;
}

/**
 * Bulk state as validated at runtime: queueItemState is only checked to be a string
 * because the API may report states that are not in the QueueItemState union
 */
type BulkStateData = Omit<BulkState, 'queueItemState'> & {queueItemState: string | undefined};

/**
 * Verify that a value matches the shape of a bulk queue item state
 * @param value Value to check
 * @returns true if the value can be used as BulkStateData
 */
function isBulkState(value: unknown): value is BulkStateData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const {correlationId, queueItemState, modificationTime, records} = value as {correlationId?: unknown; queueItemState?: unknown; modificationTime?: unknown; records?: unknown};
  return (
    (correlationId === undefined || typeof correlationId === 'string') &&
    (queueItemState === undefined || typeof queueItemState === 'string') &&
    (modificationTime === undefined || typeof modificationTime === 'string') &&
    (records === undefined || Array.isArray(records))
  );
}

/**
 * Verify that a value is an array where every element is a BulkState
 * @param value Value to check
 * @returns true if the value is a BulkStateData array
 */
function isBulkStateList(value: unknown): value is BulkStateData[] {
  return Array.isArray(value) && value.every(isBulkState);
}

/**
 * Poll the state of a bulk queue item until it reaches a final state (DONE, ERROR, ABORT)
 * @param params Poll options: api client, correlationId for bulk item, break polling on state change flag and poll interval in milliseconds
 * @returns Promise resolving to the bulk queue item info (or debug output when a terminal error is returned by the api)
 */
export function pollMelindaRestApi({client: melindaApiClient, correlationId, breakLoopOnStateChange = false, pollTime = 3000}: PollParams) {
  const debug = createDebugLogger('@natlibfi/melinda-rest-api-client:pollMelindaRestApi');
  const setTimeoutPromise = promisify(setTimeout);

  return pollResult;

  // State object tracking whether a modification time has been stored during polling.
  // {init: true} means "no modification time stored yet" (first poll); {init: false}
  // means initialized, where modificationTime may legitimately be undefined (the API
  // responded without a modification time). This replaces a previous null sentinel
  // that could not distinguish "not initialized" from "initialized, value is undefined":
  // after the first poll an undefined modificationTime must be compared as a value,
  // not treated as the not-initialized sentinel.
  type PollState = {init: true} | {init: false; modificationTime: string | undefined};

  async function pollResult(modificationTime: string | null = null, wait = false) {
    return poll(modificationTime === null ? {init: true} : {init: false, modificationTime}, wait);
  }

  async function poll(state: PollState, wait: boolean) {
    try {
      if (wait) {
        await setTimeoutPromise(pollTime);
        return poll(state, false);
      }

      debug(`Polling bulk state: ${correlationId}`);
      const bulkStateData: unknown = await melindaApiClient.getBulkState(correlationId);
      if (!isBulkState(bulkStateData)) {
        debug(`Invalid bulk state response: ${JSON.stringify(bulkStateData)}`);
        throw new ApiError(httpStatus.BAD_REQUEST, `Invalid bulk state response from API for correlationId ${correlationId}`);
      }
      const bulkData = bulkStateData;
      debug(`Got bulk state info: ${JSON.stringify(bulkData)}`);

      if (isFinalBulkState(bulkData.queueItemState)) {
        debug(`Bulk final state ${bulkData.queueItemState}`);
        const [bulkMetadata] = await readBulkList();
        return bulkMetadata;
      }

      if (state.init) {
        debug(`State: ${bulkData.queueItemState}, setting modification time: ${JSON.stringify(bulkData.modificationTime)}`);
        return poll({init: false, modificationTime: bulkData.modificationTime}, false);
      }

      if (state.modificationTime === bulkData.modificationTime) {
        return poll(state, true);
      }

      if (breakLoopOnStateChange && state.modificationTime !== bulkData.modificationTime) {
        const [bulkMetadata] = await readBulkList();
        return bulkMetadata;
      }

      debug(`State: ${bulkData.queueItemState}, modification time: ${bulkData.modificationTime}${bulkData.records ? ` , Records handled: ${bulkData.records.length}` : ''}`);
      return poll({init: false, modificationTime: bulkData.modificationTime}, true);
    } catch (error) {
      if (error instanceof ApiError) {
        if (
          error.status === httpStatus.INTERNAL_SERVER_ERROR ||
          error.status === httpStatus.FORBIDDEN || // No KVP group on bulk or non KVP group user tryes to use cataloger in
          error.status === httpStatus.UNSUPPORTED_MEDIA_TYPE // Wrong content type
        ) {
          return debug(error.payload);
        }

        throw Error(typeof error.payload === 'string' ? error.payload : String(error.payload));
      }

      // Keep polling
      return poll(state, true);
    }
  }

  async function readBulkList(): Promise<BulkStateData[]> {
    const bulkListData: unknown = await melindaApiClient.readBulk({correlationId});
    if (!isBulkStateList(bulkListData)) {
      debug(`Invalid bulk state list response: ${JSON.stringify(bulkListData)}`);
      throw new ApiError(httpStatus.BAD_REQUEST, `Invalid bulk state list response from API for correlationId ${correlationId}`);
    }

    return bulkListData;
  }
}
