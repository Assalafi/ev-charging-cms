/**
 * OCPP Web Dashboard
 * 
 * This server provides a web-based management interface for OCPP charging stations
 */

const express = require('express');
const path = require('path');
const axios = require('axios');
const http = require('http');
const WebSocket = require('ws');

// Load configuration
const config = require('../config/dashboard').dashboard;
const API_URL = `${config.api.baseUrl}${config.api.prefix}`;

// Create Express app
const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname, config.staticDir)));
app.use(express.json());

// API proxy routes to communicate with the backend
app.get(config.routes.stations, async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}${config.api.endpoints.stations}`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching stations:', error.message);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

app.get(config.routes.stationDetail, async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}${config.api.endpoints.stationDetail.replace(':id', req.params.id)}`);
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching station ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch station details' });
  }
});

app.get(config.routes.connectors, async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}${config.api.endpoints.connectors.replace(':id', req.params.id)}`);
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching connectors for ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch connectors' });
  }
});

app.get(config.routes.transactions, async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}${config.api.endpoints.transactions.replace(':id', req.params.id)}`, {
      params: req.query
    });
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching transactions for ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.post(config.routes.startTransaction, async (req, res) => {
  try {
    const response = await axios.post(`${API_URL}${config.api.endpoints.startTransaction.replace(':id', req.params.id)}`, req.body);
    res.json(response.data);
  } catch (error) {
    console.error(`Error starting transaction for ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Failed to start transaction' });
  }
});

app.post(config.routes.stopTransaction, async (req, res) => {
  try {
    const response = await axios.post(`${API_URL}${config.api.endpoints.stopTransaction.replace(':id', req.params.id)}`, req.body);
    res.json(response.data);
  } catch (error) {
    console.error(`Error stopping transaction for ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Failed to stop transaction' });
  }
});

app.get(config.routes.ocppStatus, async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}${config.api.endpoints.ocppStatus}`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching OCPP status:', error.message);
    res.status(500).json({ error: 'Failed to fetch OCPP status' });
  }
});

// App version settings (mobile force update)
app.get('/api/mobile/app-version', async (req, res) => {
  try {
    const response = await axios.get(`${API_URL.replace('/api', '')}/api/mobile/app-version`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching app version:', error.message);
    res.status(500).json({ error: 'Failed to fetch app version settings' });
  }
});

app.put('/api/mobile/app-version', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const response = await axios.put(
      `${API_URL.replace('/api', '')}/api/mobile/app-version`,
      req.body,
      { headers: { Authorization: token, 'Content-Type': 'application/json' } }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error updating app version:', error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to update' });
  }
});

// Serve the main HTML file for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, config.staticDir, 'index.html'));
});

// Start the server
server.listen(config.port, config.host, () => {
  console.log(`Web Dashboard running on ${config.baseUrl}`);
});

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ server, path: config.wsPath });

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  // Send initial data
  sendOcppStatus(ws);
  
  // Set up interval to send updates
  const interval = setInterval(() => {
    sendOcppStatus(ws);
  }, config.updateInterval);
  
  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
    clearInterval(interval);
  });
});

// Function to send OCPP status via WebSocket
async function sendOcppStatus(ws) {
  try {
    const response = await axios.get(`${API_URL}/ocpp/status`);
    ws.send(JSON.stringify({
      type: 'ocpp_status',
      data: response.data
    }));
  } catch (error) {
    console.error('Error fetching OCPP status for WebSocket:', error.message);
  }
}
