import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { mapSpec, TOOLS, applyTool, type MapSpec, type SourceCatalogEntry } from '@vibe/shared';
import { buildSystemPrompt } from '@/lib/chat-prompt';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
const MAX_TURNS = 8;

const bodySchema = z.object({
  spec: mapSpec,
  sources: z.array(z.custom<SourceCatalogEntry>()).default([]),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .min(1),
  // Optional artifact attached to the latest user turn for Claude to consider:
  // an image (vision) or a document (PDF base64 / text). data is base64 for
  // image+pdf, raw text for text.
  artifact: z
    .object({
      kind: z.enum(['image', 'pdf', 'text']),
      name: z.string(),
      mediaType: z.string(),
      data: z.string().min(1),
    })
    .optional(),
});

const IMAGE_MEDIA = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

type Artifact = z.infer<typeof bodySchema>['artifact'];

function artifactBlock(a: NonNullable<Artifact>): Anthropic.ContentBlockParam {
  if (a.kind === 'image') {
    const media_type = (IMAGE_MEDIA.has(a.mediaType) ? a.mediaType : 'image/jpeg') as
      | 'image/jpeg'
      | 'image/png'
      | 'image/gif'
      | 'image/webp';
    return { type: 'image', source: { type: 'base64', media_type, data: a.data } };
  }
  if (a.kind === 'pdf') {
    return {
      type: 'document',
      title: a.name,
      source: { type: 'base64', media_type: 'application/pdf', data: a.data },
    };
  }
  return {
    type: 'document',
    title: a.name,
    source: { type: 'text', media_type: 'text/plain', data: a.data },
  };
}

const anthropicTools = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
}));

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 500 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { sources, messages, artifact } = parsed.data;
  let spec: MapSpec = parsed.data.spec;
  const ctx = { sources };
  const applied: string[] = [];

  const client = new Anthropic({ apiKey });
  const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
  const convo: Anthropic.MessageParam[] = messages.map((m, i) => {
    // Attach the artifact to the most recent user turn, ahead of its text so
    // Claude reads the file as context for the request.
    if (artifact && i === lastUserIdx) {
      return {
        role: m.role,
        content: [artifactBlock(artifact), { type: 'text', text: m.content }],
      };
    }
    return { role: m.role, content: m.content };
  });

  let finalText = '';

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: buildSystemPrompt(spec, sources, {
              artifact: artifact ? { kind: artifact.kind, name: artifact.name } : undefined,
            }),
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: anthropicTools,
        messages: convo,
      });

      const toolUses = response.content.filter((b) => b.type === 'tool_use');
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (text) finalText = text;

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) break;

      convo.push({ role: 'assistant', content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        try {
          const out = applyTool(use.name, use.input, spec, ctx);
          spec = out.spec;
          if (use.name !== 'inspect_source') applied.push(out.summary);
          results.push({ type: 'tool_result', tool_use_id: use.id, content: out.summary });
        } catch (err) {
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: err instanceof Error ? err.message : 'Tool failed',
            is_error: true,
          });
        }
      }
      convo.push({ role: 'user', content: results });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chat failed';
    return Response.json({ error: message }, { status: 502 });
  }

  return Response.json({
    spec,
    message: finalText || 'Done.',
    applied,
  });
}
