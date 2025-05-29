import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import api from '../services/api';
import jwtDecode from 'jwt-decode';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize auth state from localStorage on component mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedToken = localStorage.getItem('token');
        
        if (storedToken) {
          // Check if token is expired
          const decodedToken = jwtDecode(storedToken);
          const currentTime = Date.now() / 1000;
          
          if (decodedToken.exp > currentTime) {
            // Set auth header for all requests
            api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
            
            // Get user profile
            const response = await api.get('/auth/me');
            if (response.data.success) {
              setCurrentUser(response.data.user);
              setToken(storedToken);
            } else {
              throw new Error('Failed to get user profile');
            }
          } else {
            throw new Error('Token expired');
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
        setCurrentUser(null);
        setToken(null);
      } finally {
        setIsInitialized(true);
      }
    };

    initAuth();
  }, []);

  // Login function
  const login = async (username, password) => {
    try {
      const response = await api.post('/auth/login', {
        username,
        password
      });
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Login failed');
      }
      
      const { token, user } = response.data;
      
      // Save token to localStorage
      localStorage.setItem('token', token);
      
      // Set auth header for all requests
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setCurrentUser(user);
      setToken(token);
      
      return { success: true, user };
    } catch (error) {
      console.error('Login error:', error);
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      setCurrentUser(null);
      setToken(null);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Login failed'
      };
    }
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setCurrentUser(null);
    setToken(null);
  };

  // Check if user has a specific role
  const hasRole = (roles) => {
    if (!currentUser) return false;
    
    if (typeof roles === 'string') {
      return currentUser.role === roles;
    }
    
    return roles.includes(currentUser.role);
  };

  const value = {
    currentUser,
    token,
    isInitialized,
    login,
    logout,
    hasRole,
    isAuthenticated: !!currentUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
