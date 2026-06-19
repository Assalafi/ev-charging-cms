// Debug script to check environment variables
console.log('=== Frontend Environment Variables ===');
console.log('REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('REACT_APP_NODE_ENV:', process.env.REACT_APP_NODE_ENV);
console.log('=== API Configuration ===');
console.log('Base URL will be:', process.env.REACT_APP_API_URL || 'https://evcharging.eride.ng/api');
