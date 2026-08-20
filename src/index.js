import { handleRequest } from './router.js';

export default {
  async fetch(request, env) {
    if (request.method === 'POST') {
      return handleRequest(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
