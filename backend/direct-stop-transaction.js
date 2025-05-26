require('dotenv').config();
const axios = require('axios');
const logger = require('./src/utils/logger');

// Direct script to send a RemoteStopTransaction via the API
async function directStopTransaction() {
  try {
    const stationId = 'TA002';
    const transactionId = 785020; // Using the transaction ID we identified
    
    console.log(`Sending RemoteStopTransaction command to ${stationId} for transaction ${transactionId}`);
    
    // Call the API endpoint directly
    const response = await axios.post(`http://localhost:3000/api/remote-commands/${stationId}/remote-stop`, {
      transactionId
    });
    
    console.log('API Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\nCommand sent successfully. Check the server logs for the station response.');
    
  } catch (error) {
    console.error('Error sending command:');
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`Status: ${error.response.status}`);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from server');
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error message:', error.message);
    }
  }
}

// Run the direct command
directStopTransaction();
