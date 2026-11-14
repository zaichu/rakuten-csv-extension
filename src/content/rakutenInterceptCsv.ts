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
  windowOpen: typeof window.open;
} | undefined;
let submitListener: ((event: Event) => void) | undefined;
let clickListener: ((event: MouseEvent) => void) | undefined;

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

function formBody(form: HTMLFormElement, method: string, enctype: string): BodyInit | undefined {
  if (method === 'GET' || method === 'HEAD') {
    return undefined;
  }
  const formData = new FormData(form);
  if (enctype.toLowerCase().includes('urlencoded')) {
    return new URLSearchParams(formData as unknown as ConstructorParameters<typeof URLSearchParams>[0]);
  }
  return formData;
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
    const first = buffer.byteLength > 0 ? new Uint8Array(buffer)[0] : 0;
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
  } catch (error) {
    const message = error instanceof Error ? error.message : buildFailure(requestType, upperMethod, status, contentType);
    postResult(
      {
        ok: false,
        error: message.includes('/') ? message : buildFailure(requestType, upperMethod, status, contentType),
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
  if (!armed || !originals) {
    armed = false;
    return;
  }
  try {
    HTMLFormElement.prototype.submit = originals.formSubmit;
    HTMLFormElement.prototype.requestSubmit = originals.formRequestSubmit;
    Object.defineProperty(window.location, 'assign', {
      value: originals.locationAssign,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, 'replace', {
      value: originals.locationReplace,
      writable: true,
      configurable: true,
    });
    if (originals.locationHref) {
      Object.defineProperty(window.location, 'href', originals.locationHref);
    }
    window.open = originals.windowOpen;
    if (submitListener) {
      document.removeEventListener('submit', submitListener, true);
    }
    if (clickListener) {
      document.removeEventListener('click', clickListener, true);
    }
  } catch {
    // ignore
  }
  armed = false;
  intercepted = false;
  currentNonce = undefined;
  originals = undefined;
  submitListener = undefined;
  clickListener = undefined;
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
    locationHref: Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window.location), 'href'),
    windowOpen: window.open.bind(window),
  };

  HTMLFormElement.prototype.submit = function (this: HTMLFormElement) {
    if (!armed) {
      return originals!.formSubmit.call(this);
    }
    const url = resolveUrl(this.getAttribute('action'));
    const method = (this.getAttribute('method') || 'GET').toUpperCase();
    const enctype = this.getAttribute('enctype') || 'application/x-www-form-urlencoded';
    void runFetch('form-submit', url, method, formBody(this, method, enctype), currentNonce);
    return;
  };

  HTMLFormElement.prototype.requestSubmit = function (this: HTMLFormElement, submitter?: HTMLElement | null) {
    if (!armed) {
      return originals!.formRequestSubmit.call(this, submitter);
    }
    const url = resolveUrl(this.getAttribute('action'));
    const method = (this.getAttribute('method') || 'GET').toUpperCase();
    const enctype = this.getAttribute('enctype') || 'application/x-www-form-urlencoded';
    void runFetch('requestSubmit', url, method, formBody(this, method, enctype), currentNonce);
    return;
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
    event.stopImmediatePropagation();
    const url = resolveUrl(form.getAttribute('action'));
    const method = (form.getAttribute('method') || 'GET').toUpperCase();
    const enctype = form.getAttribute('enctype') || 'application/x-www-form-urlencoded';
    void runFetch('form-submit', url, method, formBody(form, method, enctype), currentNonce);
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
    event.stopImmediatePropagation();
    void runFetch('anchor', target.href, 'GET', undefined, currentNonce);
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

  // store cleanup listeners? We'll remove on disarm by reassigning; listeners remain but check armed.
}

// signal listener
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== window.location.origin) {
      return;
    }
    if (event.source !== window) {
      return;
    }
    const data = event.data as { type?: string; nonce?: string } | null;
    if (!data || data.type !== SIGNAL_TYPE) {
      return;
    }
    arm(data.nonce);
  });
}

export { isArmed };

const defaultExport = { arm, disarm, isArmed };
export default defaultExport;
