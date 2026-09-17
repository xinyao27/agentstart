# Why: Homebrew needs platform-specific compiled Rust artifacts that the generic shell installer
# cannot express through Formula DSL; the AgentStart CLI owns cross-platform service registration.
# Why: the release workflow renders this non-installable template only after its signed artifacts
# are public, keeping main from advertising a formula whose download URLs do not exist yet.
class AgentStart < Formula
  desc "Chrome workspace daemon for coding agents"
  homepage "https://github.com/xinyao27/agentstart"
  version "0.1.5"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.5/agentstart-rust-darwin-arm64",
          using: :nounzip
      sha256 "10b205df3e812fea63e4c6feb72666a38bd7fab182fb2b976a8f081208a6a989"
    else
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.5/agentstart-rust-darwin-x64",
          using: :nounzip
      sha256 "e728900c7e83d972e7f6e02a706e3d193f9e80ca9b04f9a15175e3d0a2069ed5"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.5/agentstart-rust-linux-arm64",
          using: :nounzip
      sha256 "8f2a099f2ebaad69a6baf2b63515875513b873b78b777fd5e85e8ae1500c149c"
    else
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.5/agentstart-rust-linux-x64",
          using: :nounzip
      sha256 "d64ae355e0f7a7e8d8d70bca479fbd7afed32410cc1ef3e98facfcef3783b0fb"
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
