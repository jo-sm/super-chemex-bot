const contentfulManagement = require('contentful-management');
const contentful = require('contentful');

const { run, getAllEntries, updateStats, getConfigurationFor, getMessagesFor } = require('./utils');
const { send } = require('./slack');

/*
Event from Amazon IoT button click:

{ 
  serialNumber: 'G030MD025452LHCJ',
  batteryVoltage: '1737mV',
  clickType: 'SINGLE' // Could also be 'DOUBLE'
}
 */

process.on('unhandledRejection', error => {
  // Will print "unhandledRejection err is not defined"
  console.log('unhandledRejection');
  console.error(error);
});

exports.handler = (event, context, cb) => {
  // Env variables
  const deliveryToken = process.env.CONTENTFUL_ACCESS_TOKEN;
  const managementToken = process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN;
  const spaceId = process.env.CONTENTFUL_SPACE_ID;
  const slackToken = process.env.SLACK_API_TOKEN

  // Invocation variables
  const start = new Date();
  const batteryVoltage = parseInt(event.batteryVoltage, 10);
  const {
    deviceSerialNumber,
    debug
  } = event;

  // Contentful management client
  const managementClient = contentfulManagement.createClient({
    space: spaceId,
    accessToken: managementToken
  });

  run(function* () {
    const entries = yield getAllEntries(managementClient);
    const currentUsage = yield updateStats(managementClient, entries);
    const messages = yield getMessagesFor(entries, currentUsage);
    const config = yield getConfigurationFor(entries, deviceSerialNumber);

    const { slackChannel } = config;
    const randomMessageIdx = Math.floor(Math.random() * messages.length);
    const message = messages[randomMessageIdx];

    return send(slackToken, slackChannel, message);
  }).then(function(sentMessage) {
    console.info('Message sent: ', sentMessage);
    console.info(`Total time: ${(new Date()) - start}`);
  }).catch(function(e) {
    console.error(e);
  });
}
