/** SIWC uses SSE Responses with a narrower contract than API-key requests. */
export function createPlanFetch(fetchImpl = fetch) {
  return async (url, options) => {
    if (url !== 'https://api.openai.com/v1/responses') throw new Error('Unsupported model endpoint.');
    const body = JSON.parse(options.body);
    body.store = false;
    body.stream = true;
    // These fields are explicitly unsupported by the current SIWC preview contract.
    for (const name of ['max_output_tokens','background','conversation','previous_response_id','max_tool_calls',
      'metadata','moderation','multi_agent','prompt','prompt_cache_retention','safety_identifier',
      'temperature','top_logprobs','top_p','truncation','user']) delete body[name];
    const response = await fetchImpl(url, { ...options, body: JSON.stringify(body) });
    if (!response.ok) return response;
    if (!response.body || !response.headers.get('Content-Type')?.includes('text/event-stream')) {
      return Response.json({ status: 'failed' }, { status: 502 });
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', bytes = 0, completed = null;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1_048_576) throw new Error('Model stream exceeded its response limit.');
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data || data === '[DONE]') continue;
          let parsed;
          try { parsed = JSON.parse(data); } catch { throw new Error('Invalid model stream.'); }
          if (parsed.type === 'response.failed' || parsed.type === 'error' || parsed.type === 'response.incomplete') {
            return Response.json({ status: 'failed' }, { status: 502 });
          }
          if (parsed.type === 'response.completed') {
            if (!parsed.response || parsed.response.status !== 'completed') throw new Error('Incomplete model stream.');
            completed = parsed.response;
            break;
          }
        }
        if (completed) break;
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (!completed) return Response.json({ status: 'incomplete' }, { status: 502 });
    return Response.json(completed);
  };
}
