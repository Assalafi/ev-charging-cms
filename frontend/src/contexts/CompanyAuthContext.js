import React, { createContext, useContext, useEffect, useState } from 'react';
import jwtDecode from 'jwt-decode';
import companyApi from '../services/companyApi';

const CompanyAuthContext = createContext(null);
export const useCompanyAuth = () => useContext(CompanyAuthContext);

export function CompanyAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('company_token'));
  const [isInitialized, setInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        const stored = localStorage.getItem('company_token');
        if (!stored) return;
        const decoded = jwtDecode(stored);
        if (!decoded.exp || decoded.exp <= Date.now() / 1000) throw new Error('expired');
        const response = await companyApi.get('/company/auth/me');
        if (!response.data.success) throw new Error('profile');
        setToken(stored); setUser(response.data.user);
      } catch (error) {
        localStorage.removeItem('company_token'); setToken(null); setUser(null);
      } finally { setInitialized(true); }
    };
    initialize();
  }, []);

  const login = async (email, password) => {
    try {
      const response = await companyApi.post('/company/auth/login', { email, password });
      localStorage.setItem('company_token', response.data.token); setToken(response.data.token); setUser(response.data.user);
      return { success: true, user: response.data.user };
    } catch (error) { return { success: false, message: error.serverMessage || error.message }; }
  };
  const logout = () => { localStorage.removeItem('company_token'); setToken(null); setUser(null); };
  const canManage = user && ['owner', 'manager'].includes(user.role);
  return <CompanyAuthContext.Provider value={{ user, token, isInitialized, isAuthenticated: Boolean(user), login, logout, canManage }}>{children}</CompanyAuthContext.Provider>;
}

