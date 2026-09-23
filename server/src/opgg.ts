/**
 * OP.GG MCP Client & DSL Parser
 *
 * Implements the JSON-RPC SSE transport for the OP.GG MCP endpoint
 * and parses its custom class-based response DSL into standard JavaScript objects.
 */

const ENDPOINT = "https://mcp-api.op.gg/mcp";

/**
 * Custom recursive-descent parser for OP.GG's class DSL
 * (e.g. `class ChampionAnalysis: ...` followed by constructor calls like `Counter(122, 0.447, 342)`).
 */
export function parseOpgg(text: string): any {
  if (typeof text !== "string") return text;
  const lines = text.split(/\r?\n/);
  const classes: Record<string, string[]> = {};
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^class\s+(\w+):\s*(.*)$/);
    if (m) classes[m[1]] = m[2].split(",").map((s) => s.trim()).filter(Boolean);
    else if (lines[i].trim() === "") continue;
    else {
      start = i;
      break;
    }
  }
  const s = lines.slice(start).join("\n").trim();
  let p = 0;
  const ws = () => {
    while (p < s.length && /\s/.test(s[p])) p++;
  };
  const value = (): any => {
    ws();
    const c = s[p];
    if (c === '"') return str();
    if (c === "[") return arr();
    if (/[A-Za-z_]/.test(c)) return identOrCtor();
    return num();
  };
  const str = (): string => {
    p++;
    let o = "";
    while (p < s.length) {
      const c = s[p++];
      if (c === "\\") o += s[p++];
      else if (c === '"') break;
      else o += c;
    }
    return o;
  };
  const arr = (): any[] => {
    p++;
    const a: any[] = [];
    ws();
    if (s[p] === "]") {
      p++;
      return a;
    }
    for (;;) {
      a.push(value());
      ws();
      if (s[p] === ",") {
        p++;
        continue;
      }
      break;
    }
    ws();
    if (s[p] === "]") p++;
    return a;
  };
  const identOrCtor = (): any => {
    const st = p;
    while (p < s.length && /[A-Za-z0-9_]/.test(s[p])) p++;
    const id = s.slice(st, p);
    ws();
    if (s[p] === "(") {
      p++;
      const a: any[] = [];
      ws();
      if (s[p] !== ")") {
        for (;;) {
          a.push(value());
          ws();
          if (s[p] === ",") {
            p++;
            continue;
          }
          break;
        }
      }
      ws();
      if (s[p] === ")") p++;
      const f = classes[id];
      if (f) {
        const o: Record<string, any> = {};
        f.forEach((k, i) => (o[k] = a[i]));
        return o;
      }
      return { __class: id, args: a };
    }
    if (id === "true") return true;
    if (id === "false") return false;
    if (id === "null" || id === "None") return null;
    return id;
  };
  const num = (): number | string => {
    const st = p;
    while (p < s.length && /[-0-9.eE+]/.test(s[p])) p++;
    const t = s.slice(st, p);
    const n = Number(t);
    return Number.isNaN(n) ? t : n;
  };
  return value();
}

export class McpClient {
  private sessionId: string | null;
  private counter: number;

  constructor() {
    this.sessionId = null;
    this.counter = 1;
  }

  async post(body: Record<string, any>, isNotification = false): Promise<any> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const sid = res.headers.get("mcp-session-id");
    if (sid) {
      this.sessionId = sid;
    }

    if (isNotification) return null;

    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    if (ct.includes("text/event-stream")) {
      const msgs: any[] = [];
      for (const line of text.split(/\r?\n/)) {
        if (line.startsWith("data:")) {
          const d = line.slice(5).trim();
          if (d) {
            try {
              msgs.push(JSON.parse(d));
            } catch {}
          }
        }
      }
      return msgs.find((m) => m.result || m.error) || msgs[0];
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async initialize(): Promise<void> {
    await this.post({
      jsonrpc: "2.0",
      id: this.counter++,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "rift-server", version: "1.0.0" },
      },
    });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, true);
  }

  async callTool(name: string, argsObj: Record<string, any>): Promise<any> {
    const body = {
      jsonrpc: "2.0",
      id: this.counter++,
      method: "tools/call",
      params: { name, arguments: argsObj },
    };
    const msg = await this.post(body);
    if (msg?.error) {
      throw new Error(`${name}: ${JSON.stringify(msg.error)}`);
    }
    const text = msg?.result?.content?.find((c: any) => c.type === "text")?.text;
    if (!text) return msg?.result;
    const trimmed = text.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {}
    }
    return parseOpgg(text);
  }
}
