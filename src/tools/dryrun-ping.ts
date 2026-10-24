import { z } from "zod";
import type { AppContext } from "../context.js";

export const dryrunPingInputSchema = {
  message: z.string().min(1).describe("Text to echo back."),
};

export const dryrunPingDescription = `
Echoes the given message back. Used only to exercise the fork review pipeline.
`.trim();

type Args = {
  message: string;
};

export async function dryrunPing(
  _ctx: AppContext,
  args: Args,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  return { content: [{ type: "text", text: `pong: ${args.message}` }] };
}
