const mqtt = require('mqtt');
const logger = require('../utils/logger');
const config = require('../../../config/backend').backend;

// Store MQTT client and topic subscriptions
let client = null;
const topicSubscriptions = new Map();

// Get MQTT configuration
const mqttConfig = config.mqtt;
const mqttEnabled = mqttConfig.enabled;

/**
 * Connect to MQTT broker
 */
function connect() {
  // Check if MQTT is enabled
  if (!mqttEnabled) {
    logger.info('MQTT is disabled by configuration, skipping connection');
    return null;
  }

  const clientId = mqttConfig.options.clientId || `ev_cms_backend_${Math.random().toString(16).substring(2, 8)}`;
  const connectUrl = mqttConfig.broker;
  
  logger.info(`Connecting to MQTT broker at ${connectUrl}`);
  
  try {
    client = mqtt.connect(connectUrl, {
      ...mqttConfig.options,
      clientId,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 1000
    });
  
  client.on('connect', () => {
    logger.info('Connected to MQTT broker');
    
    // Resubscribe to all previously subscribed topics
    topicSubscriptions.forEach((callback, topic) => {
      client.subscribe(topic, (err) => {
        if (err) {
          logger.error(`Error resubscribing to ${topic}:`, err);
        } else {
          logger.debug(`Resubscribed to ${topic}`);
        }
      });
    });
  });
  
  client.on('message', (topic, message) => {
    logger.debug(`Received message on ${topic}`);
    
    const callback = topicSubscriptions.get(topic) || topicSubscriptions.get(getWildcardTopic(topic));
    
    if (callback) {
      try {
        callback(topic, message.toString());
      } catch (error) {
        logger.error(`Error handling message on topic ${topic}:`, error);
      }
    }
  });
  
  client.on('error', (error) => {
    logger.error('MQTT connection error:', error);
  });
  
  client.on('reconnect', () => {
    logger.info('Reconnecting to MQTT broker');
  });
  
  return client;
  } catch (error) {
    logger.error('Failed to connect to MQTT broker:', error);
    return null;
  }
}

/**
 * Find a wildcard subscription that matches the given topic
 */
function getWildcardTopic(topic) {
  // Find a wildcard subscription that matches this topic
  for (const [subscribedTopic] of topicSubscriptions) {
    if (subscribedTopic.includes('#') && topic.startsWith(subscribedTopic.replace('#', ''))) {
      return subscribedTopic;
    }
  }
  return null;
}

/**
 * Subscribe to a topic
 * @param {string} topic - The topic to subscribe to
 * @param {function} callback - The callback to invoke when a message is received
 */
function subscribe(topic, callback) {
  // Skip if MQTT is disabled
  if (!mqttEnabled) {
    logger.debug(`MQTT is disabled, ignoring subscription to ${topic}`);
    return;
  }

  if (!client || !client.connected) {
    logger.warn(`MQTT client not connected, storing subscription to ${topic} for later`);
    topicSubscriptions.set(topic, callback);
    return;
  }
  
  client.subscribe(topic, (err) => {
    if (err) {
      logger.error(`Error subscribing to ${topic}:`, err);
    } else {
      logger.info(`Subscribed to ${topic}`);
      topicSubscriptions.set(topic, callback);
    }
  });
}

/**
 * Publish a message to a topic
 * @param {string} topic - The topic to publish to
 * @param {string|object} message - The message to publish
 */
function publish(topic, message) {
  if (!client) {
    logger.error(`Cannot publish to ${topic}: MQTT client not connected`);
    return;
  }
  
  // If MQTT is disabled, just log and return
  if (!mqttEnabled) {
    logger.debug(`MQTT disabled: message not published to ${topic}`);
    return;
  }
  
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  
  client.publish(topic, payload, { qos: 0, retain: false }, (err) => {
    if (err) {
      logger.error(`Error publishing to ${topic}:`, err);
    } else {
      logger.debug(`Published message to ${topic}`);
    }
  });
}

/**
 * Disconnect from MQTT broker
 */
function disconnect() {
  // Skip if MQTT is disabled
  if (!mqttEnabled) {
    return Promise.resolve();
  }

  if (client) {
    return new Promise((resolve) => {
      client.end(true, {}, () => {
        logger.info('Disconnected from MQTT broker');
        topicSubscriptions.clear();
        resolve();
      });
    });
  }
  return Promise.resolve();
}

module.exports = {
  connect,
  subscribe,
  publish,
  disconnect
};
