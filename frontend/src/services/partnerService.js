import api from './api';

function downloadBlob(response, fallbackName) {
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackName;
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

const partnerService = {
  getSummary: (range = 'monthly') =>
    api.get('/partner/dashboard/summary', { params: { range } }),
  getLocations: () => api.get('/partner/monitor/locations'),
  getStations: () => api.get('/partner/monitor/stations'),
  getPerformance: params => api.get('/partner/performance', { params }),
  exportPerformance: async params => {
    const response = await api.get('/partner/performance/export.csv', {
      params,
      responseType: 'blob'
    });
    downloadBlob(response, 'partner-performance.csv');
  },
  getTransactions: params => api.get('/partner/transactions', { params }),
  exportTransactions: async params => {
    const response = await api.get('/partner/transactions/export.csv', {
      params,
      responseType: 'blob'
    });
    downloadBlob(response, 'partner-transactions.csv');
  },
  getSettlements: params => api.get('/partner/settlements', { params }),
  getSettlement: id => api.get(`/partner/settlements/${id}`),
  exportSettlementCsv: async id => {
    const response = await api.get(`/partner/settlements/${id}/export.csv`, {
      responseType: 'blob'
    });
    downloadBlob(response, `settlement-${id}-transactions.csv`);
  },
  exportSettlementPdf: async id => {
    const response = await api.get(`/partner/settlements/${id}/statement.pdf`, {
      responseType: 'blob'
    });
    downloadBlob(response, `settlement-${id}-statement.pdf`);
  },
  getProfile: () => api.get('/partner/profile'),
  updateProfile: data => api.put('/partner/profile', data)
};

export default partnerService;
