import api from './api';

const errorMessage = (error, fallback) => (
  error?.response?.data?.message
  || error?.serverMessage
  || error?.data?.message
  || error?.message
  || fallback
);

export const resolveAdPhotoUrl = value => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || /^data:/i.test(value) || /^blob:/i.test(value)) return value;
  try {
    const origin = new URL(api.defaults.baseURL, window.location.origin).origin;
    return new URL(value, `${origin}/`).toString();
  } catch (_) {
    return value;
  }
};

const appendAdFields = (form, adData) => {
  Object.entries(adData || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, value);
  });
};

const adsBoardService = {
  getAds: async ({ page = 1, limit = 20, search = '', status = 'all' } = {}) => {
    try {
      const response = await api.get('/admin/ads-board', { params: { page, limit, search, status } });
      return response.data;
    } catch (error) {
      throw new Error(errorMessage(error, 'Failed to fetch ads'));
    }
  },

  getAdById: async id => {
    try {
      const response = await api.get(`/admin/ads-board/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(errorMessage(error, 'Failed to fetch ad'));
    }
  },

  createAd: async (adData, imageFile) => {
    try {
      const form = new FormData();
      appendAdFields(form, adData);
      if (imageFile) form.append('photo', imageFile);
      const response = await api.post('/admin/ads-board', form);
      return response.data;
    } catch (error) {
      throw new Error(errorMessage(error, 'Failed to create ad'));
    }
  },

  updateAd: async (id, adData, imageFile, { removePhoto = false } = {}) => {
    try {
      if (imageFile) {
        const form = new FormData();
        appendAdFields(form, adData);
        form.append('photo', imageFile);
        const response = await api.put(`/admin/ads-board/${id}`, form);
        return response.data;
      }
      const response = await api.put(`/admin/ads-board/${id}`, { ...adData, removePhoto });
      return response.data;
    } catch (error) {
      throw new Error(errorMessage(error, 'Failed to update ad'));
    }
  },

  deleteAd: async id => {
    try {
      const response = await api.delete(`/admin/ads-board/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(errorMessage(error, 'Failed to delete ad'));
    }
  },

  updateAdStatus: async (id, status) => {
    try {
      const response = await api.put(`/admin/ads-board/${id}/status`, { status });
      return response.data;
    } catch (error) {
      throw new Error(errorMessage(error, 'Failed to update ad status'));
    }
  },

  getMobileAds: async () => {
    try {
      const response = await api.get('/mobile/ads-board');
      return response.data;
    } catch (error) {
      throw new Error(errorMessage(error, 'Failed to fetch mobile ads'));
    }
  }
};

export default adsBoardService;
