import React, {
    useState
} from 'react';
import {
    useNavigate,
    useLocation
} from 'react-router-dom';
import {
    Container,
    Box,
    Typography,
    TextField,
    Button,
    Paper,
    Alert,
    CircularProgress
} from '@mui/material';
import {
    EvStation
} from '@mui/icons-material';
import {
    useAuth
} from '../contexts/AuthContext';

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const {
        login
    } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Get return URL from location state or default to dashboard
    const from = location.state?.from?.pathname || '/dashboard';

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!username || !password) {
            setError('Username and password are required');
            return;
        }

        try {
            setError('');
            setLoading(true);

            const result = await login(username, password);

            if (result.success) {
                navigate(from, {
                    replace: true
                });
            } else {
                setError(result.message);
            }
        } catch (error) {
            setError('Failed to log in');
            console.error('Login error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
            }}>
                <Paper elevation={3} sx={{
                    p: 4,
                    width: '100%',
                    borderRadius: 2,
                }}>
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        mb: 3,
                    }}>
                        <EvStation color="primary" sx={{
                            fontSize: 48,
                            mb: 1
                        }} />
                        <Typography component="h1" variant="h5">
                            eRide EV Charging
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Sign in to access the management system
                        </Typography>
                    </Box>

                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <Box component="form" onSubmit={handleSubmit} noValidate>
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            id="username"
                            label="Username"
                            name="username"
                            autoComplete="username"
                            autoFocus
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={loading}
                        />
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="password"
                            label="Password"
                            type="password"
                            id="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                        />
                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            sx={{
                                mt: 3,
                                mb: 2,
                                py: 1.2
                            }}
                            disabled={loading}
                        >
                            {loading ? <CircularProgress size={24} /> : 'Sign In'}
                        </Button>

                        <Box sx={{
                            mt: 2,
                            textAlign: 'center'
                        }}>
                            <Typography variant="caption" color="text.secondary">
                                Default credentials: admin / admin123
                            </Typography>
                        </Box>
                    </Box>
                </Paper>
            </Box>
        </Container>
    );
    }

    export default Login;