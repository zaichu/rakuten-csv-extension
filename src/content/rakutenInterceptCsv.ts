export type InterceptRequestType =
  | 'form-submit'
  | 'requestSubmit'
  | 'anchor'
  | 'location'
  | 'window.open';

export interface InterceptResult {
  readonly ok: boolean;
  readonly buffer?: ArrayBuffer;
  readonly contentType?: string;
  readonly status?: number;
  readonly requestType?: InterceptRequestType;
  readonly method?: string;
  readonly error?: string;
}

const SIGNAL_TYPE = 'rakuten-csv-intercept:arm';
const RESULT_TYPE = 'rakuten-csv-intercept:result';

let armed = false;
let currentNonce: string | undefined;
let intercepted = false;
let originals: {
  formSubmit: (this: HTMLFormElement) => void;
  formRequestSubmit: (this: HTMLFormElement, submitter?: HTMLElement | null) => void;
  locationAssign: (url: string) => void;
  locationReplace: (url: string) => void;
  locationHref: PropertyDescriptor | undefined;
  locationAssignDesc: PropertyDescriptor | undefined;
  locationReplaceDesc: PropertyDescriptor | undefined;
  locationAssignOwn: boolean;
  locationReplaceOwn: boolean;
  locationHrefOwn: boolean;
  windowOpen: typeof window.open;
  windowOpenDesc: PropertyDescriptor | undefined;
  windowOpenOwn: boolean;
} | undefined;
let submitListener: ((event: Event) => void) | undefined;
let clickListener: ((event: MouseEvent) => void) | undefined;
let pendingRequestType: 'form-submit' | 'requestSubmit' = 'form-submit';
let submitScheduled = false;

function isArmed(): boolean {
  return armed;
}

function postResult(result: InterceptResult, nonce: string | undefined): void {
  window.postMessage(
    {
      type: RESULT_TYPE,
      nonce,
      ...result,
    },
    window.location.origin
  );
}

function buildFailure(
  requestType: InterceptRequestType,
  method: string,
  status: number | undefined,
  contentType: string
): string {
  return `${requestType} / method=${method} / status=${status ?? 'なし'} / contentType=${contentType || '不明'}`;
}

function resolveUrl(value: string | null | undefined): string {
  try {
    return new URL(value ?? '', window.location.href).href;
  } catch {
    return value ?? '';
  }
}

function buildRequest(form: HTMLFormElement, submitter?: HTMLElement | null): { url: string; method: string; body: BodyInit | undefined } {
  const method = ((submitter as HTMLButtonElement | null)?.getAttribute('formmethod') || form.getAttribute('method') || 'GET').toUpperCase();
  const enctype = (submitter as HTMLButtonElement | null)?.getAttribute('formenctype') || form.getAttribute('enctype') || 'application/x-www-form-urlencoded';
  const base = resolveUrl((submitter as HTMLButtonElement | null)?.getAttribute('formaction') || form.getAttribute('action'));
  if (method === 'GET' || method === 'HEAD') {
    const formData = new FormData(form);
    const submitterButton = submitter as HTMLButtonElement | null;
    if (submitterButton?.name) {
      formData.append(submitterButton.name, submitterButton.value);
    }
    const params = new URLSearchParams(formData as unknown as ConstructorParameters<typeof URLSearchParams>[0]);
    const url = new URL(base);
    params.forEach((value, key) => {
      url.searchParams.append(key, value);
    });
    return { url: url.href, method, body: undefined };
  }
  const formData = new FormData(form);
  const submitterButton = submitter as HTMLButtonElement | null;
  if (submitterButton?.name) {
    formData.append(submitterButton.name, submitterButton.value);
  }
  const lower = enctype.toLowerCase();
  if (lower.includes('urlencoded')) {
    return { url: base, method, body: new URLSearchParams(formData as unknown as ConstructorParameters<typeof URLSearchParams>[0]) };
  }
  if (lower.includes('text/plain')) {
    const pairs: string[] = [];
    formData.forEach((value, key) => {
      pairs.push(`${key}=${typeof value === 'string' ? value : ''}`);
    });
    return { url: base, method, body: pairs.join('\r\n') };
  }
  return { url: base, method, body: formData };
}

async function runFetch(
  requestType: InterceptRequestType,
  url: string,
  method: string,
  body: BodyInit | undefined,
  nonce: string | undefined
): Promise<void> {
  if (intercepted) {
    return;
  }
  intercepted = true;
  const upperMethod = method.toUpperCase();
  let status: number | undefined;
  let contentType = '';
  try {
    const response = await fetch(url, {
      method: upperMethod,
      body,
      credentials: 'include',
    });
    status = response.status;
    contentType = response.headers.get('content-type') ?? '';
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let offset = 0;
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      offset = 3;
    }
    while (offset < bytes.length && (bytes[offset] === 0x20 || bytes[offset] === 0x09 || bytes[offset] === 0x0a || bytes[offset] === 0x0d)) {
      offset += 1;
    }
    const first = offset < bytes.length ? bytes[offset] : 0;
    const html = contentType.toLowerCase().includes('text/html') || first === 0x3c;
    if (!response.ok) {
      throw new Error(buildFailure(requestType, upperMethod, status, contentType));
    }
    if (html) {
      throw new Error(buildFailure(requestType, upperMethod, status, contentType));
    }
    postResult(
      {
        ok: true,
        buffer,
        contentType,
        status,
        requestType,
        method: upperMethod,
      },
      nonce
    );
  } catch {
    postResult(
      {
        ok: false,
        error: buildFailure(requestType, upperMethod, status, contentType),
        contentType,
        status,
        requestType,
        method: upperMethod,
      },
      nonce
    );
  } finally {
    disarm();
  }
}

export function disarm(): void {
  if (originals) {
    try { HTMLFormElement.prototype.submit = originals.formSubmit; } catch { /* ignore */ }
    try { HTMLFormElement.prototype.requestSubmit = originals.formRequestSubmit; } catch { /* ignore */ }

    try {
      if (originals.locationAssignOwn && originals.locationAssignDesc) {
        Object.defineProperty(window.location, 'assign', originals.locationAssignDesc);
      } else {
        try { delete (window.location as { assign?: unknown }).assign; } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    try {
      if (originals.locationReplaceOwn && originals.locationReplaceDesc) {
        Object.defineProperty(window.location, 'replace', originals.locationReplaceDesc);
      } else {
        try { delete (window.location as { replace?: unknown }).replace; } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    try {
      if (originals.locationHrefOwn && originals.locationHref) {
        Object.defineProperty(window.location, 'href', originals.locationHref);
      } else if (!originals.locationHrefOwn) {
        try { delete (window.location as { href?: unknown }).href; } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    try {
      if (originals.windowOpenOwn && originals.windowOpenDesc) {
        Object.defineProperty(window, 'open', originals.windowOpenDesc);
      } else {
        try { delete (window as { open?: unknown }).open; } catch { /* ignore */ }
      }
    } catch {
      try { window.open = originals.windowOpen; } catch { /* ignore */ }
    }

    try {
      if (submitListener) {
        document.removeEventListener('submit', submitListener, true);
      }
    } catch { /* ignore */ }
    try {
      if (clickListener) {
        document.removeEventListener('click', clickListener, true);
      }
    } catch { /* ignore */ }
  }

  armed = false;
  intercepted = false;
  currentNonce = undefined;
  originals = undefined;
  submitListener = undefined;
  clickListener = undefined;
  submitScheduled = false;
  pendingRequestType = 'form-submit';
}

export function arm(nonce?: string): void {
  if (armed) {
    return;
  }
  originals = {
    formSubmit: HTMLFormElement.prototype.submit,
    formRequestSubmit: HTMLFormElement.prototype.requestSubmit,
    locationAssign: window.location.assign.bind(window.location),
    locationReplace: window.location.replace.bind(window.location),
    locationHref: Object.getOwnPropertyDescriptor(window.location, 'href'),
    locationAssignDesc: Object.getOwnPropertyDescriptor(window.location, 'assign'),
    locationReplaceDesc: Object.getOwnPropertyDescriptor(window.location, 'replace'),
    locationAssignOwn: Object.prototype.hasOwnProperty.call(window.location, 'assign'),
    locationReplaceOwn: Object.prototype.hasOwnProperty.call(window.location, 'replace'),
    locationHrefOwn: Object.prototype.hasOwnProperty.call(window.location, 'href'),
    windowOpen: window.open.bind(window),
    windowOpenDesc: Object.getOwnPropertyDescriptor(window, 'open'),
    windowOpenOwn: Object.prototype.hasOwnProperty.call(window, 'open'),
  };

  HTMLFormElement.prototype.submit = function (this: HTMLFormElement) {
    if (!armed) {
      return originals!.formSubmit.call(this);
    }
    pendingRequestType = 'form-submit';
    const request = buildRequest(this);
    void runFetch('form-submit', request.url, request.method, request.body, currentNonce);
    return;
  };

  HTMLFormElement.prototype.requestSubmit = function (this: HTMLFormElement, submitter?: HTMLElement | null) {
    if (!armed) {
      return originals!.formRequestSubmit.call(this, submitter);
    }
    pendingRequestType = 'requestSubmit';
    try {
      return originals!.formRequestSubmit.call(this, submitter);
    } finally {
      queueMicrotask(() => {
        pendingRequestType = 'form-submit';
      });
    }
  };

  // form submit event (capture)
  submitListener = (event: Event): void => {
    if (!armed) {
      return;
    }
    const form = event.target as HTMLFormElement | null;
    if (!form || form.tagName !== 'FORM') {
      return;
    }
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter as HTMLElement | null;
    const requestType = pendingRequestType;
    pendingRequestType = 'form-submit';
    submitScheduled = true;
    queueMicrotask(() => {
      if (intercepted) {
        submitScheduled = false;
        return;
      }
      const request = buildRequest(form, submitter);
      void runFetch(requestType, request.url, request.method, request.body, currentNonce);
      submitScheduled = false;
    });
  };
  document.addEventListener('submit', submitListener, true);

  // anchor click (capture)
  clickListener = (event: MouseEvent): void => {
    if (!armed) {
      return;
    }
    const target = (event.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null;
    if (!target || !target.href) {
      return;
    }
    event.preventDefault();
    const href = target.href;
    const tryFetchAnchor = (attempts: number): void => {
      if (intercepted || submitScheduled) {
        return;
      }
      if (attempts < 5) {
        setTimeout(() => tryFetchAnchor(attempts + 1), 0);
        return;
      }
      void runFetch('anchor', href, 'GET', undefined, currentNonce);
    };
    setTimeout(() => tryFetchAnchor(0), 0);
  };
  document.addEventListener('click', clickListener, true);

  try {
    Object.defineProperty(window.location, 'assign', {
      value: (url: string) => {
        if (!armed) {
          return originals!.locationAssign(url);
        }
        void runFetch('location', resolveUrl(url), 'GET', undefined, currentNonce);
        return;
      },
      writable: true,
      configurable: true,
    });
  } catch {
    // ignore
  }
  try {
    Object.defineProperty(window.location, 'replace', {
      value: (url: string) => {
        if (!armed) {
          return originals!.locationReplace(url);
        }
        void runFetch('location', resolveUrl(url), 'GET', undefined, currentNonce);
        return;
      },
      writable: true,
      configurable: true,
    });
  } catch {
    // ignore
  }
  try {
    Object.defineProperty(window.location, 'href', {
      set(url: string) {
        if (!armed) {
          if (originals!.locationHref?.set) {
            originals!.locationHref.set.call(window.location, url);
          }
          return;
        }
        void runFetch('location', resolveUrl(url), 'GET', undefined, currentNonce);
      },
      get() {
        return originals?.locationHref?.get?.call(window.location) ?? window.location.href;
      },
      configurable: true,
    });
  } catch {
    // ignore
  }

  window.open = ((url?: string | URL) => {
    if (!armed) {
      return originals!.windowOpen(url);
    }
    const href = typeof url === 'string' ? url : url?.toString();
    void runFetch('window.open', resolveUrl(href), 'GET', undefined, currentNonce);
    return null;
  }) as typeof window.open;

  armed = true;
  intercepted = false;
  currentNonce = nonce;

  window.postMessage({ type: 'rakuten-csv-intercept:armed', nonce }, window.location.origin);

}

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== '' && event.origin !== window.location.origin) {
      return;
    }
    if (event.source !== null && event.source !== window) {
      return;
    }
    const data = event.data as { type?: string; nonce?: string } | null;
    if (!data) {
      return;
    }
    if (data.type === SIGNAL_TYPE) {
      arm(data.nonce);
      return;
    }
    if (data.type === 'rakuten-csv-intercept:disarm') {
      disarm();
    }
  });
}

export { isArmed };

const defaultExport = { arm, disarm, isArmed };
export default defaultExport;
