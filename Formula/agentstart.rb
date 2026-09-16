# Why: Homebrew needs platform-specific compiled Rust artifacts that the generic shell installer
# cannot express through Formula DSL; the AgentStart CLI owns cross-platform service registration.
# Why: the release workflow renders this non-installable template only after its signed artifacts
# are public, keeping main from advertising a formula whose download URLs do not exist yet.
class AgentStart < Formula
  desc "Chrome workspace daemon for coding agents"
  homepage "https://github.com/xinyao27/agentstart"
  version "0.1.3"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.3/agentstart-rust-darwin-arm64",
          using: :nounzip
      sha256 "8d9eac643c837200345f732d4c5c163835336d4ee43667326ce9f40739468439"
    else
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.3/agentstart-rust-darwin-x64",
          using: :nounzip
      sha256 "269192ffbf8ccd1f2564afcd7f98d6054015df3d47b42d3a6dd9734188f04393"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.3/agentstart-rust-linux-arm64",
          using: :nounzip
      sha256 "a82a58b328c89b50404e17cf118d001785e84531125ab7cdc3f9433f4f408ed9"
    else
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.3/agentstart-rust-linux-x64",
          using: :nounzip
      sha256 "505d9c79c5250d761230a57e96c1e3f6beff62fe62a9ab7c8a3185055ca10433"
    end
  end

  def install
    artifact = Dir["agentstart-rust-*"].first
    odie "AgentStart release artifact is missing" unless artifact

    bin.install artifact => "agentstart"
  end

  def post_install
    system bin/"agentstart", "install", "--no-browser"
  end

  def caveats
    directory =
      if OS.mac?
        "~/Library/Application Support/AgentStart/ChromeExtension"
      else
        "${XDG_DATA_HOME:-~/.local/share}/AgentStart/ChromeExtension"
      end
    <<~EOS
      AgentStart staged its Chrome extension at:
        #{directory}

      Load it once: open chrome://extensions, turn on Developer mode, choose Load unpacked, and
      select that folder. Later upgrades refresh it in place. Set
      AGENTSTART_EXTENSION_CHANNEL=web-store before installing to take the Chrome Web Store listing
      instead.
    EOS
  end
end
