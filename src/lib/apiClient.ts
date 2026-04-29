import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});
