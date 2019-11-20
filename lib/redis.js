
const libRedis  = require('redis');
// var   redis    = libRedis.createClient();

module.exports.connection = connection;

var redis = libRedis.createClient(6379, '127.0.0.1');
redis.on('error', function(err) {
  console.log("Error " + err);
});

var count = 0;
function connection() {
  var close = function(){};

  // Get a connection
  if (count++ === 0) {
    close = function() {
      redis.quit();
    };
  }

  return [redis, close];
}

