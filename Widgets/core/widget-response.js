// Bounded response buffering shared by Widget SDK network consumers.

const WidgetResponseBuffer = Object.freeze((() => {
  function buffered(response, bytes) {
    const copy = () => bytes.slice().buffer;
    const text = () => {
      if (typeof TextDecoder === 'function') return new TextDecoder().decode(bytes);
      let value = '';
      for (const byte of bytes) value += String.fromCharCode(byte);
      return value;
    };
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      redirected: response.redirected,
      type: response.type,
      headers: response.headers,
      bodyUsed: false,
      arrayBuffer: async () => copy(),
      text: async () => text(),
      json: async () => JSON.parse(text()),
      blob: async () => typeof Blob === 'function'
        ? new Blob([bytes], { type: response.headers?.get?.('content-type') || '' })
        : { size: bytes.byteLength, type: response.headers?.get?.('content-type') || '', arrayBuffer: async () => copy() }
    };
  }

  async function bound(response, maxBytes, controller) {
    if (!response || typeof response !== 'object' || !response.headers) return response;
    const declaredLength = Number(response.headers.get?.('content-length') || 0);
    if (declaredLength > maxBytes) {
      const error = new Error(`Widget response exceeds the ${maxBytes}-byte limit.`);
      controller?.abort?.(error);
      throw error;
    }

    const chunks = [];
    let received = 0;
    const append = value => {
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
      received += chunk.byteLength;
      if (received > maxBytes) {
        const error = new Error(`Widget response exceeds the ${maxBytes}-byte limit.`);
        controller?.abort?.(error);
        throw error;
      }
      chunks.push(chunk);
    };

    if (response.body?.getReader) {
      const reader = response.body.getReader();
      let cancelled = false;
      const cancel = () => {
        if (cancelled) return;
        cancelled = true;
        try { void Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
      };
      controller?.signal?.addEventListener('abort', cancel, { once: true });
      try {
        if (controller?.signal?.aborted) throw controller.signal.reason;
        while (true) {
          const part = await reader.read();
          if (controller?.signal?.aborted) throw controller.signal.reason;
          if (part.done) break;
          append(part.value);
        }
      } catch (error) {
        cancel();
        throw error;
      } finally {
        controller?.signal?.removeEventListener('abort', cancel);
        reader.releaseLock?.();
      }
    } else if (typeof response.arrayBuffer === 'function') {
      append(await response.arrayBuffer());
    } else {
      return response;
    }

    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return buffered(response, bytes);
  }

  return { bound };
})());
