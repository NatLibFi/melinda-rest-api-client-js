import httpStatus from 'http-status';
import {createLogger} from '@natlibfi/melinda-backend-commons';
import {Error as ApiError} from '@natlibfi/melinda-commons';

const logger = createLogger();

export async function checkStatus(response) {

  // Unauthorized (400)
  if (response.status === httpStatus.BAD_REQUEST) { // eslint-disable-line functional/no-conditional-statement
    logger.error('Got "UNAUTHORIZED" (401) response from melinda-rest-api.');
    const data = await response.json();
    if (data) {
      logger.error(`${data.message}: ${data.failedParams}`);
      throw new ApiError(httpStatus.BAD_REQUEST, `${data.message}: ${data.failedParams}`);
    }

    throw new ApiError(httpStatus.BAD_REQUEST);
  }

  // Unauthorized (401)
  if (response.status === httpStatus.UNAUTHORIZED) { // eslint-disable-line functional/no-conditional-statement
    logger.error('Got "UNAUTHORIZED" (401) response from melinda-rest-api.');
    throw new ApiError(httpStatus.UNAUTHORIZED);
  }

  // Forbidden (403)
  if (response.status === httpStatus.FORBIDDEN) { // eslint-disable-line functional/no-conditional-statement
    logger.error('Got "FORBIDDEN" (403) response from melinda-rest-api.');
    throw new ApiError(httpStatus.FORBIDDEN);
  }

  // Not found (404)
  if (response.status === httpStatus.NOT_FOUND) { // eslint-disable-line functional/no-conditional-statement
    logger.error('Got "NOT_FOUND" (404) response from melinda-rest-api.');
    throw new ApiError(httpStatus.NOT_FOUND);
  }

  // Service unavailable (503)
  if (response.status === httpStatus.SERVICE_UNAVAILABLE) { // eslint-disable-line functional/no-conditional-statement
    logger.error('Got "SERVICE_UNAVAILABLE" (503) response from melinda-rest-api.');
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'The server is temporarily unable to service your request due to maintenance downtime or capacity problems. Please try again later.');
  }
}
