// Shared network and location-search helpers used by data-backed widgets.

async function _fetchWithTimeout(input, options = {}, timeoutMs = 15000) {
  if (typeof WidgetSDK !== 'undefined' && options.__widgetSdkManaged !== true) {
    return WidgetSDK.network.request(
      input,
      options,
      timeoutMs,
      (nextInput, nextOptions, nextTimeout) => _fetchWithTimeout(nextInput, nextOptions, nextTimeout)
    );
  }
  const { widgetFetchKey = '', __widgetSdkManaged, maxResponseBytes, widgetType, ...fetchOptions } = options;
  // The SDK owns the deadline and signal through both headers and body reads.
  if (__widgetSdkManaged === true) return fetch(input, fetchOptions);
  const controller = new AbortController();
  const parentSignal = fetchOptions.signal;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
  try {
    return await fetch(input, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener?.('abort', abortFromParent);
  }
}
