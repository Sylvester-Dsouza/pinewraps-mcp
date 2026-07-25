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
    // pinewraps-api's real error envelope is { success: false, error: { message, code, ... } } —
    // "error" is an object, not a string. Some hand-rolled responses instead use a flat
    // { message } or { error: "string" }, so accept all three shapes.
    const body = err.response?.data as { message?: string; error?: string | { message?: string } } | undefined;
    const errorField = body?.error;
    const nestedMessage = typeof errorField === 'object' && errorField !== null ? errorField.message : errorField;
    message = body?.message || nestedMessage || err.message || err.code || 'Request failed';
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
