import axios from 'axios';
import { API_BASE_URL } from '../config';

const getMeterValuesByTransaction = async (transactionId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/meter-values/transaction/${transactionId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching meter values:', error);
    throw error;
  }
};

const getMeterValuesByStation = async (chargePointId, startDate, endDate) => {
  try {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    const response = await axios.get(`${API_BASE_URL}/meter-values/station/${chargePointId}`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching station meter values:', error);
    throw error;
  }
};

export default {
  getMeterValuesByTransaction,
  getMeterValuesByStation
};
