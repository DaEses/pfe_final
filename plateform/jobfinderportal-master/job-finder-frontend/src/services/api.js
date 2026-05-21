import { apiUrl } from '../config';

const buildHeaders = (token, extra = {}) => {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

export async function apiRequest(path, { method = 'GET', body, token, headers } = {}) {
  const res = await fetch(apiUrl(path), {
    method,
    headers: buildHeaders(token, headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  return { ok: res.ok, status: res.status, data };
}

export const getJobSeekerToken = () => localStorage.getItem('jobSeekerToken');
export const getHRToken = () => localStorage.getItem('hrUserToken');
