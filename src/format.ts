import axios from 'axios';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function toToolJson(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  };
}

export function toToolError(err: unknown): CallToolResult {
  let message: string;

  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { message?: string; error?: string } | undefined;
    message = body?.message || body?.error || err.message || err.code || 'Request failed';
    if (err.response?.status) {
      message = `[HTTP ${err.response.status}] ${message}`;
    }
  } else if (err instanceof Error) {
    message = err.message;
  } else {
    message = String(err);
  }

  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true
  };
}
