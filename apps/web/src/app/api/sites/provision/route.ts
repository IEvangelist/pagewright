import { getProviderForSession } from "@/lib/auth/provider";
import { provisionSite } from "@/lib/provision/provision";
import { validateProvisionRequest, type ProvisionEvent } from "@/lib/provision/shared";

export const dynamic = "force-dynamic";
// Provisioning does real network work and streams progress; keep it on the Node runtime.
export const runtime = "nodejs";

/**
 * Streams the provisioning of a new site as newline-delimited JSON (one {@link ProvisionEvent} per
 * line). The client reads the stream and renders live per-step progress. Streaming keeps the
 * connection open for the whole (multi-second) provisioning run without buffering the response.
 */
export async function POST(request: Request): Promise<Response> {
  const provider = await getProviderForSession();
  if (!provider) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validated = validateProvisionRequest(body);
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const write = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: ProvisionEvent,
  ) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of provisionSite(provider, validated.value)) {
          write(controller, event);
        }
      } catch (error) {
        write(controller, {
          type: "error",
          message:
            error instanceof Error ? error.message : "Provisioning failed unexpectedly.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
