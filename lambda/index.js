const contentfulManagement = require('contentful-management');

const {
  run,
  getAllEntries,
  updateStats,
  getConfigurationFor,
  getMessagesFor,
  chooseBestMessage,
  getAsset,
  readFile 
} = require('./utils');

const { send } = require('./slack');

process.on('unhandledRejection', error => {
  // Will print "unhandledRejection err is not defined"
  console.log('unhandledRejection');
  console.error(error);
});

module.exports = {
  handler,
  test
}

function handler(event) {
  // Env variables
  const managementToken = process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN;
  const spaceId = process.env.CONTENTFUL_SPACE_ID;
  const slackToken = process.env.SLACK_API_TOKEN;
  const tz = process.env.TZ;

  // Invocation variables
  const start = new Date();
  const batteryVoltage = parseInt(event.batteryVoltage, 10);
  const {
    serialNumber,
    debug,
    test
  } = event;

  // Contentful management client
  const managementClient = contentfulManagement.createClient({
    space: spaceId,
    accessToken: managementToken
  });

  run(function* () {
    const entries = yield getAllEntries(managementClient);
    const currentUsage = yield updateStats(managementClient, entries, serialNumber);
    const messageEntries = yield getMessagesFor(entries, currentUsage, tz);
    const config = yield getConfigurationFor(entries, serialNumber, test);

    const { slackChannel, testChannel } = config;
    const bestMessage = yield chooseBestMessage(messageEntries);

    const { assetId } = bestMessage;
    let { message } = bestMessage;

    let asset;
    let channel;

    if (assetId) {
      asset = yield getAsset(managementClient, assetId);
    }

    // For testing, it's good to see which channel the button
    // would message
    if (test) {
      channel = testChannel || slackChannel;
      message = `[${slackChannel}] ${message}`
    } else {
      channel = slackChannel;
    }

    return send(slackToken, channel, message, asset);
  }).then(function(sentMessage) {
    console.info('Message sent: ', sentMessage);
    console.info(`Total time: ${(new Date()) - start}`);
  }).catch(function(e) {
    console.error(e);
  });
}

function test(serialNumber) {
  return readFile('test.json').then(function(file) {
    const testJson = JSON.parse(file);

    testJson.serialNumber = serialNumber;

    return handler(testJson);
  }).catch(function(e) {
    console.error(e);
  })
}
