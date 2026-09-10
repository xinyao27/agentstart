import SwiftUI
import WebKit

// Hosts the sandboxed page that runs mermaid.js for MermaidDiagramView. The webview carries no
// product capability: it never persists data (an ephemeral data store), never navigates anywhere
// but its own initial `loadHTMLString` call, and exposes exactly one script message handler that
// only accepts the height-or-"error" string the page's own inline script posts back.
struct MermaidWebView: UIViewRepresentable {
    static let bridgeName = "mermaidBridge"

    let source: String
    let colorScheme: ColorScheme
    let onHeight: (CGFloat) -> Void
    let onFailure: () -> Void

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: Self.bridgeName)

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = true
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        // Why: the diagram must never capture the surrounding transcript's scroll gesture, in
        // either the loading or rendered state.
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.panGestureRecognizer.isEnabled = false
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let loadKey = "\(colorScheme)|\(source)"
        guard context.coordinator.loadedKey != loadKey else { return }
        context.coordinator.loadedKey = loadKey
        context.coordinator.hasLoadedInitialRequest = false
        webView.backgroundColor = resolvedColor(Theme.Colors.content, for: colorScheme)
        webView.loadHTMLString(mermaidHTML(source: source, colorScheme: colorScheme), baseURL: nil)
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: bridgeName)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onHeight: onHeight, onFailure: onFailure)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var loadedKey: String?
        var hasLoadedInitialRequest = false
        private let onHeight: (CGFloat) -> Void
        private let onFailure: () -> Void

        init(onHeight: @escaping (CGFloat) -> Void, onFailure: @escaping () -> Void) {
            self.onHeight = onHeight
            self.onFailure = onFailure
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            // Why: the page never navigates on its own. The only expected load is the single
            // `loadHTMLString` call from updateUIView; anything past that (a redirect, a link,
            // window.location) means something is wrong, so cancel and fall back to source.
            guard !hasLoadedInitialRequest else {
                decisionHandler(.cancel)
                onFailure()
                return
            }
            hasLoadedInitialRequest = true
            decisionHandler(.allow)
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            onFailure()
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            onFailure()
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard let body = message.body as? String else { return }
            if body == "error" {
                onFailure()
                return
            }
            if let height = Double(body), height > 0 {
                onHeight(CGFloat(height))
            }
        }
    }
}

// Self-contained HTML: load mermaid from the CDN, render the graph, and post the rendered
// height (or "error") back through the bridge. Theme colors are resolved ahead of time to
// concrete hex/rgba strings for the current color scheme, since the page has no access to the
// app's Theme tokens.
private func mermaidHTML(source: String, colorScheme: ColorScheme) -> String {
    let encodedSource = jsonEncodedString(source)
    let backgroundColor = cssColor(Theme.Colors.content, for: colorScheme)
    // Why: mermaid's `card`-role theme variable has no direct Theme equivalent; `keycap` is the
    // closest existing opaque secondary surface, giving diagram nodes real contrast on `content`.
    let nodeColor = cssColor(Theme.Colors.keycap, for: colorScheme)
    let foregroundColor = cssColor(Theme.Colors.foreground, for: colorScheme)
    let mutedColor = cssColor(Theme.Colors.mutedForeground, for: colorScheme)
    let mermaidTheme = colorScheme == .dark ? "dark" : "default"
    return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          html, body { margin: 0; padding: 0; background: \(backgroundColor); }
          #c { padding: 8px; }
          #c svg { max-width: 100%; height: auto; }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
        </head>
        <body>
        <div id="c"><pre class="mermaid"></pre></div>
        <script>
          function post(message) {
            window.webkit.messageHandlers.\(MermaidWebView.bridgeName).postMessage(String(message));
          }
          function reportHeight() {
            post(document.getElementById('c').scrollHeight);
          }
          try {
            document.querySelector('.mermaid').textContent = \(encodedSource);
            mermaid.initialize({
              startOnLoad: false,
              theme: '\(mermaidTheme)',
              securityLevel: 'strict',
              darkMode: \(colorScheme == .dark),
              themeVariables: {
                background: '\(backgroundColor)',
                primaryColor: '\(nodeColor)',
                primaryTextColor: '\(foregroundColor)',
                lineColor: '\(mutedColor)',
                textColor: '\(foregroundColor)'
              }
            });
            mermaid.run({ querySelector: '.mermaid' }).then(reportHeight).catch(function () { post('error'); });
          } catch (e) {
            post('error');
          }
        </script>
        </body>
        </html>
        """
}

// JSON-encodes the diagram source so it embeds safely inside the page's inline script.
private func jsonEncodedString(_ text: String) -> String {
    guard let data = try? JSONEncoder().encode(text), let json = String(data: data, encoding: .utf8)
    else {
        return "\"\""
    }
    return json
}

private func cssColor(_ color: Color, for colorScheme: ColorScheme) -> String {
    var red: CGFloat = 0
    var green: CGFloat = 0
    var blue: CGFloat = 0
    var alpha: CGFloat = 1
    resolvedColor(color, for: colorScheme).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
    return String(
        format: "rgba(%d, %d, %d, %.3f)",
        Int(red * 255), Int(green * 255), Int(blue * 255), alpha
    )
}

private func resolvedColor(_ color: Color, for colorScheme: ColorScheme) -> UIColor {
    let traits = UITraitCollection(userInterfaceStyle: colorScheme == .dark ? .dark : .light)
    return UIColor(color).resolvedColor(with: traits)
}
