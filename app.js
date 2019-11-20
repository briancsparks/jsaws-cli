#!/usr/env node

const {sg,fs,path,os,util,sh,die,dieAsync,grepLines,include,from,startupDone,runTopAsync,exec,execa,execz,exec_ez,find,grep,ls,mkdir,SgDir,test,tempdir,inspect} = require('sg-clihelp').all();
const AWS       = require('aws-sdk');
const libRedis  = require('redis');

const ARGV      = sg.ARGV();
const ENV       = sg.ENV();

// Do not be too eager if we are just being required
if (require.main === module) {
  var x = runTopAsync(main);
  console.log(`wws`, {x});
}

//-----------------------------------------------------------------------------------------------------------------------------
async function main() {
  const foo   = ARGV.foo;
  const bar   = ENV.at('BAR');

  var   [serviceName, command]    = ARGV._;
  // console.log(`debug`, serviceName, command, ARGV);

  const service   = new AWS[serviceName]({region:'us-east-1'});
  const res       = service[command]({}).promise();

  const data      = await res;

  console.log(`debug`, serviceName, command, data);

}


