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

// Create Express app
const app = express();
const server = http.createServer(app);

// Configuration
const PORT = 3001;
const API_URL = 'http://localhost:3000/api';

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API proxy routes to communicate with the backend
app.get('/api/stations', async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}/stations/diagnostic`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching stations:', error.message);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

app.get('/api/stations/:id', async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}/stations/diagnostic/${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching station ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch station details' });
  }
});

app.get('/api/stations/:id/connectors', async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}/stations/diagnostic/${req.params.id}/connectors`);
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching connectors for ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch connectors' });
  }
});

app.get('/api/stations/:id/transactions', async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}/stations/diagnostic/${req.params.id}/transactions`, {
      params: req.query
    });
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching transactions for ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.post('/api/stations/:id/start-transaction', async (req, res) => {
  try {
    const response = await axios.post(`${API_URL}/stations/diagnostic/${req.params.id}/remote-start`, req.body);
    res.json(response.data);
  } catch (error) {
    console.error(`Error starting transaction for ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Failed to start transaction' });
  }
});

app.post('/api/stations/:id/stop-transaction', async (req, res) => {
  try {
    const response = await axios.post(`${API_URL}/stations/diagnostic/${req.params.id}/remote-stop`, req.body);
    res.json(response.data);
  } catch (error) {
    console.error(`Error stopping transaction for ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Failed to stop transaction' });
  }
});

app.get('/api/ocpp/status', async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}/ocpp/status`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching OCPP status:', error.message);
    res.status(500).json({ error: 'Failed to fetch OCPP status' });
  }
});

// Serve the main HTML file for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
server.listen(PORT, () => {
  console.log(`Web Dashboard running on http://localhost:${PORT}`);
});

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  // Send initial data
  sendOcppStatus(ws);
  
  // Set up interval to send updates
  const interval = setInterval(() => {
    sendOcppStatus(ws);
  }, 5000);
  
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
