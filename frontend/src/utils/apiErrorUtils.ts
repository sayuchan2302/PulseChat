import axios from 'axios';

/**
 * Extracts the human-readable error message returned by the backend from an
 * unknown thrown value, falling back to the provided copy for anything else.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? fallback;
  }
  return fallback;
}
