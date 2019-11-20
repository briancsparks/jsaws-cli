
const {sg,fs,path,os,util,sh,die,dieAsync,grepLines,include,from,startupDone,runTopAsync,exec,execa,execz,exec_ez,find,grep,ls,mkdir,SgDir,test,tempdir,inspect} = require('sg-clihelp').all();
const aws       = require('aws-sdk');
const libRedis  = require('../lib/redis');

const ARGV        = sg.ARGV();
const ENV         = sg.ENV();

// Do not be too eager if we are just being required
if (require.main === module) {
  sg.runTopAsync(main);
}

//-----------------------------------------------------------------------------------------------------------------------------
async function main() {
  const foo   = ARGV.foo;
  const bar   = ENV.at('BAR');

}

//-----------------------------------------------------------------------------------------------------------------------------

async function foo() {
  const confDir = path.join(os.homedir(), 'quxxdir');

  if (!test('-d', confDir)) {
    return sg.dieAsync(`Need ${confDir}`);
  }

  const configFile = path.join(confDir, 'config.json');
  if (!test('-f', configFile)) {
    return sg.dieAsync(`Need ${configFile}`);
  }

  const battConfig = sg.from(confDir, 'config.json', 'foo.bar.batt');

  // ...

  const cmdStdout = await execa.stdout(sh.which('command').toString(), ['arg1', 'arg2']);
  console.log(sg.splitLn(cmdStdout));

  // ...
}

