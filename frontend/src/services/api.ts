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
};

export const settingsApi = {
  get: () => request('/api/settings'),

  update: (settings: { costPerKwh?: number; currency?: string }) =>
    request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};

export const reportsApi = {
  getEnergyReport: () => request('/api/reports/energy'),
};

export const devicesApi = {
  recognize: (image: string, mimeType: string) =>
    request('/api/devices/recognize', {
      method: 'POST',
      body: JSON.stringify({ image, mimeType }),
    }),

  create: (device: {
    deviceType: string;
    brand: string;
    model?: string;
    color?: string;
    condition?: string;
    description?: string;
    features?: string[];
    imageBase64?: string;
    room?: string;
  }) =>
    request('/api/devices', {
      method: 'POST',
      body: JSON.stringify(device),
    }),

  list: () => request('/api/devices'),

  getEnergy: (deviceId: string) => request(`/api/devices/${deviceId}/energy`),

  getImage: (deviceId: string) => request(`/api/devices/${deviceId}/image`),

  setBudget: (deviceId: string, monthlyBudgetKwh: number) =>
    request(`/api/devices/${deviceId}/budget`, {
      method: 'PUT',
      body: JSON.stringify({ monthlyBudgetKwh }),
    }),

  delete: (deviceId: string) =>
    request(`/api/devices/${deviceId}`, { method: 'DELETE' }),

  update: (deviceId: string, fields: {
    deviceType?: string;
    brand?: string;
    model?: string;
    color?: string;
    condition?: string;
    description?: string;
    status?: 'on' | 'off';
    room?: string | null;
  }) =>
    request(`/api/devices/${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    }),

  getHistory: (deviceId: string) =>
    request(`/api/devices/${deviceId}/history`),

  getLastActive: (deviceId: string) =>
    request(`/api/devices/${deviceId}/last-active`),

  getManuals: (deviceId: string) =>
    request(`/api/devices/${deviceId}/manuals`),

  getManualUrl: (deviceId: string, manualId: string) =>
    request(`/api/devices/${deviceId}/manuals?manualId=${manualId}`),

  uploadManual: (deviceId: string, fileName: string, fileBase64: string) =>
    request(`/api/devices/${deviceId}/manuals`, {
      method: 'POST',
      body: JSON.stringify({ fileName, fileBase64 }),
    }),

  deleteManual: (deviceId: string, manualId: string) =>
    request(`/api/devices/${deviceId}/manuals`, {
      method: 'DELETE',
      body: JSON.stringify({ manualId }),
    }),

  listNotes: (deviceId: string) =>
    request(`/api/devices/${deviceId}/notes`),

  createNote: (deviceId: string, text: string) =>
    request(`/api/devices/${deviceId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  toggleFavorite: (deviceId: string) =>
    request(`/api/devices/${deviceId}/favorite`, {
      method: 'POST',
    }),

  listFavorites: () => request('/api/devices/favorites'),

  getTags: (deviceId: string) =>
    request(`/api/devices/${deviceId}/tags`),

  addTag: (deviceId: string, tag: string) =>
    request(`/api/devices/${deviceId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ action: 'add', tag }),
    }),

  removeTag: (deviceId: string, tag: string) =>
    request(`/api/devices/${deviceId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ action: 'remove', tag }),
    }),
};

export const roomsApi = {
  delete: (roomName: string) =>
    request(`/api/rooms/${encodeURIComponent(roomName)}`, { method: 'DELETE' }),
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
};
