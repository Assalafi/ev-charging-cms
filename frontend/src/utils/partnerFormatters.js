export const formatNaira = value =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2
  }).format(Number(value) || 0);

export const formatEnergy = value =>
  `${((Number(value) || 0) / 1000).toLocaleString('en-NG', {
    maximumFractionDigits: 2
  })} kWh`;

export const formatDate = value =>
  value ? new Date(value).toLocaleDateString('en-NG') : '—';

export const statusColor = status => ({
  Available: 'success',
  Charging: 'info',
  Preparing: 'warning',
  Finishing: 'secondary',
  Faulted: 'error',
  Unavailable: 'default',
  draft: 'default',
  approved: 'warning',
  paid: 'success',
  cancelled: 'error',
  Completed: 'success',
  InProgress: 'info',
  Stopped: 'default'
}[status] || 'default');
