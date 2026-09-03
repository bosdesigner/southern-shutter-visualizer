// lib/async-handler.js — route a rejected async handler to Express's error middleware (Express 4 does not).
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
