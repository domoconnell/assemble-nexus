// lodash2
function waitFor(conditionFn, interval = 50, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      try {
        if (conditionFn()) return resolve();
        if (Date.now() - start > timeout) {
          return reject(new Error('waitFor: timeout exceeded'));
        }
        setTimeout(check, interval);
      } catch (err) {
        reject(err);
      }
    };

    check();
  });
}

function waitForValue(obj, key, expectedValue, interval = 50, timeout = 10000) {
  return waitFor(() => obj[key] === expectedValue, interval, timeout);
}

// Add more utilities here as needed...

const __ = {
  waitFor,
  waitForValue,
};

export default __;
export { waitFor, waitForValue };