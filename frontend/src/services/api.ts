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
