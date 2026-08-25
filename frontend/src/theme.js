import { alpha, createTheme } from '@mui/material/styles';

const ink = '#101828';
const defaultPrimary = '#2563EB';
const defaultSecondary = '#0E9F6E';

export const createAppTheme = (primary = defaultPrimary, secondary = defaultSecondary) => createTheme({
  palette: {
    mode: 'light',
    primary: { main: primary, light: '#60A5FA', dark: '#1D4ED8', contrastText: '#FFFFFF' },
    secondary: { main: secondary, light: '#34D399', dark: '#047857', contrastText: '#FFFFFF' },
    success: { main: '#12B76A', light: '#ECFDF3', dark: '#027A48' },
    warning: { main: '#F79009', light: '#FFFAEB', dark: '#B54708' },
    error: { main: '#F04438', light: '#FEF3F2', dark: '#B42318' },
    info: { main: '#0BA5EC', light: '#F0F9FF', dark: '#026AA2' },
    background: { default: '#F4F7FB', paper: '#FFFFFF' },
    text: { primary: ink, secondary: '#667085', disabled: '#98A2B3' },
    divider: '#E4E7EC',
    status: {
      available: '#12B76A',
      charging: '#2563EB',
      unavailable: '#98A2B3',
      faulted: '#F04438',
      preparing: '#F79009',
      finishing: '#0BA5EC',
      reserved: '#7F56D9'
    }
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.12, fontWeight: 750, letterSpacing: '-0.04em' },
    h2: { fontSize: 'clamp(1.75rem, 3vw, 2.25rem)', lineHeight: 1.18, fontWeight: 750, letterSpacing: '-0.035em' },
    h3: { fontSize: 'clamp(1.45rem, 2.4vw, 1.8rem)', lineHeight: 1.22, fontWeight: 720, letterSpacing: '-0.025em' },
    h4: { fontSize: '1.375rem', lineHeight: 1.3, fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontSize: '1.125rem', lineHeight: 1.4, fontWeight: 700, letterSpacing: '-0.015em' },
    h6: { fontSize: '1rem', lineHeight: 1.45, fontWeight: 700 },
    subtitle1: { fontWeight: 650 },
    subtitle2: { fontWeight: 650 },
    body1: { lineHeight: 1.65 },
    body2: { lineHeight: 1.55 },
    button: { fontWeight: 650, letterSpacing: '-0.01em' },
    caption: { lineHeight: 1.45, letterSpacing: '0.01em' }
  },
  shadows: [
    'none',
    '0 1px 2px rgba(16, 24, 40, 0.04)',
    '0 2px 8px rgba(16, 24, 40, 0.06)',
    '0 4px 12px rgba(16, 24, 40, 0.07)',
    '0 8px 20px rgba(16, 24, 40, 0.08)',
    '0 12px 28px rgba(16, 24, 40, 0.09)',
    '0 16px 36px rgba(16, 24, 40, 0.1)',
    ...Array(18).fill('0 20px 40px rgba(16, 24, 40, 0.11)')
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { scrollbarColor: '#CBD5E1 transparent' },
        '::selection': { backgroundColor: alpha(primary, 0.18) },
        '*': { boxSizing: 'border-box' },
        'html, body, #root': { minHeight: '100%' }
      }
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', borderRadius: 10, minHeight: 42, paddingInline: 18 },
        containedPrimary: { boxShadow: `0 8px 18px ${alpha(primary, 0.22)}` },
        outlined: { borderColor: '#D0D5DD', '&:hover': { borderColor: '#98A2B3', backgroundColor: '#F9FAFB' } }
      }
    },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: 10 } }
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: 'none' } }
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: '1px solid #EAECF0', borderRadius: 18, boxShadow: '0 1px 3px rgba(16, 24, 40, 0.04)' }
      }
    },
    MuiCardHeader: {
      styleOverrides: { root: { padding: '20px 22px 12px' }, title: { fontSize: '1rem', fontWeight: 700 } }
    },
    MuiCardContent: {
      styleOverrides: { root: { padding: 22, '&:last-child': { paddingBottom: 22 } } }
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 10,
          backgroundColor: '#FFFFFF',
          '& fieldset': { borderColor: '#D0D5DD' },
          '&:hover fieldset': { borderColor: '#98A2B3' },
          '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(primary, 0.12)}` }
        }
      }
    },
    MuiInputLabel: { styleOverrides: { root: { fontWeight: 550 } } },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 8, fontWeight: 650 }, sizeSmall: { height: 26, fontSize: '0.75rem' } }
    },
    MuiTableContainer: {
      styleOverrides: { root: { border: '1px solid #EAECF0', borderRadius: 14 } }
    },
    MuiTableHead: {
      styleOverrides: { root: { backgroundColor: '#F8FAFC' } }
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: '#EAECF0', padding: '14px 16px' },
        head: { color: '#475467', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.035em', textTransform: 'uppercase' }
      }
    },
    MuiTableRow: {
      styleOverrides: { root: { '&:last-child td': { borderBottom: 0 }, '&.MuiTableRow-hover:hover': { backgroundColor: '#F8FAFC' } } }
    },
    MuiDataGrid: {
      styleOverrides: {
        root: { border: '1px solid #EAECF0', borderRadius: 14, backgroundColor: '#FFFFFF' },
        columnHeaders: { backgroundColor: '#F8FAFC', borderBottomColor: '#EAECF0' },
        columnHeaderTitle: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.035em', textTransform: 'uppercase' },
        cell: { borderBottomColor: '#EAECF0' },
        row: { '&:hover': { backgroundColor: '#F8FAFC' } }
      }
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 20, border: '1px solid #EAECF0' } } },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 750, letterSpacing: '-0.02em' } } },
    MuiMenu: { styleOverrides: { paper: { borderRadius: 12, border: '1px solid #EAECF0', boxShadow: '0 12px 30px rgba(16,24,40,.12)' } } },
    MuiMenuItem: { styleOverrides: { root: { minHeight: 42, borderRadius: 8, marginInline: 6, width: 'auto' } } },
    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: { root: { border: '1px solid #EAECF0', borderRadius: '12px !important', marginBottom: 10, overflow: 'hidden', '&::before': { display: 'none' } } }
    },
    MuiAccordionSummary: { styleOverrides: { root: { minHeight: 52, paddingInline: 18 }, content: { marginBlock: 12 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 12 }, message: { fontWeight: 520 } } },
    MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: '3px 3px 0 0' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 650, minHeight: 46 } } },
    MuiTooltip: { styleOverrides: { tooltip: { borderRadius: 8, padding: '8px 10px', fontSize: '0.75rem' } } },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: 999, height: 7 } } },
    MuiSkeleton: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiPaginationItem: { styleOverrides: { root: { borderRadius: 9, fontWeight: 600 } } },
    MuiSwitch: { styleOverrides: { track: { borderRadius: 999 }, thumb: { boxShadow: '0 1px 3px rgba(16,24,40,.22)' } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: 10 } } },
    MuiBadge: { styleOverrides: { badge: { fontWeight: 700 } } },
    MuiFab: { styleOverrides: { root: { boxShadow: '0 10px 24px rgba(16,24,40,.16)' } } }
  }
});

const theme = createAppTheme();

export default theme;
