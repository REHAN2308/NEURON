/**
 * Authentication configuration and utilities
 */

// Auth API base URL (FastAPI backend)
export const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_URL || 'http://127.0.0.1:8000';

export const AUTH_ENDPOINTS = {
  login: `${AUTH_API_URL}/login`,
  logout: `${AUTH_API_URL}/logout`,
  callback: `${AUTH_API_URL}/auth/callback`,
  me: `${AUTH_API_URL}/me`,
} as const;

export interface User {
  id: number;
  email: string;
  name: string;
  avatar_url: string | null;
}

/**
 * Get auth token from localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

/**
 * Set auth token in localStorage
 */
export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('auth_token', token);
}

/**
 * Remove auth token from localStorage
 */
export function removeAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('auth_token');
}

/**
 * Fetch current user from auth API
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const token = getAuthToken();
    if (!token) return null;

    const response = await fetch(AUTH_ENDPOINTS.me, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (response.ok) {
      return await response.json();
    }
    
    // Token is invalid, remove it
    removeAuthToken();
    return null;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

/**
 * Redirect to Google OAuth login
 */
export function redirectToLogin(): void {
  window.location.href = AUTH_ENDPOINTS.login;
}

/**
 * Logout and redirect to login
 */
export function logout(): void {
  removeAuthToken();
  window.location.href = '/login';
}
