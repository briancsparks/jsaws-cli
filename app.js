#!/usr/env node
/* eslint-disable valid-jsdoc */

const sg1                     = require('sg-clihelp');
const sg0                     = sg1.merge(sg1, require('sg-flow'), require('sg-diag'), require('@sg0/sg-aws-json'), require('@sg0/sg-cache-redis'));
const {sg,fs,path,os,util,sh,die,dieAsync,grepLines,include,from,startupDone,runTopAsync,exec,execa,execz,exec_ez,find,grep,ls,mkdir,SgDir,test,tempdir,inspect} = sg1.all();
const {_}                     = sg0;
const quickMerge              = require('quick-merge');
const AWS                     = require('aws-sdk');
const DIAG                    = sg0.DIAG(module);

const {
  getCache,
}                             = sg0;

const qm                      = quickMerge.quickMergeImmutable;

const ARGV                    = sg.ARGV();
const ENV                     = sg.ENV();
const diag                    = DIAG.dg;


var libCommands = {};


//-----------------------------------------------------------------------------------------------------------------------------
/**
 * Main.
 */
function main(...args) {

  var   [serviceName, command]    = ARGV._;

  if (!command) {
    [serviceName, command] = [command, serviceName];
  }

  const commandFn = libCommands[serviceName];
  if (commandFn) {
    return commandFn(serviceName, command, ...args);
  }
}


// ----------------------------------------------------------------------------------------------------------------------------
libCommands.aws =
libCommands.EC2 = function(serviceName, command, callback) {

  var   ttl = 10 * 60;     /* 10 min */
  // var   ttl = 3;              /* 3 sec */

  const key = `jsaws:${serviceName}:${command}`;
  return getCache(key, {ttl}, util.callbackify(getFromAws), {
    // onMiss    : function(callback){ return callback(err, newCacheData, skipStoringIt); },
    // onHit     : util.callbackify(onHit),
    callback  : allDone,
  });

  function allDone(err, data) {
    // if (!quiet) { sg.elog(`fetchAndCache3 superagent(${url})`, {err, data: smJson(data)}); }
    return callback(err, data);
  }

  //===========================================================================================================================
  async function getFromAws() {

    // Expensive op to get from AWS
    const service   = new AWS[serviceName]({region:'us-east-1'});
    const res       = service[command]({}).promise();

    var   data      = await res;

    const bob = new sg0.AwsDataBlob();
    bob.addResult(data);

    const value = bob.getData();
    return value;
  }
};

// ------------------------------------------------------------------------------------------------------------------
function smlog(args) {
  return sg.reduce(args, {}, (m,v,k) => {
    return sg.kv(m,k, smlogitem(v));
  });
}

function smlogitem(item, maxLen =256) {
  if (typeof item === 'string') { return item.substr(0, maxLen-1); }

  var s;

  // Is it an Array?
  if (Array.isArray(item)) {

    // If the stringification is long, maybe trim it
    s = s || sg.safeJSONStringify(item);
    if (s.length > maxLen) {

      // Too long?  Convert to [item[0], '...plus 500000 more']
      if (item.length > 2) {
        return smlogitem([item[0], `...plus ${item.length -1} more`]);
      }

      // If its still too long, just say how many items
      return [`${item.length} items`];
    }
  }

  // An object.  Truncate to maxLen
  if (sg.isObject(item)) {
    s = s || sg.safeJSONStringify(item);
    if (s.length > maxLen)                           { return s.substr(0, maxLen-1); }
  }

  return item;
}

// ------------------------------------------------------------------------------------------------------------------
/**
 * Runs a function from the top-level.
 *
 * @param {function}  main            - The function to run.
 * @param {string}    [name='main']   - The name of the function for display and debugging.
 */
function runTopSync(main, name='main') {

  return main(function(err, mainResult) {
    // const mainResult = await main();
    var result;
    // var [err, result] = sg.arrayify(mainResult);
    if (err) {
      return announceError(err);
    }

    if (!result) {
      result = mainResult;
    }

    const message = sg.extract(result ||{}, 'finalMessage');
    ARGV.v(`function ${name} finished:`, {result}, message);

    console.log(sg.safeJSONStringify(mainResult, null, null));
    // console.log([err, mainResult]);
  });

  function announceError(err) {
    ARGV.w(`Error in ${name}`, err);
    if ('code' in err) {
      process.exit(err.code);
    }
    return err;
  }
}

//-----------------------------------------------------------------------------------------------------------------------------
// Do not be too eager if we are just being required
if (require.main === module) {
  // var x = runTopAsync(main);
  runTopSync(main);
  // main();
}


