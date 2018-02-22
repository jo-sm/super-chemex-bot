const { readFile: readFileWithCb } = require('fs');

module.exports = {
  getAllEntries,
  updateStats,
  getConfigurationFor,
  getMessagesFor,
  chooseBestMessage,
  getAsset,
  readFile,
  run
}

/*
  Runs a generator function, returning a Promise.

  Handles both Promise and non-Promise `yield` values:

  function gen* () {
    const one = yield 1;
    const resp = yield fetch('https://api.test.dev/api/v1/posts');

    return resp;
  }

  Considering the function defined above, `gen` can be run in this way:

  run(gen).then(function(resp) {
    console.log(resp);
  })

  It also handles errors:

  function gen* () {
    const resp = yield fetch('https://api.test.dev/api/v1/posts');

    throw new Error('Oops!');

    return resp;
  }

  run(gen).then(function(resp) {
    console.log(resp);
  }).catch(function(e) {
    // The "Oops!" error will appear here
    console.error(e);
  });
 */
function run(generatorFunc, ...args) {
  const generator = generatorFunc();

  function next(generator, resolve, reject) {
    return function(prevGenVal) {
      let result;

      try {
        result = generator.next(prevGenVal);
      } catch(e) {
        return reject(e);
      }

      const value = result.value;
      const done = result.done;

      if (done) {
        return resolve(value);
      }

      if (value instanceof Promise) {
        return value.then(next(generator, resolve, reject));
      } else {
        return Promise.resolve(value).then(next(generator, resolve, reject));
      }
    }
  }

  return new Promise(function(resolve, reject) {
    return next(generator, resolve, reject)(...args);
  });
}

/*
  Returns all entries for given `client`.
 */
function getAllEntries(client) {
  return getSpace(client).then(function(space) {
    return space.getEntries().then(function(raw) {
      return raw.items;
    });
  });
}

/*
  Returns all entries for a given content type.
 */
function getEntriesFor(entries, contentType) {
  return Promise.resolve(entries).then(function(entries) {
    return entries.filter(function(entry) {
      return entry.sys.contentType.sys.id === contentType;
    })
  });
}

/*
  Returns the configuration values for a given Amazon IoT
  device serial number.
 */
function getConfigurationFor(entries, deviceSerialNumber, testing) {
  return getEntriesFor(entries, 'configuration').then(function(entries) {
    const entry = entries.find(function(entry) {
      return entry.fields && 
        entry.fields.deviceSerialNumber && 
        entry.fields.deviceSerialNumber['en-US'] === deviceSerialNumber;
    });

    if (!entry) {
      return Promise.reject(new Error(`Could not find "configuration" entry with serial number ${deviceSerialNumber}`));
    }

    const slackChannel = entry.fields.slackChannel && entry.fields.slackChannel['en-US'];
    const testChannel = entry.fields.testChannel && entry.fields.testChannel['en-US'];

    return {
      slackChannel,
      testChannel,
      deviceSerialNumber: entry.fields.deviceSerialNumber['en-US']
    }
  });
}

/*
  Gets the messages for the given `num`.

  If the Message entry has an order equal to `num`, or
  if there is no order defined on the entry, the entry
  will be positively filtered.
 */
function getMessagesFor(entries, num) {
  return getEntriesFor(entries, 'message').then(function(entries) {
    return entries.filter(function(entry) {
      if (!entry.fields.message) {
        return false;
      }

      if (!entry.fields.order || entry.fields.order['en-US'] === num) {
        return true;
      }
    });
  })
}

/*
  Chooses the message with the least usage, as well as
  updating the message usage.
 */
function chooseBestMessage(entries) {
  const lowestCountEntries = entries.reduce(function(memo, entry) {
    // Push the first entry always
    if (memo.length === 0) {
      memo.push(entry);
    } else if (!entry.fields.usage) {
      // If there's no usage, push this entry
      // and remove any others with usage
      memo.push(entry);

      memo = memo.filter(function(entry) {
        return !entry.fields.usage;
      });
    } else {
      // There is a usage defined, see if it's lowest
      const entryUsage = entry.fields.usage['en-US'];
      const entriesLowerUsage = memo.filter(function(entry) {
        return !entry.fields.usage || entry.fields.usage['en-US'] < entryUsage;
      });

      if (!entriesLowerUsage.length) {
        memo.push(entry);
      }
    }

    return memo;
  }, []);

  // Choose a message from the list at random
  const randomIndex = Math.floor(Math.random() * lowestCountEntries.length);
  const entry = lowestCountEntries[randomIndex];

  // Update its usage
  entry.fields.usage ? entry.fields.usage['en-US']++ : entry.fields.usage = { 'en-US': 1 };

  return entry.update().then(function(entry) {
    return entry.publish();
  }).then(function(entry) {
    return {
      message: entry.fields.message['en-US'],
      assetId: entry.fields.image 
        && entry.fields.image['en-US'].sys
        && entry.fields.image['en-US'].sys.id
    };
  });
}

function getAsset(client, id) {
  return getSpace(client).then(function(space) {
    return space.getAsset(id);
  }).then(function(asset) {
    if (!asset.fields.title) {
      return null;
    }

    if (!asset.fields.file || !asset.fields.file['en-US'] || !asset.fields.file['en-US'].url) {
      return null;
    }

    const raw = asset.fields.file['en-US'].url.split('//')[1];
    const url = `https://${raw}`;

    return {
      url,
      title: asset.fields.title['en-US']
    }
  }).catch(function(e) {
    // The asset isn't critical for the message
    return null;
  });
}

/*
  Updates the statistics for today's usage.

  If the optional `debug` flag is passed when invoking
  the Amazon Lambda function, it will immediately resolve
  a promise with the value of 1.
*/
function updateStats(client, entries, deviceSerialNumber) {
  return getEntriesFor(entries, 'usageData').then(function(entries) {
    return entries.filter(function(entry) {
      return entry.fields.date['en-US'] === getDate() &&
        entry.fields.deviceSerialNumber &&
        entry.fields.deviceSerialNumber['en-US'] === deviceSerialNumber;
    });
  }).then(function(entries) {
    if (entries.length == 0) {
      // There is no usage data today, create one
      return getSpace(client).then(function(space) {
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
            },
            deviceSerialNumber: {
              'en-US': deviceSerialNumber
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

function readFile(filename) {
  return new Promise(function(resolve, reject) {
    readFileWithCb(filename, function(err, file) {
      if (err) {
        return reject(err);
      } else {
        return resolve(file.toString());
      }
    });
  });
}

// Private

/*
  Pads a number so that there is a leading 0.
 */
function pad(number) {
  if (number < 10) {
    return '0' + number;
  }
  return number;
}

/*
  Gets the current date, so that it matches the value in Contentful database.
 */
function getDate() {
    const today = new Date();

    return `${today.getUTCFullYear()}-${pad(today.getUTCMonth()+1)}-${pad(today.getUTCDate())}`;
}

/*
  Gets the space defined during the `client` invocation.
 */
function getSpace(client) {
  return client.getSpace();
}