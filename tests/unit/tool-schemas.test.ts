import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppContext } from "../../src/context.ts";
import { buildServer } from "../../src/server.ts";

function findArrayItems(node: unknown, path: string, found: string[]): void {
  if (node === null || typeof node !== "object") return;
  if (!Array.isArray(node) && Array.isArray((node as { items?: unknown }).items)) {
    found.push(path || "/");
  }
  for (const [key, child] of Object.entries(node)) {
    findArrayItems(child, `${path}/${key}`, found);
  }
}

describe("published tool input schemas", () => {
  let client: Client;
  let server: ReturnType<typeof buildServer>;

  beforeEach(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    server = buildServer({} as AppContext);
    client = new Client({ name: "schema-test", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  // The Anthropic API validates input_schema as JSON Schema 2020-12, where tuple-form `items` is invalid.
  it("never uses array-form items", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const tool of tools) {
      const paths: string[] = [];
      findArrayItems(tool.inputSchema, "", paths);
      offenders.push(...paths.map((p) => `${tool.name}:${p}`));
    }

    expect(offenders).toEqual([]);
  });
});
