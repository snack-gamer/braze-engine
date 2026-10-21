import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server';

const nameFor = (operation) => `braze_${operation.replaceAll('.', '_')}`;
const result = (value, isError = false) => {
  const image = value.result?.image;
  const safe = image ? { ...value, result: { ...value.result, image: { mimeType: image.mimeType } } } : value;
  return { content: [{ type: 'text', text: JSON.stringify(safe) }, ...(image ? [{ type: 'image', mimeType: image.mimeType, data: image.data }] : [])],
    structuredContent: safe, ...(isError ? { isError } : {}) };
};
async function toolResult(action) {
  try { return result(await action()); }
  catch (error) { return result(error.envelope ?? { status: 'error', message: error.message }, true); }
}

/** SDK owns wire negotiation/validation/cancellation; Braze HTTP owns every operation. */
export function createEngineMcpServer(client, capabilities) {
  const definitions = capabilities.operationCatalog;
  if (!Array.isArray(definitions) || definitions.length !== capabilities.operations.length
    || new Set(definitions.map(({ operation }) => operation)).size !== definitions.length
    || definitions.some(({ operation }) => !capabilities.operations.includes(operation) || !/^[a-z]+(?:\.[a-z]+)+$/.test(operation))) {
    throw new Error('The engine must expose a complete v1 operationCatalog. Update/restart Braze before connecting MCP.');
  }
  const server = new McpServer({ name: 'braze-engine', version: '0.1.0' }, { instructions:
    'Discover capabilities and identify one intended editor session before authoring. Use inspected revisions, preview edits, then apply. Never replay commands automatically. Cancellation/timeout may occur after application; inspect before retry. Write trusted JavaScript in project files through the public SDK, not command payloads. Unsupported tools remain unavailable.' });
  server.registerTool('braze_capabilities', {
    description: 'Discover the running Braze engine operation schemas, limits and supported features. Reconnect MCP after engine capability changes.',
    inputSchema: fromJsonSchema({ type: 'object', properties: {}, additionalProperties: false }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (_args, ctx) => toolResult(() => client.discover(ctx.mcpReq.signal)));
  for (const { operation, description, inputSchema, annotations } of definitions) {
    server.registerTool(nameFor(operation), { description, inputSchema: fromJsonSchema(inputSchema), annotations },
      (args, ctx) => toolResult(() => client.execute(operation, args, ctx.mcpReq.signal)));
  }
  return server;
}
