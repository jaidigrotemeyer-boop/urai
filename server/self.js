const fs = require('fs'); const git = require('git-rev-sync');
const packageJson = JSON.parse(fs.readFileSync('package.json'));
const version = packageJson.version;
const lastCommit = git.short;
function selfVersion() { return { version, lastCommit }; }
module.exports = { selfVersion };