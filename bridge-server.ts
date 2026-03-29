#!/usr/bin/env bun
/**
 * Claude Code Bridge Server
 *
 * A tiny HTTP server that bridges Obsidian's Deep Insight plugin
 * to your local Claude Code CLI (`claude -p`).
 *
 * Usage:
 *   bun bridge-server.ts              # default port 3456
 *   PORT=4000 bun bridge-server.ts    # custom port
 *
 * This uses your existing Claude Pro/Max subscription — no extra API costs.
 */

import { $ } from "bun";

const PORT = parseInt(process.env.PORT || "3456");

const server = Bun.serve({
    port: PORT,

    async fetch(req) {
        // CORS headers for localhost
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (req.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        const url = new URL(req.url);

        if (url.pathname === "/health") {
            return Response.json({ status: "ok", model: "claude-code" }, { headers: corsHeaders });
        }

        if (url.pathname === "/chat" && req.method === "POST") {
            try {
                const { messages } = await req.json() as { messages: Array<{ role: string; content: string }> };

                // Build prompt from messages
                const parts: string[] = [];
                for (const msg of messages) {
                    if (msg.role === "system") {
                        parts.push(`<system>\n${msg.content}\n</system>`);
                    } else if (msg.role === "user") {
                        parts.push(`User: ${msg.content}`);
                    } else if (msg.role === "assistant") {
                        parts.push(`Assistant: ${msg.content}`);
                    }
                }
                const prompt = parts.join("\n\n");

                const result = await $`claude -p ${prompt} --output-format json`.json();

                return Response.json({
                    content: result.result || result.text || String(result),
                    model: result.model || "claude-code",
                    usage: {
                        inputTokens: result.input_tokens || 0,
                        outputTokens: result.output_tokens || 0,
                    },
                }, { headers: corsHeaders });

            } catch (error) {
                const message = error instanceof Error ? error.message : "Unknown error";
                console.error("Bridge error:", message);
                return Response.json(
                    { error: message },
                    { status: 500, headers: corsHeaders }
                );
            }
        }

        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    },
});

console.log(`Claude Code Bridge running on http://localhost:${server.port}`);
console.log("Routes: POST /chat, GET /health");
console.log("Press Ctrl+C to stop");
