'use strict';

const contentfulManagement = require('contentful-management');

const token = process.env.CONTENTFUL_ACCESS_TOKEN;
const spaceId = process.env.CONTENTFUL_SPACE_ID;

const client = contentfulManagement.createClient({
  space: spaceId,
  accessToken: token
});

let space;

function pad(number) {
  if (number < 10) {
    return '0' + number;
  }
  return number;
}

function getDate() {
    const today = new Date();

    return `${today.getUTCFullYear()}-${pad(today.getUTCMonth()+1)}-${pad(today.getUTCDate())}`;
}

function getSpace() {
  if (space) {
    return space;
  }

  space = client.getSpace();

  return space;
}

function withEntries() {
  return getAllEntries().then(function(entries) {
    return {
      updateStats: updateStats.bind(this, entries),
      getConfiguration: getConfiguration.bind(this, entries),
      getMessagesFor: getMessagesFor.bind(this, entries)
    }
  });
}

function getAllEntries() {
  return getSpace().then(function(space) {
    return space.getEntries().then(function(raw) {
      return raw.items;
    });
  });
}

function getEntriesFor(entries, contentType) {
  return Promise.resolve(entries).then(function(entries) {
    return entries.filter(function(entry) {
      return entry.sys.contentType.sys.id === contentType;
    })
  });
}

function getConfiguration(entries) {
  return getEntriesFor(entries, 'configuration').then(function(entries) {
    const entry = entries[0];

    return {
      slackChannel: entry.fields.slackChannel['en-US'],
      deviceSerialNumber: entry.fields.deviceSerialNumber['en-US']
    }
  });
}

function getMessagesFor(entries, num) {
  return getEntriesFor(entries, 'message').then(function(entries) {
    return entries.reduce(function(memo, entry) {
      if (!entry.fields.message) {
        return memo;
      }

      if (!entry.fields.order || entry.fields.order['en-US'] === 0) {
        memo.push(entry.fields.message['en-US']);
      } else if (entry.fields.order['en-US'] === num) {
        memo.push(entry.fields.message['en-US']);
      }

      return memo;
    }, []);
  })
}

/*
  Updates the statistics for today's usage
*/
function updateStats(entries, start) {
  return getEntriesFor(entries, 'usageData').then(function(entries) {
    return entries.filter(function(entry) {
      return entry.fields.date['en-US'] === getDate();
    });
  }).then(function(entries) {
    if (entries.length == 0) {
      // There is no usage data today, create one
      return getSpace().then(function(space) {
        return space.createEntry('usageData', {
          fields: {
            dateTitle: {
              'en-US': getDate()
            },
            date: {
              'en-US': getDate()
            },
            numberOfPresses: {
              'en-US': 1
            }
          }
        });
      });
    } else {
      const entry = entries[0];
      entry.fields.numberOfPresses['en-US']++;

      return entry.update();
    }
  }).then(function(entry) {
      return entry.publish();
  }).then(function(entry) {
      return entry.fields.numberOfPresses['en-US'];
  });
};

module.exports = {
  withEntries,
}
