//! Minimal MCP (Streamable HTTP / JSON-RPC) client for the OP.GG endpoint.

use anyhow::{anyhow, Result};
use serde_json::{json, Value};

const ENDPOINT: &str = "https://mcp-api.op.gg/mcp";

pub struct McpClient {
    http: reqwest::Client,
    session: Option<String>,
}

impl McpClient {
    pub fn new() -> Result<Self> {
        Ok(Self { http: reqwest::Client::builder().build()?, session: None })
    }

    async fn post(&mut self, body: Value, notification: bool) -> Result<Option<Value>> {
        let mut req = self
            .http
            .post(ENDPOINT)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream");
        if let Some(s) = &self.session {
            req = req.header("Mcp-Session-Id", s.clone());
        }
        let resp = req.json(&body).send().await?;
        if let Some(sid) = resp.headers().get("mcp-session-id").and_then(|v| v.to_str().ok()) {
            self.session = Some(sid.to_string());
        }
        if notification {
            return Ok(None);
        }
        let is_sse = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .map(|c| c.contains("text/event-stream"))
            .unwrap_or(false);
        let text = resp.text().await?;
        if is_sse {
            // Server-sent events: the JSON-RPC message rides on `data:` lines.
            let mut fallback = None;
            for line in text.lines() {
                if let Some(d) = line.strip_prefix("data:") {
                    let d = d.trim();
                    if d.is_empty() {
                        continue;
                    }
                    if let Ok(v) = serde_json::from_str::<Value>(d) {
                        if v.get("result").is_some() || v.get("error").is_some() {
                            return Ok(Some(v));
                        }
                        fallback.get_or_insert(v);
                    }
                }
            }
            Ok(fallback)
        } else {
            Ok(serde_json::from_str::<Value>(&text).ok())
        }
    }

    pub async fn initialize(&mut self) -> Result<()> {
        self.post(
            json!({
                "jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": { "name": "rift-companion", "version": "0.1.0" }
                }
            }),
            false,
        )
        .await?;
        self.post(json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }), true).await?;
        Ok(())
    }

    /// Call a tool; returns the parsed DSL content as JSON.
    pub async fn call_tool(&mut self, name: &str, arguments: Value) -> Result<Value> {
        let body = json!({
            "jsonrpc": "2.0", "id": next_id(), "method": "tools/call",
            "params": { "name": name, "arguments": arguments }
        });
        let msg = self.post(body, false).await?.ok_or_else(|| anyhow!("no response from {name}"))?;
        if let Some(e) = msg.get("error") {
            return Err(anyhow!("{name}: {e}"));
        }
        // result.content is an array of {type, text}; the data rides on the text item.
        let text = msg
            .pointer("/result/content")
            .and_then(|c| c.as_array())
            .and_then(|items| items.iter().find(|i| i.get("type").and_then(|t| t.as_str()) == Some("text")))
            .and_then(|i| i.get("text"))
            .and_then(|t| t.as_str());
        match text {
            Some(t) => Ok(super::dsl::parse(t)),
            None => Ok(msg.get("result").cloned().unwrap_or(Value::Null)),
        }
    }
}

fn next_id() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(1)
}
