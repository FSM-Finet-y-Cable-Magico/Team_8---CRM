import { apiErrorMessage } from '../api';

export function settledData<T>(
  result: PromiseSettledResult<{ data: T }>,
  fallback: T,
  errors: string[],
) {
  if (result.status === 'fulfilled') {
    return result.value.data;
  }

  errors.push(apiErrorMessage(result.reason));
  return fallback;
}
