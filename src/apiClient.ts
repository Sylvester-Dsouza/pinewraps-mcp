import axios, { type AxiosInstance } from 'axios';

// Outbound client: talks to the pinewraps-api /api/mcp/* endpoints (see ../api-integration).
// Never called with user-supplied credentials — the API key lives only in this process's env.
export function createApiClient(): AxiosInstance {
  const baseURL = process.env.PINEWRAPS_API_URL;
  const apiKey = process.env.PINEWRAPS_API_KEY;

  if (!baseURL) {
    throw new Error('PINEWRAPS_API_URL is not set');
  }
  if (!apiKey) {
    throw new Error('PINEWRAPS_API_KEY is not set');
  }

  return axios.create({
    baseURL,
    timeout: 15_000,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    }
  });
}
