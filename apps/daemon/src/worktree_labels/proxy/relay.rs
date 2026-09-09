use std::collections::HashSet;
use std::convert::Infallible;

use bytes::Bytes;
use http::request::Builder as RequestBuilder;
use http::response::Builder as ResponseBuilder;
use http_body_util::{BodyExt, Empty, Full};
use hyper::body::Incoming;
use hyper::client::conn::http1 as client_http1;
use hyper::header::{CONNECTION, CONTENT_TYPE, HOST, UPGRADE};
use hyper::{HeaderMap, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use tokio::io::copy_bidirectional;
use tokio::net::TcpStream;

use super::super::label::connectable_loopback_host;
use super::super::{RegisteredRoute, RouteRegistry, YIRU_LOCALHOST_SUFFIX};
use super::ProxyBody;

pub(super) async fn handle(
    request: Request<Incoming>,
    routes: RouteRegistry,
) -> Result<Response<ProxyBody>, Infallible> {
    let Some(label) = label_from_host(request.headers()) else {
        return Ok(text_response(
            StatusCode::NOT_FOUND,
            "Unknown Yiru localhost label.",
        ));
    };
    let Some(route) = routes.lookup(&label) else {
        return Ok(text_response(
            StatusCode::NOT_FOUND,
            "Unknown Yiru localhost label.",
        ));
    };
    Ok(if is_upgrade_request(request.headers()) {
        handle_upgrade(request, &route, &label).await
    } else {
        handle_plain(request, &route).await
    })
}

// Why: the proxy only relabels `Host`; every other request/response header
// is relayed unmodified, except the hop-by-hop set RFC 7230 §6.1 says a
// proxy must strip at each leg — those name a property of one TCP hop
// (`Connection`, `Transfer-Encoding`, …), not of the message itself, and
// hyper independently decides this leg's own framing for the body we hand
// it, so forwarding them verbatim would risk a conflicting/duplicated
// `Transfer-Encoding` or `Connection` on the new connection.
async fn handle_plain(request: Request<Incoming>, route: &RegisteredRoute) -> Response<ProxyBody> {
    let mut upstream = match connect(route).await {
        Ok(sender) => sender,
        Err(response) => return response,
    };

    let (parts, body) = request.into_parts();
    let request_builder = Request::builder().method(parts.method).uri(parts.uri);
    let outbound = forwarding_headers(request_builder, &parts.headers, route).body(body);
    let outbound = match outbound {
        Ok(request) => request,
        Err(error) => return bad_gateway(&format!("Proxy failed: {error}")),
    };

    let upstream_response = match upstream.send_request(outbound).await {
        Ok(response) => response,
        Err(error) => return bad_gateway(&format!("Proxy failed: {error}")),
    };
    let (parts, body) = upstream_response.into_parts();
    let response_builder = Response::builder().status(parts.status);
    let response = relayed_response_headers(response_builder, &parts.headers).body(body.boxed());
    response.unwrap_or_else(|_| bad_gateway("Proxy failed: invalid upstream response"))
}

// Why: a transparent proxy must not answer the WebSocket handshake itself —
// only the upstream dev server knows the extensions/subprotocol it accepts
// and can compute the matching `Sec-WebSocket-Accept`. So this relays the
// client's exact upgrade request to upstream, then mirrors upstream's exact
// 101 response back verbatim, and only once both sides report an upgraded
// raw connection does it splice the two together — the same "double
// upgrade" shape hyper's own upgrade examples use for reverse proxies.
async fn handle_upgrade(
    mut request: Request<Incoming>,
    route: &RegisteredRoute,
    label: &str,
) -> Response<ProxyBody> {
    let mut upstream = match connect(route).await {
        Ok(sender) => sender,
        Err(response) => return response,
    };

    let client_on_upgrade = hyper::upgrade::on(&mut request);
    let (parts, body) = request.into_parts();
    let request_builder = Request::builder().method(parts.method).uri(parts.uri);
    let outbound = forwarding_headers(request_builder, &parts.headers, route).body(body);
    let outbound = match outbound {
        Ok(request) => request,
        Err(error) => return bad_gateway(&format!("Proxy failed for {label}: {error}")),
    };

    let mut upstream_response = match upstream.send_request(outbound).await {
        Ok(response) => response,
        Err(error) => return bad_gateway(&format!("Proxy failed for {label}: {error}")),
    };
    if upstream_response.status() != StatusCode::SWITCHING_PROTOCOLS {
        // Why: upstream declined the handshake — relay its real response
        // (often the app's own "not a websocket route" body) unmodified.
        let (parts, body) = upstream_response.into_parts();
        let response_builder = Response::builder().status(parts.status);
        let response =
            relayed_response_headers(response_builder, &parts.headers).body(body.boxed());
        return response.unwrap_or_else(|_| bad_gateway("Proxy failed: invalid upstream response"));
    }

    let upstream_on_upgrade = hyper::upgrade::on(&mut upstream_response);
    let mut mirrored = Response::builder().status(StatusCode::SWITCHING_PROTOCOLS);
    for (name, value) in upstream_response.headers() {
        mirrored = mirrored.header(name.clone(), value.clone());
    }
    let mirrored = match mirrored.body(empty_body()) {
        Ok(response) => response,
        Err(_) => return bad_gateway("Proxy failed: invalid upgrade response"),
    };

    tokio::spawn(async move {
        if let Ok((client_upgraded, upstream_upgraded)) =
            tokio::try_join!(client_on_upgrade, upstream_on_upgrade)
        {
            let mut client_io = TokioIo::new(client_upgraded);
            let mut upstream_io = TokioIo::new(upstream_upgraded);
            let _ = copy_bidirectional(&mut client_io, &mut upstream_io).await;
        }
    });
    mirrored
}

async fn connect(
    route: &RegisteredRoute,
) -> Result<client_http1::SendRequest<Incoming>, Response<ProxyBody>> {
    let connect_host = connectable_loopback_host(&route.target_host);
    let stream = TcpStream::connect((connect_host.as_str(), route.target_port))
        .await
        .map_err(|error| bad_gateway(&format!("Proxy failed: {error}")))?;
    let (sender, connection) = client_http1::handshake(TokioIo::new(stream))
        .await
        .map_err(|error| bad_gateway(&format!("Proxy failed: {error}")))?;
    // Why: `with_upgrades()` mirrors the server side — an upstream upgrade
    // response only becomes readable through `hyper::upgrade::on` if this
    // connection driver keeps running past the initial response.
    tokio::spawn(connection.with_upgrades());
    Ok(sender)
}

fn forwarding_headers(
    mut builder: RequestBuilder,
    headers: &HeaderMap,
    route: &RegisteredRoute,
) -> RequestBuilder {
    let stripped = hop_by_hop_names(headers);
    for (name, value) in headers {
        if *name == HOST || stripped.contains(name.as_str()) {
            continue;
        }
        builder = builder.header(name.clone(), value.clone());
    }
    builder.header(HOST, format!("{}:{}", route.target_host, route.target_port))
}

fn relayed_response_headers(mut builder: ResponseBuilder, headers: &HeaderMap) -> ResponseBuilder {
    let stripped = hop_by_hop_names(headers);
    for (name, value) in headers {
        if stripped.contains(name.as_str()) {
            continue;
        }
        builder = builder.header(name.clone(), value.clone());
    }
    builder
}

// Why: RFC 7230 §6.1 — these eight names are properties of one TCP hop, not
// of the message, and a proxy must drop them at each leg; a `Connection`
// header can additionally *name* further per-hop headers to drop.
fn hop_by_hop_names(headers: &HeaderMap) -> HashSet<String> {
    const FIXED: [&str; 8] = [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
    ];
    let mut names: HashSet<String> = FIXED.iter().map(|name| (*name).to_owned()).collect();
    for value in headers.get_all(CONNECTION) {
        if let Ok(value) = value.to_str() {
            names.extend(
                value
                    .split(',')
                    .map(|token| token.trim().to_ascii_lowercase())
                    .filter(|token| !token.is_empty()),
            );
        }
    }
    names
}

fn is_upgrade_request(headers: &HeaderMap) -> bool {
    let has_upgrade_header = headers.get(UPGRADE).is_some();
    let connection_mentions_upgrade = headers.get_all(CONNECTION).iter().any(|value| {
        value
            .to_str()
            .unwrap_or_default()
            .split(',')
            .any(|token| token.trim().eq_ignore_ascii_case("upgrade"))
    });
    has_upgrade_header && connection_mentions_upgrade
}

// Why: matches the Bun proxy's own simplification (`headers.host.split(':')[0]`)
// — the Host header this proxy itself hands out is always a `*.yiru.localhost`
// DNS name, never an IPv6 literal, so splitting on the first colon is safe here.
fn label_from_host(headers: &HeaderMap) -> Option<String> {
    let host = headers.get(HOST)?.to_str().ok()?;
    let host_only = host.split(':').next()?.to_ascii_lowercase();
    host_only
        .strip_suffix(YIRU_LOCALHOST_SUFFIX)
        .map(str::to_owned)
}

fn bad_gateway(message: &str) -> Response<ProxyBody> {
    text_response(StatusCode::BAD_GATEWAY, message)
}

fn text_response(status: StatusCode, body: &str) -> Response<ProxyBody> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(full_body(body.to_owned()))
        .unwrap_or_else(|_| Response::new(empty_body()))
}

fn empty_body() -> ProxyBody {
    Empty::<Bytes>::new()
        .map_err(|never: Infallible| match never {})
        .boxed()
}

fn full_body(text: String) -> ProxyBody {
    Full::new(Bytes::from(text))
        .map_err(|never: Infallible| match never {})
        .boxed()
}
