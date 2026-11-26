import httpStatus from 'http-status';
import {Error as ApiError, createLogger} from '@natlibfi/melinda-commons';

const logger = createLogger();

function isBadRequestPayload(value: unknown): value is {message: string; failedParams: string} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const {message, failedParams} = value as {message?: unknown; failedParams?: unknown};
  return typeof message === 'string' && message.length > 0 && typeof failedParams === 'string' && failedParams.length > 0;
}

export async function checkStatus(response: Response): Promise<void> {

  // Unauthorized (400)
  if (response.status === httpStatus.BAD_REQUEST) {
    logger.error('Got "BAD_REQUEST" (400) response from melinda-rest-api.');
    const data = await response.json();
    if (isBadRequestPayload(data)) {
      logger.error(`${data.message}: ${data.failedParams}`);
      throw new ApiError(httpStatus.BAD_REQUEST, `${data.message}: ${data.failedParams}`);
    }

    throw new ApiError(httpStatus.BAD_REQUEST, undefined);
  }

  // Unauthorized (401)
  if (response.status === httpStatus.UNAUTHORIZED) {
    logger.error('Got "UNAUTHORIZED" (401) response from melinda-rest-api.');
    throw new ApiError(httpStatus.UNAUTHORIZED, undefined);
  }

  // Forbidden (403)
  if (response.status === httpStatus.FORBIDDEN) {
    logger.error('Got "FORBIDDEN" (403) response from melinda-rest-api.');
    throw new ApiError(httpStatus.FORBIDDEN, undefined);
  }

  // Not found (404)
  if (response.status === httpStatus.NOT_FOUND) {
    logger.error('Got "NOT_FOUND" (404) response from melinda-rest-api.');
    throw new ApiError(httpStatus.NOT_FOUND, undefined);
  }

  // Service unavailable (503)
  if (response.status === httpStatus.SERVICE_UNAVAILABLE) {
    logger.error('Got "SERVICE_UNAVAILABLE" (503) response from melinda-rest-api.');
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'The server is temporarily unable to service your request due to maintenance downtime or capacity problems. Please try again later.');
  }
}
