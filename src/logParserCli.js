#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'fs';
import yargs from 'yargs';
import HttpStatus from 'http-status';
import {handleInterrupt} from '@natlibfi/melinda-backend-commons';
import {Error as ApiError} from '@natlibfi/melinda-commons';

run();

// DEVELOP: combine logParserCli to log-client

async function run() {

  process
    .on('SIGINT', handleInterrupt)
    .on('unhandledRejection', handleInterrupt)
    .on('uncaughtException', handleInterrupt);

  await yargs(process.argv.slice(2))
    .scriptName('melinda-rest-api-client-log-parser-cli')
    .epilog('Copyright (C) 2026 University Of Helsinki (The National Library Of Finland)')
//    .usage('Installed globally: $0 <environment> <operation> [options] and env variable info in README')
//    .usage('Not installed: npx $0 <environment> <operation> [options] and env variable info in README')
//    .usage('Build from source: node dist/index.js <environment> <operation> [options] and env variable info in README')
    .showHelpOnFail(true)
    .example([
      ['$ $0 records get MERGE_LOG mergedRecord [file]']
    ])
    .version()
    .demandCommand(1)
    .command('records', 'Operate on records from logs', yargs => {
      yargs
        .demandCommand(1)
        .command({
          command: 'get <logItemType> <recordType> [file]',
          desc: 'Get <recordType> record(s) from <logItemType> logs in file, save them to [file].<recordItemType>s',
          handler: getRecords
        })
    })
    .parse();

  // MARK: getRecords
  async function getRecords({logItemType, recordType, file}) {
    console.log(`getRecords`)
    if (file === undefined && !fs.accessSync(file, fs.constants.R_OK)) {
      throw new Error('File parameter missing for getting records');
    }

    // DEVELOP: check that logItemType && recordType are valid
    // DEVELOP: choose serialization for output
    // DEVELOP: choose location for output
    // DEVELOP: choose single record / all records for output

    try {
      const data = JSON.parse(await readData(file));
      const records = await data.map((log) =>  {
        const logsLogItemType = log['logItemType'];
        console.log(`Handling ${logsLogItemType}`);
        if (logsLogItemType === logItemType) {
            return log[recordType];
        }
        return undefined;
      })
      .filter((record) => record !== undefined);
      console.log(`Found ${records.length} records (${recordType}) from ${data.length} logItems (${logItemType}).`);
      const outputfile = `${file}.${recordType}s`;
      console.log(`Printing to ${outputfile}`);
      writeData(outputfile, records);

    } catch (err) {
      handleError(err);
    }
  }

  // MARK: Handle Error
  function handleError(err) {
    if (err instanceof ApiError) {
      return logger.error(`API call failed: ${HttpStatus[`${err.status}_MESSAGE`]} (${err.status})`);
    }

    throw new Error(`Unexpected handle error: ${'stack' in err ? err.stack : 'message' in err ? err.message : err}`);
  }

  // MARK: Read data
  function readData(filename) {
    if (filename) {
      return fs.readFileSync(filename, 'utf8');
    }
  }

  // MARK: Write data
  function writeData(filename, records) {
    if (filename) {
         fs.writeFileSync(filename, JSON.stringify(records), {encoding: "utf8"});
    }
  }
}
