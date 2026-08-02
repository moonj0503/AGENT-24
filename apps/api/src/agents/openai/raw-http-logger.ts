const AUTHORIZATION_HEADER = "authorization";

function divider(label: string): void {
  process.stdout.write(`\n========== OPENAI RAW ${label} ==========\n`);
}

function printableHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [...headers.entries()].filter(([name]) => name.toLowerCase() !== AUTHORIZATION_HEADER),
  );
}

async function requestBody(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
  if (init?.body !== undefined && init.body !== null) {
    if (typeof init.body === "string") return init.body;
    return new Response(init.body).text();
  }

  if (input instanceof Request) return input.clone().text();
  return "";
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
  return headers;
}

async function printRequest(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
  const request = input instanceof Request ? input : undefined;
  divider("REQUEST");
  process.stdout.write(`${init?.method ?? request?.method ?? "GET"} ${request?.url ?? String(input)}\n`);
  process.stdout.write(`${JSON.stringify(printableHeaders(requestHeaders(input, init)), null, 2)}\n`);
  process.stdout.write(`${await requestBody(input, init)}\n`);
}

async function printResponse(response: Response): Promise<void> {
  divider("RESPONSE");
  process.stdout.write(`${response.status} ${response.statusText}\n`);
  process.stdout.write(`${JSON.stringify(printableHeaders(response.headers), null, 2)}\n`);

  if (!response.body) {
    process.stdout.write("\n");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    process.stdout.write(decoder.decode(value, { stream: true }));
  }
  process.stdout.write(`${decoder.decode()}\n`);
  divider("RESPONSE END");
}

export function createRawLoggingFetch(fetchImplementation: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    await printRequest(input, init);
    const response = await fetchImplementation(input, init);
    void printResponse(response.clone()).catch((error: unknown) => {
      divider("LOGGER ERROR");
      process.stdout.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    });
    return response;
  };
}
