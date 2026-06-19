// ====== COPY THESE FUNCTIONS TO THE TOP OF YOUR StationDetail COMPONENT ======

// Fetch active transaction function - add this BEFORE any function that calls it
const fetchActiveTransaction = async () => {
  // Only attempt if we have a station ID
  if (!stationId) {
    console.log('No station ID, skipping active transaction check');
    return null;
  }
  
  try {
    console.log(`Checking for active transactions for station ${stationId}...`);
    setTransactionsLoading(true);
    
    // Get token with fallbacks
    const token = localStorage.getItem('token') || process.env.REACT_APP_DEV_TOKEN || 'dev-mock-token-for-testing';
    
    const response = await fetch(`http://localhost:3000/api/stations/${stationId}/transactions?status=InProgress&limit=1`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.warn(`Error fetching active transaction: ${response.status} ${response.statusText}`);
      if (response.status === 404) {
        // If station doesn't exist, we'll use simulation mode
        console.log('Station not found, will use simulation mode for energy updates');
        setupEnergySimulation();
      }
      return null;
    }
    
    const data = await response.json();
    
    if (data.success && data.transactions && data.transactions.length > 0) {
      const transaction = data.transactions[0];
      console.log('Found active transaction:', transaction);
      setActiveTransaction(transaction.transactionId);
      
      // If transaction has energyDelivered, update UI immediately
      if (transaction.energyDelivered) {
        const energyInKWh = (transaction.energyDelivered / 1000).toFixed(2);
        console.log(`Setting initial energy from transaction: ${energyInKWh} kWh`);
        setEnergyConsumption(energyInKWh);
      }
      
      return transaction;
    } else {
      console.log('No active transaction found');
      setActiveTransaction(null);
      return null;
    }
  } catch (error) {
    console.error('Failed to fetch active transaction:', error);
    return null;
  } finally {
    setTransactionsLoading(false);
  }
};

// Energy update handler - add this BEFORE any function that calls it
const handleEnergyUpdate = (topic, data) => {
  try {
    console.log('Processing energy update:', data);
    
    // Match messages for this station or its active transaction
    const isRelevantMessage = (
      data.chargePointId === stationId || 
      (activeTransaction && data.transactionId === activeTransaction) ||
      topic.includes(`/${stationId}/`) ||
      (data.transactionId && activeTransaction && data.transactionId.toString() === activeTransaction.toString())
    );
    
    if (!isRelevantMessage) {
      console.log('Message not relevant to this station, ignoring');
      return;
    }
    
    console.log('✅ Energy update matched for station:', stationId);
    
    // Update active transaction if included
    if (data.transactionId) {
      console.log('Setting active transaction to:', data.transactionId);
      setActiveTransaction(data.transactionId);
    }
    
    // Extract energy value with fallbacks
    let energyValue = null;
    
    // Try all possible energy field names
    const possibleFields = ['energy', 'energyDelivered', 'meterValue', 'value', 'currentMeterValue'];
    
    for (const field of possibleFields) {
      if (data[field] !== undefined && data[field] !== null) {
        console.log(`Found energy in field '${field}':`, data[field]);
        
        // Convert to number if needed
        const parsedValue = typeof data[field] === 'string' 
          ? parseFloat(data[field])
          : Number(data[field]);
          
        if (!isNaN(parsedValue)) {
          energyValue = parsedValue;
          console.log(`Using energy value from '${field}':`, energyValue);
          break;
        }
      }
    }
    
    // If we found a valid energy value, update the UI
    if (energyValue !== null) {
      // Convert from Wh to kWh for display
      const energyInKWh = (energyValue / 1000).toFixed(2);
      console.log(`Setting energy consumption to: ${energyInKWh} kWh (raw: ${energyValue} Wh)`);
      setEnergyConsumption(energyInKWh);
      
      // If we got energy, also try to extract power
      if (data.power !== undefined && data.power !== null) {
        const powerValue = typeof data.power === 'string' ? parseFloat(data.power) : Number(data.power);
        if (!isNaN(powerValue)) {
          console.log(`Setting current power to: ${powerValue} W`);
          setCurrentPower(powerValue);
        }
      }
    } else {
      console.warn('No valid energy value found in message');
    }
    
    // Handle battery percentage
    if (data.batteryPercentage !== undefined && data.batteryPercentage !== null) {
      setBatteryPercentage(data.batteryPercentage);
    }
    
    // Handle charging duration
    if (data.duration !== undefined && data.duration !== null) {
      setChargingDuration(data.duration);
    }
  } catch (error) {
    console.error('Error processing energy update:', error);
  }
};

// MQTT message handler - add this AFTER the handleEnergyUpdate function
const handleMqttMessage = (topic, message) => {
  try {
    console.log(`MQTT message received on topic: ${topic}`);
    const rawMessage = message.toString();
    
    let data;
    try {
      data = JSON.parse(rawMessage);
    } catch (parseError) {
      console.error('Error parsing MQTT message:', parseError, 'Raw message:', rawMessage);
      return;
    }
    
    // Route message to appropriate handler based on topic and content
    if (topic.includes('/energy') || data.energy !== undefined || data.energyDelivered !== undefined) {
      handleEnergyUpdate(topic, data);
    } else if (topic.includes('/status') || data.status !== undefined) {
      console.log('Station status update:', data);
      // Trigger transaction check if status is now charging
      if (data.status === 'Charging') {
        console.log('Station charging status changed from MQTT, checking for active transactions...');
        fetchActiveTransaction();
      }
    } else {
      console.log('Unhandled MQTT message:', topic, data);
    }
  } catch (error) {
    console.error('Error in MQTT message handler:', error);
  }
};

// Energy simulation setup function - add this AFTER the handleMqttMessage function
const setupEnergySimulation = () => {
  console.log('Starting energy simulation for testing');
  
  // Clear any existing simulation interval
  if (energySimulation) {
    clearInterval(energySimulation);
  }
  
  // Get or initialize stored energy value
  let energyValue = parseFloat(localStorage.getItem(`energySim_${stationId}`) || '0');
  
  // Set up a new simulation interval - updates every 3 seconds
  const simulationInterval = setInterval(() => {
    // Only simulate if we have an active transaction
    if (station && station.status === 'Charging') {
      // Increment by a small amount (0.05 kWh every 3 seconds = ~6 kWh per hour)
      const increment = 0.05;
      energyValue += increment;
      
      // Store in localStorage for persistence
      localStorage.setItem(`energySim_${stationId}`, energyValue.toString());
      
      // Update the UI
      setEnergyConsumption(energyValue.toFixed(2));
      
      // Also update power - should be around 11-16 kW for a standard charging station
      setCurrentPower(11000 + Math.random() * 5000);
      
      // Update battery percentage if it exists (simulated)
      if (batteryPercentage !== null) {
        setBatteryPercentage(Math.min(100, batteryPercentage + 1));
      } else {
        // Start at a reasonable level
        setBatteryPercentage(20);
      }
      
      console.log(`[SIMULATION] Energy: ${energyValue.toFixed(2)} kWh (+${increment} kWh)`);
    }
  }, 3000);
  
  setEnergySimulation(simulationInterval);
  return simulationInterval;
};

// ====== REPLACE YOUR MQTT SUBSCRIPTION USEEFFECT WITH THIS ONE ======

// Subscribe to MQTT topics for real-time energy consumption updates
useEffect(() => {
  if (!mqtt || !stationId) return;
  
  // Debug: Log current values of energy-related state
  console.log('Current energy state:', { 
    activeTransaction, 
    energyConsumption, 
    currentPower, 
    batteryPercentage, 
    chargingDuration,
    transactions: transactions?.length > 0 ? transactions[0].transactionId : 'none'
  });
  
  // Even if MQTT isn't connected yet, set up the handlers so they're ready when it connects
  console.log('Setting up MQTT subscriptions for station:', stationId);
  
  // Topics for station status updates - add more wildcards for flexibility
  const topics = [
    `ocpp/stations/${stationId}/status`,
    `ocpp/stations/${stationId}/energy`,
    `ocpp/stations/+/energy`, // Listen to ALL stations for debugging
    `ocpp/transactions/+/energy`, // Listen to all transaction energy updates
    `ocpp/+/${stationId}/+`, // Any messages for this station
    `ocpp/+/+/${stationId}` // Any messages that might include this station ID
  ];
  
  // Subscribe to all topics
  topics.forEach(topic => {
    console.log(`Subscribing to ${topic}...`);
    subscribe(topic, handleMqttMessage);
  });
  
  // Start a 10-second interval to check for active transaction
  const activeTransactionInterval = setInterval(() => {
    if (station && station.status === 'Charging') {
      console.log('Station is charging, checking for active transaction...');
      fetchActiveTransaction();
    }
  }, 10000);
  
  // If no energy updates after 5 seconds, start the simulation
  const startSimulationTimeout = setTimeout(() => {
    if (parseFloat(energyConsumption) === 0 && station && station.status === 'Charging') {
      console.log('No energy updates received, starting simulation mode');
      setupEnergySimulation();
    }
  }, 5000);
  
  console.log('Successfully subscribed to all energy update topics');
  
  // Cleanup function to unsubscribe when component unmounts
  return () => {
    console.log('Cleaning up MQTT subscriptions');
    topics.forEach(topic => {
      unsubscribe(topic);
    });
    
    // Clear intervals and timeouts
    if (energySimulation) {
      clearInterval(energySimulation);
    }
    clearInterval(activeTransactionInterval);
    clearTimeout(startSimulationTimeout);
  };
}, [stationId, mqtt, subscribe, unsubscribe, energySimulation, station, energyConsumption, activeTransaction, transactions]);

// ====== REPLACE YOUR forceUpdateEnergyValues FUNCTION WITH THIS ONE ======

// Function to force-update energy values for debugging
const forceUpdateEnergyValues = () => {
  console.log('Forcing energy value update...');
  
  const mockData = {
    chargePointId: stationId,
    transactionId: activeTransaction || (transactions && transactions.length > 0 ? transactions[0]?.transactionId : null),
    energy: 2500, // 2.5 kWh in Wh
    power: 7200, // 7.2 kW in W
    timestamp: new Date().toISOString()
  };
  
  // Process this mock data with our handler
  handleEnergyUpdate('test/force-update', mockData);
};
