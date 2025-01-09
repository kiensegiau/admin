import fetchPonyfill from 'fetch-ponyfill';

const { fetch: fetchPolyfill } = fetchPonyfill();

export const customFetch = async (url, options = {}) => {
  try {
    const response = await fetchPolyfill(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}; 