#!/usr/env node
/* eslint-disable valid-jsdoc */

const sg1                     = require('sg-clihelp');
const sg0                     = sg1.merge(sg1, require('sg-flow'), require('sg-diag'));
const {sg,fs,path,os,util,sh,die,dieAsync,grepLines,include,from,startupDone,runTopAsync,exec,execa,execz,exec_ez,find,grep,ls,mkdir,SgDir,test,tempdir,inspect} = sg1.all();
const {_}                     = sg0;
const quickMerge              = require('quick-merge');
const AWS                     = require('aws-sdk');
const localRedis              = require('./lib/redis');
const DIAG                    = sg0.DIAG(module);

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

  const commandFn = libCommands[command];
  if (commandFn) {
    return commandFn(serviceName, command, ...args);
  }

  // All else, try aws
  return libCommands.aws(serviceName, command, ...args);
}


// ----------------------------------------------------------------------------------------------------------------------------
libCommands.aws =
libCommands.EC2 = function(serviceName, command, callback) {

  // var   ttl = 10 * 60;     /* 10 min */
  var   ttl = 3;              /* 3 sec */

  const key = `jsaws:${serviceName}:${command}`;
  return getCache(key, util.callbackify(async function getFromAws() {

    // Expensive op to get from AWS
    const service   = new AWS[serviceName]({region:'us-east-1'});
    const res       = service[command]({}).promise();

    var   data      = await res;
    // data            = sg.safeJSONStringify(data);

    // return data;

    const bob = new AwsDataBlob();
    bob.parse(data);

    const value = bob.getData();
    return value;

  }), function(err, data) {
    // console.log(`debug`, serviceName, command, data);

    const bob = new AwsDataBlob();
    bob.parse(data);

    const value = bob.getData();

    // console.log(`bob`, value);
    return callback(null, value);
  });


  //===========================================================================================================================
  function getCache(key, expensiveOp, callback) {
    var [redis, close] = localRedis.connection();

    return redis.GET(key, function(err, cacheData_) {       // ===========================================      This is where data was just read out of redis
      var   cacheData = cacheData_;

      if (err)  { return fin(err); }

      if (sg0.ok(err, cacheData_)) {
        cacheData = sg.safeJSONParse(cacheData_) || cacheData_;
        diag.v(`Retrieved key: (${key}) from cache`, smlog({err, cacheData}));
        return fin(null, cacheData);
      }
      diag.v(`CacheMiss on key: (${key}) from cache`, {err, cacheData});

      return expensiveOp(function(err, data) {
        if (err)  { return fin(err); }

        return storeCache(key, data, function(err, storeRectipt) {
          if (err) { return fin(err); }
          return fin(err, data, storeRectipt);
        });
      });
    });

    //===========================================================================================================================
    function storeCache(key, data_, storeCacheCallback) {

      // Stringify the payload
      var data;
      if (typeof data_ === 'string') {
        data = `{"__Just__":"${data_}"}`;
      } else {
        data = sg.safeJSONStringify(data_);
      }

      // Insert `data` at the `key`
      return redis.SET(key, data, function(err, result) {           // ===========================================      This is where data gets put into redis
        diag.v(`Stored key: (${key}) in cache`, smlog({data, err, result}));

        // Now, set the TTL on the key, so it doesnt stick around forever
        redis.EXPIRE(key, /*ttl=*/40, function(err, result) {
          // Report the results, but do not block
          diag.v(`Stored key: (${key}) in cache`, {err, result});
        });

        return storeCacheCallback(err, result);
      });
    }

    function fin(...args) {
      close();
      return callback(...args);
    }
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
async function mainXA() {
  // const foo   = ARGV.foo;
  // const bar   = ENV.at('BAR');

  var   [serviceName, command]    = ARGV._;
  // console.log(`debug`, serviceName, command, ARGV);

  var [redis, close] = localRedis.connection();

  redis.GET(`jsaws:${serviceName}:${command}`, function(err, data) {
    console.log(`redis-get:jsaws:${serviceName}:${command}`, {err, data});
  });

  const service   = new AWS[serviceName]({region:'us-east-1'});
  const res       = service[command]({}).promise();

  var   data      = await res;

  data            = sg.safeJSONStringify(data);

  redis.SET(`jsaws:${serviceName}:${command}`, data, function(err, result) {
    console.log(`redis-set:jsaws:${serviceName}:${command}`, {data, err, result});
  });

  console.log(`debug`, serviceName, command, data);

  const bob = new AwsDataBlob();
  bob.parse(data);

  console.log(`bob`, bob.getData());
  return bob.getData();


}










//-----------------------------------------------------------------------------------------------------------------------------
async function mainX() {
  const foo   = ARGV.foo;
  const bar   = ENV.at('BAR');

  var   [serviceName, command]    = ARGV._;
  // console.log(`debug`, serviceName, command, ARGV);

  const service   = new AWS[serviceName]({region:'us-east-1'});
  const res       = service[command]({}).promise();

  const data      = await res;

  console.log(`debug`, serviceName, command, data);

  const bob = new AwsDataBlob();
  bob.parse(data);

  console.log(`bob`, bob.getData());
  return bob.getData();
}

//-----------------------------------------------------------------------------------------------------------------------------
function AwsDataBlob() {
  if (!(this instanceof AwsDataBlob))   { return new AwsDataBlob();  }
  var self = this;

  self.data = {};
}

//-----------------------------------------------------------------------------------------------------------------------------
AwsDataBlob.prototype.getData = function() {
  return this.data;
};

//-----------------------------------------------------------------------------------------------------------------------------
AwsDataBlob.prototype.parse = function(blob) {
  var self = this;

  self.data = self.data || [];

// console.log(`parse`, {blob_type: typeof blob, blob_keys: blob && typeof blob !== 'string' && Object.keys(blob)});

  if (typeof blob === 'string') {
    blob = sg.safeJSONParse(blob) || {__just__: blob};
  }

  if (blob.Reservations) {
    return outerParse(blob);
  }

  var key     = sg.firstKey(blob);
  var value   = blob[key];

  if (Array.isArray(value)) {
    value = value.map(v => this.normalize(v));
  }

  // this.data = qm(this.data, {[key]: _.groupBy(value, 'InstanceId')});
  this.data = qm(this.data, {[key]: value});

  return this.data;


  function outerParse(outerBlob) {
    var instanceListList = outerBlob.Reservations.map(r => r.Instances);
    var instanceList     = instanceListList.reduce(function(m, iList) {
      return [...m, ...iList];
    }, []);

    return self.parse({Instances: instanceList});
  }
};

//-----------------------------------------------------------------------------------------------------------------------------
AwsDataBlob.prototype.normalize = function(item_) {
  var item = {...item_};

  if (item.Tags) {
    item.tags = sg.reduce(item.Tags, {}, (m,v) => {
      item = {...item, ...mkTagMap(v)};

      // item[`tag_${v.Key.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_')}`] = v.Value;
      return sg.kv(m, v.Key, v.Value);
    });
  }

  return item;
};

function mkTagMap(v) {
  var key = v.Key.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_');

  var result = sg.kv({}, `tag_${key}`, v.Value);

  const arr = sg.compact(v.Value.split(':'));
  result = sg.reduce(arr, result, (m,v) => {
    return sg.kv(m, `tag_${key}__${v}`, true);
  });

  return result;
}

//-----------------------------------------------------------------------------------------------------------------------------
AwsDataBlob.prototype.parseX = function(blob) {
  var self = this;

  self.data = self.data || {};

  return sg.reduce(blob, [], function(m00, index) {
    self.data[index] = self.data[index] || [];

    return sg.reduce(m00 || [], [], function(m0, outerItems) {
      return sg.reduce(outerItems.Instances || [], m0, function(m, item) {

        const state       = item.State && item.State.Name;
        const InstanceId  = item.InstanceId;
        const tags        = sg.reduceObj(item.Tags, {}, function(m, value) {
          return sg.kv(m, value.Key, value.Value);
        });

        m.state = m.state || {};
        m.realm = m.realm || {};

        m.state[state]        = m.state[state]      ||[];
        m.realm[tags.realm]   = m.realm[tags.realm] ||[];

        m.state[state].push(item);
        m.realm[tags.realm].push(item);

        return m;
      });
    });
  });
};

//-----------------------------------------------------------------------------------------------------------------------------
// Do not be too eager if we are just being required
if (require.main === module) {
  // var x = runTopAsync(main);
  runTopSync(main);
}


