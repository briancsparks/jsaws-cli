#!/usr/env node
/* eslint-disable valid-jsdoc */

const sg1             = require('sg-clihelp');
const sg0             = sg1.merge(sg1, require('sg-flow'));
const {sg,fs,path,os,util,sh,die,dieAsync,grepLines,include,from,startupDone,runTopAsync,exec,execa,execz,exec_ez,find,grep,ls,mkdir,SgDir,test,tempdir,inspect} = sg1.all();
const {_}             = sg0;
const AWS             = require('aws-sdk');
const localRedis      = require('./lib/redis');

const ARGV            = sg.ARGV();
const ENV             = sg.ENV();

//-----------------------------------------------------------------------------------------------------------------------------
function main(callback) {

  var   [serviceName, command]    = ARGV._;

  const key = `jsaws:${serviceName}:${command}`;
  return getCache(key, util.callbackify(async function getFromAws() {

    // Expensive op to get from AWS
    const service   = new AWS[serviceName]({region:'us-east-1'});
    const res       = service[command]({}).promise();

    var   data      = await res;
    data            = sg.safeJSONStringify(data);

    return data;

  }), function(err, data) {
    // console.log(`debug`, serviceName, command, data);

    const bob = new AwsDataBlob();
    bob.parse(data);

    const value = bob.getData();

    console.log(`bob`, value);
    return callback(null, value);
  });


  //===========================================================================================================================
  function getCache(key, expensiveOp, callback) {
    var [redis, close] = localRedis.connection();

    return redis.get(key, function(err, cacheData) {

      if (err)  { return fin(err); }

      if (sg0.ok(err,cacheData)) {
        console.log(`Retrieved key: (${key}) from cache`, {err, cacheData});
        return fin(null, cacheData);
      }
      console.log(`CacheMiss on key: (${key}) from cache`, {err, cacheData});

      return expensiveOp(function(err, data) {
        if (err)  { return fin(err); }

        return storeCache(key, data, function(err, storeRectipt) {
          console.log(`Stored key: (${key}) in cache`, {err, storeRectipt});
          if (err) { return fin(err); }
          return callback(err, data, storeRectipt);
        });
      });
    });

    //===========================================================================================================================
    function storeCache(key, data, storeCacheCallback) {
      return redis.set(key, data, function(err, result) {
        console.log(key, {data, err, result});

        return storeCacheCallback(err, result);
      });
    }

    function fin(...args) {
      close();
      return callback(...args);
    }
  }
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
    ARGV.i(`function ${name} finished:`, {result}, message);
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

  redis.get(`jsaws:${serviceName}:${command}`, function(err, data) {
    console.log(`redis-get:jsaws:${serviceName}:${command}`, {err, data});
  });

  const service   = new AWS[serviceName]({region:'us-east-1'});
  const res       = service[command]({}).promise();

  var   data      = await res;

  data            = sg.safeJSONStringify(data);

  redis.set(`jsaws:${serviceName}:${command}`, data, function(err, result) {
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

  if (typeof blob === 'string') {
    blob = sg.safeJSONParse(blob) || {__just__: blob};
  }

  if (blob.Reservations) {
    return outerParse(blob);
  }

  var key     = sg.firstKey(blob);
  var value   = blob[key];

  return {[key]: _.groupBy(value, 'InstanceId')};

  // if (Array.isArray(value)) {
  //   self.data = [...self.data, ...blob];
  //   return self.data;
  // }

  // console.warn(`cannot parse`);

  // _.each(blob, (value0, key0) => {
  //   self.data[key0] = self.data[key0] ||
  // });

  function outerParse(outerBlob) {
    var instanceListList = outerBlob.Reservations.map(r => r.Instances);
    var instanceList     = instanceListList.reduce(function(m, iList) {
      return [...m, ...iList];
    }, []);

    return self.parse({Instances: instanceList});
  }
};

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


