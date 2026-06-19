const axios = require('axios');

// Test credentials
const credentials = {
  username: 'admin',
  password: 'admin123'  // Default password from our setup script
};

// Function to test login
async function testLogin() {
  try {
    console.log(`Testing login with username: ${credentials.username}`);
    const response = await axios.post('http://localhost:3000/api/auth/login', credentials);
    
    console.log('Login successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.error('Login failed:');
    if (error.response) {
      // The request was made and the server responded with a status code
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from server');
    } else {
      // Something happened in setting up the request
      console.error('Error:', error.message);
    }
    return false;
  }
}

// Run the test
testLogin();
