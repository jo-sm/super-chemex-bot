'use strict';

const WebClient = require('@slack/client').WebClient;

function send(token, channel, message, asset) {
  const opts = {};

  if (asset) {
    opts.attachments = [];
    opts.attachments.push({
      fallback: asset.title,
      image_url: asset.url
    });
  }

  return (new WebClient(token)).chat.postMessage(channel, message, opts);
}

module.exports = {
  send
}
