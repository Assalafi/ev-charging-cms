// Simple test script to verify Nigerian API connectivity
const axios = require('axios');

// Create a direct API call to test connectivity
const testNigerianAPI = async () => {
  try {
    // Make direct API call to transactions endpoint with mock token
    const response = await axios.get('http://localhost:3000/api/transactions', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev-mock-token-for-testing'
      }
    });
    
    console.log('API TEST SUCCESS!');
    console.log('Status:', response.status);
    console.log('Nigerian Transactions Count:', response.data.count);
    
    // Log sample transaction if available
    if (response.data.transactions && response.data.transactions.length > 0) {
      console.log('Sample Nigerian Transaction:');
      console.log(response.data.transactions[0]);
    }
    
    return response.data;
  } catch (error) {
    console.error('API TEST FAILED!');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    throw error;
  }
};

// Run the test
testNigerianAPI()
  .then(data => console.log('Test completed successfully'))
  .catch(err => console.log('Test failed with error'));
