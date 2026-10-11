import api from './api';

const publicNetworkService = {
  getSnapshot: async () => {
    const response = await api.get('/public/network');
    return response.data;
  }
};

export default publicNetworkService;

