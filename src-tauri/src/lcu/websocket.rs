//! LCU websocket connection + subscription.
//!
//! The LCU exposes a websocket using a simple JSON array protocol:
//!   * subscribe: `[5, "<event>"]`
//!   * event:     `[8, "<event>", { "data": ..., "eventType": ..., "uri": ... }]`
//!
//! We subscribe to `OnJsonApiEvent_lol-champ-select_v1_session` so we only get
//! champ-select session deltas.

use anyhow::Result;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async_tls_with_config, Connector, MaybeTlsStream, WebSocketStream};

use crate::lcu::client::auth_header;
use crate::lcu::lockfile::Lockfile;

pub type WsStream = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

const CHAMP_SELECT_EVENT: &str = "OnJsonApiEvent_lol-champ-select_v1_session";
const GAMEFLOW_PHASE_EVENT: &str = "OnJsonApiEvent_lol-gameflow_v1_gameflow-phase";

pub async fn connect(lock: &Lockfile) -> Result<WsStream> {
    let url = format!("wss://127.0.0.1:{}/", lock.port);
    let mut request = url.into_client_request()?;
    request
        .headers_mut()
        .insert("Authorization", auth_header(lock).parse()?);

    // Accept the LCU's self-signed certificate (local-only).
    let tls = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()?;
    let connector = Connector::NativeTls(tls);

    let (mut ws, _resp) =
        connect_async_tls_with_config(request, None, false, Some(connector)).await?;

    // Subscribe to champ-select session and gameflow events.
    use futures_util::SinkExt;
    let subscribe_cs = format!("[5, \"{CHAMP_SELECT_EVENT}\"]");
    ws.send(Message::Text(subscribe_cs.into())).await?;

    let subscribe_gf = format!("[5, \"{GAMEFLOW_PHASE_EVENT}\"]");
    ws.send(Message::Text(subscribe_gf.into())).await?;

    Ok(ws)
}
