import api from './api';

const adsBoardService = {
  // Get all ads
  getAds: async (page = 1, limit = 20) => {
    try {
      const response = await api.get('/admin/ads-board', {
        params: { page, limit }
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch ads' };
    }
  },

  // Get ad by ID
  getAdById: async (id) => {
    try {
      const response = await api.get(`/admin/ads-board/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch ad' };
    }
  },

  // Create new ad
  createAd: async (adData, imageFile) => {
    try {
      const formData = new FormData();
      
      // Add text fields
      Object.keys(adData).forEach(key => {
        if (adData[key] !== undefined && adData[key] !== null) {
          formData.append(key, adData[key]);
        }
      });
      
      // Add image file if provided
      if (imageFile) {
        formData.append('photo', imageFile);
      }
      
      const response = await api.post('/admin/ads-board', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to create ad' };
    }
  },

  // Update ad
  updateAd: async (id, adData, imageFile) => {
    try {
      console.log('updateAd called with:', { id, adData, imageFile: imageFile?.name });
      
      if (imageFile) {
        // Update with image file
        const formData = new FormData();
        
        // Add text fields
        Object.keys(adData).forEach(key => {
          if (adData[key] !== undefined && adData[key] !== null) {
            formData.append(key, adData[key]);
          }
        });
        
        // Add image file
        formData.append('photo', imageFile);
        
        console.log('Making PUT request to:', `/admin/ads-board/${id} with FormData`);
        const response = await api.put(`/admin/ads-board/${id}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        console.log('Update response:', response.data);
        return response.data;
      } else {
        // Update without image file - use JSON
        console.log('Making PUT request to:', `/admin/ads-board/${id}/no-file with JSON`);
        const response = await api.put(`/admin/ads-board/${id}/no-file`, adData);
        console.log('Update response:', response.data);
        return response.data;
      }
    } catch (error) {
      console.error('Update error:', error);
      throw error.response?.data || { message: 'Failed to update ad' };
    }
  },

  // Delete ad
  deleteAd: async (id) => {
    try {
      const response = await api.delete(`/admin/ads-board/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to delete ad' };
    }
  },

  // Update ad status
  updateAdStatus: async (id, status) => {
    try {
      const response = await api.put(`/admin/ads-board/${id}/status`, { status });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to update ad status' };
    }
  }
};

export default adsBoardService;
