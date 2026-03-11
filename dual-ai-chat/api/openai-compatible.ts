import { handleOpenAiCompatibleProxyRequest } from './_openaiCompatibleProxy.js';

const handler = async (request: Request) => handleOpenAiCompatibleProxyRequest(request);

export function POST(request: Request) {
  return handler(request);
}

export default {
  fetch(request: Request) {
    return handler(request);
  },
};
