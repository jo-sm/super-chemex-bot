'use strict';

const WebClient = require('@slack/client').WebClient;

function send(token, channel, message) {
  return (new WebClient(token)).chat.postMessage(channel, message)
}

module.exports = {
  send
}
