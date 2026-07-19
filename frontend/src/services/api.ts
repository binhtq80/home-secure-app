async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('accessToken');

  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    // Auto-logout on expired/invalid token
    if (res.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('idToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Session expired. Please sign in again.');
    }
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

export const authApi = {
  signup: (username: string, email: string, password: string) =>
    request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),

  confirm: (username: string, confirmationCode: string) =>
    request('/api/auth/confirm', {
      method: 'POST',
      body: JSON.stringify({ username, confirmationCode }),
    }),

  signin: (username: string, password: string) =>
    request('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
};

export const usersApi = {
  getProfile: (userId: string) => request(`/api/users/${userId}`),

  listAll: () => request('/api/users'),

  updateRole: (userId: string, role: string) =>
    request(`/api/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),

  create: (username: string, email: string, password: string, role: string) =>
    request('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, role }),
    }),
};

export const settingsApi = {
  get: () => request('/api/settings'),

  update: (settings: Record<string, unknown>) =>
    request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};

export const avatarApi = {
  get: () => request('/api/avatar'),

  update: (image: string, mimeType: string) =>
    request('/api/avatar', {
      method: 'PUT',
      body: JSON.stringify({ image, mimeType }),
    }),
};

export const featuresApi = {
  create: (description: string) =>
    request('/api/features', {
      method: 'POST',
      body: JSON.stringify({ description }),
    }),

  list: (scope?: 'mine' | 'all') =>
    request(`/api/features${scope ? `?scope=${scope}` : ''}`),

  getById: (id: string) => request(`/api/features/${id}`),

  getStats: () => request('/api/features/stats'),

  approve: (id: string, action: 'approve' | 'reject', feedback?: string) =>
    request(`/api/features/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ action, feedback }),
    }),

  confirm: (id: string, action: 'accept' | 'override', overrideComplexity?: string) =>
    request(`/api/features/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ action, overrideComplexity }),
    }),

  adminApprove: (id: string, action: 'approve' | 'reject', reason?: string) =>
    request(`/api/features/${id}/admin-approve`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    }),

  vote: (id: string, rating: number, comment?: string) =>
    request(`/api/features/${id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }),

  listVotes: (id: string) => request(`/api/features/${id}/votes`),
};

export const camerasApi = {
  register: (camera: { name: string; location: string; model?: string; resolution?: string }) =>
    request('/api/cameras', {
      method: 'POST',
      body: JSON.stringify(camera),
    }),

  list: () => request('/api/cameras'),

  delete: (cameraId: string) =>
    request(`/api/cameras/${cameraId}`, {
      method: 'DELETE',
    }),
};
