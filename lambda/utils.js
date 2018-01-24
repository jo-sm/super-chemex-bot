module.exports = {
  getAllEntries,
  updateStats,
  getConfigurationFor,
  getMessagesFor,
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
function getConfigurationFor(entries, deviceSerialNumber) {
  return getEntriesFor(entries, 'configuration').then(function(entries) {
    const entry = entries.find(function(entry) {
      return entry.fields && 
        entry.fields.deviceSerialNumber && 
        entry.fields.deviceSerialNumber['en-US'] === deviceSerialNumber;
    });

    if (!entry) {
      return Promise.reject(new Error(`Could not find "configuration" entry with serial number ${deviceSerialNumber}`));
    }

    return {
      slackChannel: entry.fields.slackChannel['en-US'],
      deviceSerialNumber: entry.fields.deviceSerialNumber['en-US']
    }
  });
}

/*
  Gets the messages for the given `num`.

  If the Message entry has an order equal to `num`, or
  if there is no order defined on the entry, the `message`
  field will be added to the result array.
 */
function getMessagesFor(entries, num) {
  return getEntriesFor(entries, 'message').then(function(entries) {
    let messages =  entries.reduce(function(memo, entry) {
      if (!entry.fields.message || !entry.fields.order) {
        return memo;
      }

      if (entry.fields.order['en-US'] === num) {
        memo.push(entry.fields.message['en-US']);
      }

      return memo;
    }, []);

    if (messages.length === 0) {
      messages =  entries.reduce(function(memo, entry) {
        if (!entry.fields.message) {
          return memo;
        }

        if (!entry.fields.order || entry.fields.order['en-US'] === 0) {
          memo.push(entry.fields.message['en-US']);
        }

        return memo;
      }, []);
    }

    return messages;
  })
}

/*
  Updates the statistics for today's usage.

  If the optional `debug` flag is passed when invoking
  the Amazon Lambda function, it will immediately resolve
  a promise with the value of 1.
*/
function updateStats(client, entries) {
  return getEntriesFor(entries, 'usageData').then(function(entries) {
    return entries.filter(function(entry) {
      return entry.fields.date['en-US'] === getDate();
    });
  }).then(function(entries) {
    // console.log(entries.length);
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