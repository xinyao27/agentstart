# Why: Homebrew needs platform-specific compiled Rust artifacts that the generic shell installer
# cannot express through Formula DSL; the AgentStart CLI owns cross-platform service registration.
# Why: the release workflow renders this non-installable template only after its signed artifacts
# are public, keeping main from advertising a formula whose download URLs do not exist yet.
class AgentStart < Formula
  desc "Chrome workspace daemon for coding agents"
  homepage "https://github.com/xinyao27/agentstart"
  version "0.1.2"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.2/agentstart-rust-darwin-arm64",
          using: :nounzip
      sha256 "e8a0688a4b8d7d9eaf06f5a349a6fd9f595a825b2e53b0c286e2527acb85b8a4"
    else
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.2/agentstart-rust-darwin-x64",
          using: :nounzip
      sha256 "11738c05b053f19a1e1e0e6fa6a7c1eefa5d158dd1b9ba9e45a0415fa2724485"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.2/agentstart-rust-linux-arm64",
          using: :nounzip
      sha256 "40597460e18fff73ff50ee411309e355c1af3e0b98dedff620757e90f695008d"
    else
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.2/agentstart-rust-linux-x64",
          using: :nounzip
      sha256 "a8bbe35d013f34fd196964d0718aabfdc56a243710f8c7b7968e64674004de9f"
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
