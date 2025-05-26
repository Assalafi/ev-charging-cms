/**
 * Event Emitter Utility
 * Used for event-based communication between different parts of the application
 */
const EventEmitter = require('events');

class AppEventEmitter extends EventEmitter {}

// Create a singleton instance
const eventEmitter = new AppEventEmitter();

// Set a higher max listeners limit to avoid warning messages
eventEmitter.setMaxListeners(20);

module.exports = eventEmitter;
