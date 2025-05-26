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
      const storedToken = localStorage.getItem('token');
      
      if (storedToken) {
        try {
          // Check if token is expired
          const decodedToken = jwtDecode(storedToken);
          const currentTime = Date.now() / 1000;
          
          if (decodedToken.exp > currentTime) {
            // Set auth header for all requests
            axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
            
            // Get user profile
            const response = await api.get('/auth/me');
            setCurrentUser(response.data.user);
            setToken(storedToken);
          } else {
            // Token is expired
            localStorage.removeItem('token');
            delete axios.defaults.headers.common['Authorization'];
          }
        } catch (error) {
          console.error('Auth initialization error:', error);
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
        }
      }
      
      setIsInitialized(true);
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
      
      const { token, user } = response.data;
      
      // Save token to localStorage
      localStorage.setItem('token', token);
      
      // Set auth header for all requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setCurrentUser(user);
      setToken(token);
      
      return { success: true, user };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed'
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
