'use strict';

const contentful = require('./contentful')
const slack = require('./slack')
const deviceID = 'G030MD025452LHCJ';

/*
{ 
  serialNumber: 'G030MD025452LHCJ',
  batteryVoltage: '1737mV',
  clickType: 'SINGLE'
}
 */

exports.handler = (event) => {
  const start = new Date();

  contentful.withEntries().then(function(def) {
    return def.updateStats(start).then(function(num) {
      return def.getConfiguration().then(function(config) {
        return [num, config];
      });
    }).then(function(values) {
      const num = values[0];
      const config = values[1];

      return def.getMessagesFor(num).then(function(messages) {
        return [config, messages];
      });
    }).then(function(values) {
      const { slackChannel } = values[0];
      const messages = values[1];

      const randomMessageIdx = Math.floor(Math.random() * messages.length);

      const message = messages[randomMessageIdx];

      return slack.send(slackChannel, message);
    }).then(function(resp) {
      console.info('Message sent', resp);
      console.info(`Total time: ${(new Date()) - start}`);
    }).catch(function(error) {
      console.error(error);
    });
  });
}
