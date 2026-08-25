import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import settingsService from '../services/settingsService';

export const defaultBranding = {
  systemName: 'EV Charge',
  shortName: 'EV Charge',
  loginSubtitle: 'Network management',
  metaTitle: 'EV Charge - Charging Management System',
  metaDescription: 'Smart EV charging network management system',
  metaKeywords: 'EV charging, electric vehicles, charging stations',
  primaryColor: '#2563EB',
  secondaryColor: '#0E9F6E',
  logoUrl: null,
  faviconUrl: null,
  revision: 0
};

const BrandingContext = createContext({ branding: defaultBranding });

function apiOrigin() {
  try {
    return new URL(api.defaults.baseURL, window.location.origin).origin;
  } catch (_) {
    return window.location.origin;
  }
}

export function resolveBrandAsset(value, revision) {
  if (!value) return null;
  const url = /^https?:\/\//i.test(value) ? value : `${apiOrigin()}${value.startsWith('/') ? '' : '/'}${value}`;
  if (!revision) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${revision}`;
}

function setMeta(name, content) {
  let element = document.querySelector(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('name', name);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content || '');
}

function setPropertyMeta(property, content) {
  let element = document.querySelector(`meta[property="${property}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('property', property);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content || '');
}

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(defaultBranding);
  const [loading, setLoading] = useState(true);

  const refreshBranding = useCallback(async () => {
    try {
      const response = await settingsService.getBrandingSettings();
      const next = { ...defaultBranding, ...(response.settings || {}) };
      setBranding(next);
      return next;
    } catch (error) {
      console.error('Unable to load system branding:', error);
      return defaultBranding;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshBranding(); }, [refreshBranding]);

  useEffect(() => {
    document.title = branding.metaTitle || branding.systemName;
    setMeta('description', branding.metaDescription);
    setMeta('keywords', branding.metaKeywords);
    setMeta('theme-color', branding.primaryColor);
    setMeta('application-name', branding.systemName);
    setMeta('twitter:title', branding.metaTitle || branding.systemName);
    setMeta('twitter:description', branding.metaDescription);
    setPropertyMeta('og:title', branding.metaTitle || branding.systemName);
    setPropertyMeta('og:description', branding.metaDescription);
    setPropertyMeta('og:site_name', branding.systemName);
    document.documentElement.style.setProperty('--brand-primary', branding.primaryColor);
    document.documentElement.style.setProperty('--brand-secondary', branding.secondaryColor);
    const favicon = resolveBrandAsset(branding.faviconUrl, branding.revision) || '/favicon.ico';
    const icons = [...document.querySelectorAll('link[rel~="icon"]')];
    if (!icons.length) {
      const link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
      icons.push(link);
    }
    icons.forEach(icon => { icon.href = favicon; });
    const touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (touchIcon) touchIcon.href = resolveBrandAsset(branding.logoUrl || branding.faviconUrl, branding.revision) || favicon;

    const manifest = {
      name: branding.systemName,
      short_name: branding.shortName || branding.systemName,
      start_url: '/',
      display: 'standalone',
      theme_color: branding.primaryColor,
      background_color: '#F4F7FB'
    };
    const manifestIcon = resolveBrandAsset(branding.logoUrl || branding.faviconUrl, branding.revision);
    if (manifestIcon) manifest.icons = [{ src: manifestIcon, sizes: 'any', type: 'image/png' }];
    const manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink) manifestLink.href = manifestUrl;
    return () => URL.revokeObjectURL(manifestUrl);
  }, [branding]);

  const value = useMemo(() => ({
    branding,
    loading,
    refreshBranding,
    setBranding,
    assetUrl: value => resolveBrandAsset(value, branding.revision)
  }), [branding, loading, refreshBranding]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export const useBranding = () => useContext(BrandingContext);
