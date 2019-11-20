#!/usr/env node

const {sg,fs,path,os,util,sh,die,dieAsync,grepLines,include,from,startupDone,runTopAsync,exec,execa,execz,exec_ez,find,grep,ls,mkdir,SgDir,test,tempdir,inspect} = require('sg-clihelp').all();
const {_} = sg;
const AWS             = require('aws-sdk');
// const libRedis        = require('redis');
const localRedis      = require('./lib/redis');

const ARGV            = sg.ARGV();
const ENV             = sg.ENV();

// Do not be too eager if we are just being required
if (require.main === module) {
  var x = runTopAsync(main);
}

//-----------------------------------------------------------------------------------------------------------------------------
async function main() {
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


  //===========================================================================================================================
  function getCache(key, expensiveOp, callback) {
    return redis.get(key, function(err, cacheData) {

      if (err)  { return callback(err); }

      if (sg.ok(err,cacheData)) {
        console.log(`Retrieved key: (${key}) from cache`, {err, cacheData});
        return callback(null, cacheData);
      }
      console.log(`CacheMiss on key: (${key}) from cache`, {err, cacheData});

      return expensiveOp(function(err, data) {
        if (err)  { return callback(err); }

        return storeCache(key, data, function(err, receipt) {
          console.log(`Stored key: (${key}) in cache`, {err, receipt});
        });
      });
    });

    //===========================================================================================================================
    function storeCache(key, data, callback) {
      redis.set(key, data, function(err, result) {
        console.log(key, {data, err, result});

        return callback(err, result);
      });
    }
  }

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

function AwsDataBlob() {
  if (!(this instanceof AwsDataBlob))   { return new AwsDataBlob();  }
  var self = this;

  self.data = {};
}

AwsDataBlob.prototype.getData = function() {
  return this.data;
};

AwsDataBlob.prototype.parse = function(blob) {
  var self = this;

  self.data = self.data || [];

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


