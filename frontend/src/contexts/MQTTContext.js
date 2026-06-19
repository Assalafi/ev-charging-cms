import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import mqtt from 'mqtt';
import { useAuth } from './AuthContext';

const MQTTContext = createContext();

export function useMQTT() {
  return useContext(MQTTContext);
}

export function MQTTProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [client, setClient] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [subscriptions, setSubscriptions] = useState({});
  const [stationStatus, setStationStatus] = useState({});

  // Connect to MQTT broker
  useEffect(() => {
    if (!isAuthenticated) {
      // Don't connect if not authenticated
      return;
    }

    // MQTT broker URL from environment variable
    const url = process.env.REACT_APP_MQTT_WS_URL || `wss://evcharging.eride.ng/mqtt/`;
    const clientId = `ev_cms_web_${Math.random().toString(16).substring(2, 10)}`;
    const options = {
      clientId,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30 * 1000,
  username: process.env.REACT_APP_MQTT_USERNAME || 'ev_cms_admin',
  password: process.env.REACT_APP_MQTT_PASSWORD || 'Assalafi@139'
    };

    console.log('Connecting to MQTT broker...');
    const mqttClient = mqtt.connect(url, options);

    mqttClient.on('connect', () => {
      console.log('Connected to MQTT broker');
      setIsConnected(true);
      setConnectionError(null);
      
      // Subscribe to all station status updates
      mqttClient.subscribe('ocpp/+/status', (err) => {
        if (err) console.error('Error subscribing to station status:', err);
      });
    });

    mqttClient.on('message', (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle station status updates
        if (topic.match(/^ocpp\/(.+)\/status$/)) {
          const chargePointId = topic.split('/')[1];
          setStationStatus(prev => ({
            ...prev,
            [chargePointId]: {
              ...data,
              lastUpdated: new Date()
            }
          }));
        }
        
        // Handle subscribed topics
        if (subscriptions[topic]) {
          subscriptions[topic].forEach(callback => {
            try {
              callback(data);
            } catch (error) {
              console.error(`Error in subscription callback for ${topic}:`, error);
            }
          });
        }
      } catch (error) {
        console.error(`Error processing MQTT message for ${topic}:`, error);
      }
    });

    mqttClient.on('error', (err) => {
      console.error('MQTT error:', err);
      setConnectionError(err.message);
    });

    mqttClient.on('offline', () => {
      console.log('MQTT client is offline');
      setIsConnected(false);
    });

    mqttClient.on('reconnect', () => {
      console.log('Reconnecting to MQTT broker...');
    });

    setClient(mqttClient);

    // Cleanup on unmount
    return () => {
      if (mqttClient) {
        console.log('Disconnecting from MQTT broker');
        mqttClient.end();
      }
    };
  }, [isAuthenticated]);

  // Subscribe to a topic
  const subscribe = useCallback((topic, callback) => {
    if (!client || !isConnected) {
      console.warn(`Cannot subscribe to ${topic}, client not connected`);
      return () => {}; // Return unsubscribe function
    }

    client.subscribe(topic, (err) => {
      if (err) {
        console.error(`Error subscribing to ${topic}:`, err);
        return;
      }

      console.log(`Subscribed to ${topic}`);
      setSubscriptions(prev => {
        const topicCallbacks = prev[topic] || [];
        return {
          ...prev,
          [topic]: [...topicCallbacks, callback]
        };
      });
    });

    // Return unsubscribe function
    return () => {
      setSubscriptions(prev => {
        const topicCallbacks = prev[topic] || [];
        const updatedCallbacks = topicCallbacks.filter(cb => cb !== callback);
        
        const newSubscriptions = { ...prev };
        
        if (updatedCallbacks.length === 0) {
          // No more callbacks for this topic, unsubscribe
          if (client && isConnected) {
            client.unsubscribe(topic);
            console.log(`Unsubscribed from ${topic}`);
          }
          delete newSubscriptions[topic];
        } else {
          newSubscriptions[topic] = updatedCallbacks;
        }
        
        return newSubscriptions;
      });
    };
  }, [client, isConnected]);

  // Publish a message to a topic
  const publish = useCallback((topic, message, options = {}) => {
    if (!client || !isConnected) {
      console.warn(`Cannot publish to ${topic}, client not connected`);
      return false;
    }

    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    
    client.publish(topic, payload, options, (err) => {
      if (err) {
        console.error(`Error publishing to ${topic}:`, err);
        return false;
      }
      
      console.log(`Published to ${topic}`);
      return true;
    });
  }, [client, isConnected]);

  // Subscribe to a specific station's updates
  const subscribeToStation = useCallback((chargePointId, callback) => {
    return subscribe(`ocpp/${chargePointId}/#`, callback);
  }, [subscribe]);

  // Send a command to a station
  const sendCommand = useCallback((chargePointId, command, payload = {}) => {
    return publish(`cms/commands/${chargePointId}/${command}`, payload);
  }, [publish]);

  const value = {
    isConnected,
    connectionError,
    stationStatus,
    subscribe,
    publish,
    subscribeToStation,
    sendCommand
  };

  return (
    <MQTTContext.Provider value={value}>
      {children}
    </MQTTContext.Provider>
  );
}
