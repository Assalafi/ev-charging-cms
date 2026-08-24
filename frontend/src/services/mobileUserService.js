import api from './api';

const mobileUserService = {
  // Get all mobile users with pagination and search
  getMobileUsers: async (page = 1, limit = 20, search = '') => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(search && { search })
    });
    
    const response = await api.get(`/admin/mobile-users?${params}`);
    return response.data;
  },

  // Get mobile user details by ID
  getMobileUserById: async (id) => {
    const response = await api.get(`/admin/mobile-users/${id}`);
    return response.data;
  },

  // Update mobile user status
  updateUserStatus: async (id, status) => {
    const response = await api.put(`/admin/mobile-users/${id}/status`, { status });
    return response.data;
  },

  // Get mobile user statistics
  getMobileUserStats: async () => {
    const response = await api.get('/admin/mobile-users/stats');
    return response.data;
  }
};

export default mobileUserService;
