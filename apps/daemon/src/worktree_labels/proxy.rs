mod relay;

use std::sync::Arc;

use bytes::Bytes;
use http_body_util::combinators::BoxBody;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::rt::TokioIo;
use thiserror::Error;
use tokio::net::TcpListener;
use tokio::sync::OnceCell;

use super::RouteRegistry;

// Why: every response body — proxied through from upstream or synthesized
// locally for a 404/502 — is boxed to this one concrete type so the
// `service_fn` handler has a single return type regardless of which path
// produced it.
pub(super) type ProxyBody = BoxBody<Bytes, hyper::Error>;

#[derive(Clone)]
pub(super) struct ProxyServer {
    port: Arc<OnceCell<u16>>,
    routes: RouteRegistry,
}

#[derive(Debug, Error)]
pub(crate) enum ProxyServerError {
    #[error("failed to start the localhost label proxy: {0}")]
    Bind(#[from] std::io::Error),
}

impl ProxyServer {
    pub(super) fn new(routes: RouteRegistry) -> Self {
        Self {
            port: Arc::new(OnceCell::new()),
            routes,
        }
    }

    pub(super) async fn ensure_started(&self) -> Result<u16, ProxyServerError> {
        let routes = self.routes.clone();
        self.port
            .get_or_try_init(|| async move {
                let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
                let port = listener.local_addr()?.port();
                tokio::spawn(accept_loop(listener, routes));
                Ok(port)
            })
            .await
            .copied()
    }
}

async fn accept_loop(listener: TcpListener, routes: RouteRegistry) {
    loop {
        let Ok((socket, _)) = listener.accept().await else {
            continue;
        };
        let routes = routes.clone();
        tokio::spawn(async move {
            let io = TokioIo::new(socket);
            let service = service_fn(move |request| relay::handle(request, routes.clone()));
            // Why: `.with_upgrades()` lets a WebSocket handshake on this
            // connection hand the raw socket to `hyper::upgrade::on` instead
            // of hyper closing it once the 101 response is written — this is
            // real HTTP/1.1 framing, so unlike the previous raw-TCP relay,
            // keep-alive across multiple requests on one browser connection
            // now works without forcing `Connection: close`.
            let _ = http1::Builder::new()
                .serve_connection(io, service)
                .with_upgrades()
                .await;
        });
    }
}
