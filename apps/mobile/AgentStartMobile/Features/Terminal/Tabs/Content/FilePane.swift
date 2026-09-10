import CoreGraphics
import SwiftUI
import WebKit

struct WorkspaceFilePane: View {
    let title: String
    let descriptor: WorkspaceFileTab
    let refreshID: Int
    let focusLine: Int?
    let commentsModel: WorkspaceDiffCommentsModel?
    @State private var model: WorkspaceFileModel

    init(
        hostID: String,
        worktreeID: String,
        title: String,
        descriptor: WorkspaceFileTab,
        focusLine: Int? = nil,
        refreshID: Int = 0,
        repository: any WorkspaceContentRepository,
        connectionRuntime: any HostConnectionRuntime,
        commentsModel: WorkspaceDiffCommentsModel? = nil
    ) {
        self.title = title
        self.descriptor = descriptor
        self.refreshID = refreshID
        self.focusLine = focusLine
        self.commentsModel = commentsModel
        _model = State(
            initialValue: WorkspaceFileModel(
                hostID: hostID,
                worktreeID: worktreeID,
                repository: repository,
                connectionRuntime: connectionRuntime
            )
        )
    }

    var body: some View {
        Group {
            switch model.phase {
            case .waiting:
                AppUnavailableState(
                    "Waiting for daemon…",
                    iconID: .wifiSlash,
                    description: Text("Reconnect to load this file.")
                ) {
                    Button("Retry") { Task { await model.retry(descriptor) } }
                        .buttonStyle(.glass)
                        .appButtonContext(.regular)
                }
            case .loading:
                AgentStartLoader(size: Theme.Control.largeIcon)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .empty:
                AppUnavailableState(
                    "Empty file",
                    iconID: .fileText,
                    description: Text("This file does not contain any content.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let message):
                AppUnavailableState(
                    "File preview unavailable",
                    iconID: .fileText,
                    description: Text(message)
                ) {
                    Button("Retry") { Task { await model.retry(descriptor) } }
                        .buttonStyle(.glass)
                        .appButtonContext(.regular)
                }
            case .ready(let document):
                WorkspaceFileDocumentView(
                    document: document,
                    title: title,
                    path: descriptor.relativePath,
                    focusLine: focusLine,
                    diffSource: descriptor.diffSource,
                    commentsModel: commentsModel
                )
            }
        }
        .background(Theme.Colors.content)
        .task(id: FilePreviewLoadKey(descriptor: descriptor, refreshID: refreshID)) {
            await model.observe(descriptor)
        }
    }

}

private struct FilePreviewLoadKey: Hashable {
    let descriptor: WorkspaceFileTab
    let refreshID: Int
}

struct WorkspaceFileDocumentView: View {
    let document: WorkspaceFileDocument
    let title: String
    let path: String
    var focusLine: Int? = nil
    let diffSource: WorkspaceFileDiffSource?
    let commentsModel: WorkspaceDiffCommentsModel?

    init(
        document: WorkspaceFileDocument,
        title: String,
        path: String,
        focusLine: Int? = nil,
        diffSource: WorkspaceFileDiffSource? = nil,
        commentsModel: WorkspaceDiffCommentsModel? = nil
    ) {
        self.document = document
        self.title = title
        self.path = path
        self.focusLine = focusLine
        self.diffSource = diffSource
        self.commentsModel = commentsModel
    }

    @ViewBuilder
    var body: some View {
        switch document {
        case .text(let content, let isTruncated, let byteLength):
            WorkspaceTextPreview(
                content: content,
                path: path,
                isTruncated: isTruncated,
                byteLength: byteLength,
                focusLine: focusLine
            )
        case .diff(let lines, let isTruncated):
            WorkspaceDiffPane(
                lines: lines,
                isTruncated: isTruncated,
                filePath: path,
                source: diffSource,
                commentsModel: commentsModel
            )
        case .image(let data, _):
            WorkspaceImagePreview(data: data, title: title)
        case .html(let content, _):
            WorkspaceHTMLPreview(content: content)
        }
    }
}

private struct WorkspaceTextPreview: View {
    let content: String
    let path: String
    let isTruncated: Bool
    let byteLength: Int64
    let focusLine: Int?
    @State private var showsRenderedMarkdown: Bool

    // Why: markdown defaults to the rendered preview, except when a focus line was requested —
    // only source mode can scroll to a line.
    init(content: String, path: String, isTruncated: Bool, byteLength: Int64, focusLine: Int?) {
        self.content = content
        self.path = path
        self.isTruncated = isTruncated
        self.byteLength = byteLength
        self.focusLine = focusLine
        _showsRenderedMarkdown = State(initialValue: focusLine == nil)
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            VStack(spacing: 0) {
                if isTruncated {
                    Text("Preview truncated · \(byteLength.formatted()) bytes")
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Theme.Spacing.standard)
                        .padding(.vertical, Theme.Spacing.small)
                        .background(Theme.Colors.selection.opacity(0.45))
                }
                if isMarkdown, showsRenderedMarkdown {
                    ScrollView {
                        HostedReviewMarkdown(content: content)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                    }
                } else {
                    WorkspaceSourceText(content: content, path: path, focusLine: focusLine)
                }
            }
            if isMarkdown {
                Button(showsRenderedMarkdown ? "Source" : "Preview") {
                    showsRenderedMarkdown.toggle()
                }
                .buttonStyle(.glass)
                .appButtonContext(.regular)
                .padding(16)
            }
        }
    }

    private var isMarkdown: Bool {
        WorkspaceFileProjection.isMarkdown(path)
    }
}

private struct WorkspaceSourceText: View {
    // Why: once a file's cumulative character budget is spent, remaining lines render as plain
    // text rather than tokenizing the rest of a very large file.
    private static let maxHighlightChars = 48_000
    // Why: guards a single pathological long line (e.g. a minified one-liner) from running the
    // per-character scanner synchronously inside one row's view body.
    private static let maxHighlightLineChars = 4_000

    let path: String
    let focusLine: Int?
    let lines: [String]
    let highlightableLineCount: Int

    init(content: String, path: String, focusLine: Int?) {
        self.path = path
        self.focusLine = focusLine
        let lines = content.components(separatedBy: .newlines)
        self.lines = lines
        // Why: computed once per document load (not per row/frame) so scrolling a large file
        // never re-walks the line array.
        var budget = Self.maxHighlightChars
        var count = 0
        for line in lines {
            budget -= line.count
            if budget < 0 { break }
            count += 1
        }
        self.highlightableLineCount = count
    }

    var body: some View {
        GeometryReader { geometry in
            ScrollViewReader { proxy in
                ScrollView([.horizontal, .vertical]) {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                            HStack(alignment: .top, spacing: 12) {
                                Text(verbatim: String(index + 1))
                                    .foregroundStyle(Theme.Colors.mutedForeground)
                                    .frame(minWidth: 34, alignment: .trailing)
                                codeText(for: line, at: index)
                                    .textSelection(.enabled)
                                    .fixedSize(horizontal: true, vertical: false)
                            }
                            .font(
                                .system(
                                    size: AgentStartDiffCodeLayout.codeFontSize, design: .monospaced
                                )
                            )
                            .padding(.horizontal, 12)
                            .padding(.vertical, 1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(index + 1 == focusLine ? Theme.Colors.selection : .clear)
                            .id(index + 1)
                        }
                    }
                    // Why: a two-axis ScrollView centers content shorter than its viewport
                    // unless the content owns the viewport height. Source previews start at the
                    // top, so short files stay top-aligned.
                    .frame(
                        minWidth: geometry.size.width,
                        minHeight: geometry.size.height,
                        alignment: .topLeading
                    )
                    .padding(.vertical, 14)
                }
                .onAppear { scroll(to: focusLine, with: proxy) }
                .onChange(of: focusLine) { _, line in scroll(to: line, with: proxy) }
            }
        }
    }

    // Why: reuses the Diff Code Surface's tokenizer (AgentStartDiffSyntax) and Theme.Colors.diffCode*
    // tokens so a language colors identically in the file preview and in diffs, instead of a
    // third hand-rolled highlighter with its own palette.
    @ViewBuilder
    private func codeText(for line: String, at index: Int) -> some View {
        let text = line.isEmpty ? " " : line
        if index < highlightableLineCount, line.count <= Self.maxHighlightLineChars {
            AgentStartDiffSyntaxText(text: text, filePath: path)
        } else {
            Text(verbatim: text)
                .foregroundStyle(Theme.Colors.foreground)
        }
    }

    private func scroll(to line: Int?, with proxy: ScrollViewProxy) {
        guard let line, line > 0 else { return }
        Task { @MainActor in
            await Task.yield()
            proxy.scrollTo(line, anchor: UnitPoint(x: 0, y: 0.5))
        }
    }
}

struct WorkspaceImagePreview: View {
    let data: Data
    let title: String
    @State private var scale = 1.0
    @State private var image: CGImage?

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            if let image {
                Image(decorative: image, scale: 1, orientation: .up)
                    .resizable()
                    .scaledToFit()
                    .scaleEffect(scale)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(16)
                    .accessibilityLabel(Text("\(title) image"))
                    .gesture(
                        MagnifyGesture().onChanged { value in
                            scale = min(4, max(1, value.magnification))
                        }
                    )
            } else {
                AgentStartLoader(size: Theme.Control.largeIcon)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task(id: title) {
            let decodedImage = await Task.detached(priority: .userInitiated) {
                PlatformImageDecoder.decode(data)
            }.value
            guard !Task.isCancelled else { return }
            image = decodedImage
        }
    }
}

struct WorkspaceHTMLPreview: View {
    let content: String
    @State private var showsSource = false

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            if showsSource {
                GeometryReader { geometry in
                    ScrollView([.horizontal, .vertical]) {
                        Text(verbatim: content)
                            .font(.system(size: Theme.Typography.code, design: .monospaced))
                            .foregroundStyle(Theme.Colors.foreground)
                            .textSelection(.enabled)
                            .padding(Theme.Spacing.standard)
                            .frame(
                                minWidth: geometry.size.width,
                                minHeight: geometry.size.height,
                                alignment: .topLeading
                            )
                    }
                }
            } else {
                WorkspaceHTMLWebView(content: content)
            }
            Button(showsSource ? "Preview" : "Source") { showsSource.toggle() }
                .buttonStyle(.glass)
                .appButtonContext(.regular)
                .padding(16)
        }
    }
}

private struct WorkspaceHTMLWebView: UIViewRepresentable {
    let content: String

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.loadedContent != content else { return }
        context.coordinator.loadedContent = content
        webView.loadHTMLString(content, baseURL: nil)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var loadedContent: String?
    }
}
