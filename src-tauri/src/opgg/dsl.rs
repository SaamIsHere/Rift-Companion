//! Parser for OP.GG MCP's compact "class/constructor" response DSL → `serde_json::Value`.
//!
//! A response is a set of header lines `class Name: f1,f2,...` followed by a
//! single expression of nested constructors `Name(v1, v2, [Inner(...), ...])`,
//! strings `"..."`, and numbers. Field names come from the matching class header
//! (by position). Mirrors the JS parser in `scripts/ingest-opgg.mjs`.

use std::collections::HashMap;

use serde_json::{Map, Number, Value};

pub fn parse(text: &str) -> Value {
    let trimmed = text.trim();
    if (trimmed.starts_with('{') && trimmed.ends_with('}'))
        || (trimmed.starts_with('[') && trimmed.ends_with(']'))
    {
        if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
            return v;
        }
    }
    let mut classes: HashMap<String, Vec<String>> = HashMap::new();
    let mut expr_lines: Vec<&str> = Vec::new();
    let mut in_expr = false;
    for line in text.lines() {
        if !in_expr {
            let t = line.trim_start();
            if let Some(rest) = t.strip_prefix("class ") {
                if let Some((name, fields)) = rest.split_once(':') {
                    let fs = fields
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                    classes.insert(name.trim().to_string(), fs);
                    continue;
                }
            }
            if t.is_empty() {
                continue;
            }
            in_expr = true;
        }
        expr_lines.push(line);
    }
    let expr: Vec<char> = expr_lines.join("\n").chars().collect();
    Parser { s: &expr, i: 0, classes: &classes }.value()
}

struct Parser<'a> {
    s: &'a [char],
    i: usize,
    classes: &'a HashMap<String, Vec<String>>,
}

impl<'a> Parser<'a> {
    fn ws(&mut self) {
        while self.i < self.s.len() && self.s[self.i].is_whitespace() {
            self.i += 1;
        }
    }
    fn peek(&self) -> char {
        if self.i < self.s.len() { self.s[self.i] } else { '\0' }
    }
    fn value(&mut self) -> Value {
        self.ws();
        match self.peek() {
            '"' => self.string(),
            '[' => self.array(),
            c if c.is_ascii_alphabetic() || c == '_' => self.ident_or_ctor(),
            _ => self.number(),
        }
    }
    fn string(&mut self) -> Value {
        self.i += 1; // opening quote
        let mut out = String::new();
        while self.i < self.s.len() {
            let c = self.s[self.i];
            self.i += 1;
            if c == '\\' {
                if self.i < self.s.len() {
                    out.push(self.s[self.i]);
                    self.i += 1;
                }
            } else if c == '"' {
                break;
            } else {
                out.push(c);
            }
        }
        Value::String(out)
    }
    fn array(&mut self) -> Value {
        self.i += 1; // [
        let mut arr = Vec::new();
        self.ws();
        if self.peek() == ']' {
            self.i += 1;
            return Value::Array(arr);
        }
        loop {
            arr.push(self.value());
            self.ws();
            if self.peek() == ',' {
                self.i += 1;
                continue;
            }
            break;
        }
        self.ws();
        if self.peek() == ']' {
            self.i += 1;
        }
        Value::Array(arr)
    }
    fn ident_or_ctor(&mut self) -> Value {
        let start = self.i;
        while self.i < self.s.len() && (self.s[self.i].is_ascii_alphanumeric() || self.s[self.i] == '_') {
            self.i += 1;
        }
        let ident: String = self.s[start..self.i].iter().collect();
        self.ws();
        if self.peek() == '(' {
            self.i += 1; // (
            let mut args = Vec::new();
            self.ws();
            if self.peek() != ')' {
                loop {
                    args.push(self.value());
                    self.ws();
                    if self.peek() == ',' {
                        self.i += 1;
                        continue;
                    }
                    break;
                }
            }
            self.ws();
            if self.peek() == ')' {
                self.i += 1;
            }
            if let Some(fields) = self.classes.get(&ident) {
                let mut obj = Map::new();
                for (k, v) in fields.iter().zip(args.into_iter()) {
                    obj.insert(k.clone(), v);
                }
                return Value::Object(obj);
            }
            let mut obj = Map::new();
            obj.insert("__class".into(), Value::String(ident));
            obj.insert("args".into(), Value::Array(args));
            return Value::Object(obj);
        }
        match ident.as_str() {
            "true" => Value::Bool(true),
            "false" => Value::Bool(false),
            "null" | "None" => Value::Null,
            _ => Value::String(ident),
        }
    }
    fn number(&mut self) -> Value {
        let start = self.i;
        while self.i < self.s.len() {
            let c = self.s[self.i];
            if c.is_ascii_digit() || matches!(c, '-' | '.' | 'e' | 'E' | '+') {
                self.i += 1;
            } else {
                break;
            }
        }
        let tok: String = self.s[start..self.i].iter().collect();
        if tok.contains('.') || tok.contains('e') || tok.contains('E') {
            tok.parse::<f64>()
                .ok()
                .and_then(Number::from_f64)
                .map(Value::Number)
                .unwrap_or(Value::Null)
        } else if let Ok(n) = tok.parse::<i64>() {
            Value::Number(n.into())
        } else {
            Value::String(tok)
        }
    }
}
