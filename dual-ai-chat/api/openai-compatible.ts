import { handleOpenAiCompatibleProxyRequest } from './_openaiCompatibleProxy';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleOpenAiCompatibleProxyRequest(request);
}
