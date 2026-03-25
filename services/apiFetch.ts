/**
 * Wrapper around fetch that ensures session cookies are sent with every request.
 * No API secret needed — authentication is handled via server-side sessions.
 */
export const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  return fetch(url, {
    ...options,
    credentials: 'include',  // Always send session cookie
  });
};
