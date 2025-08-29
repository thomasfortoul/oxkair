import dotenv from 'dotenv';

// Suppress dotenv logging
const originalLog = console.log;
console.log = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('[dotenv]')) {
    return;
  }
  originalLog(...args);
};

dotenv.config({ path: './.env.local' });

// Restore original console.log
console.log = originalLog;