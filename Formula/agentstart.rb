# Why: Homebrew needs platform-specific compiled Rust artifacts that the generic shell installer
# cannot express through Formula DSL; the AgentStart CLI owns cross-platform service registration.
# Why: the release workflow renders this non-installable template only after its signed artifacts
# are public, keeping main from advertising a formula whose download URLs do not exist yet.
class AgentStart < Formula
  desc "Chrome workspace daemon for coding agents"
  homepage "https://github.com/xinyao27/agentstart"
  version "0.1.6"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.6/agentstart-rust-darwin-arm64",
          using: :nounzip
      sha256 "4838fa36b65255fbd0a1513ba5f30d5c6436520dc1c54ed1a74ec6c48017b328"
    else
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.6/agentstart-rust-darwin-x64",
          using: :nounzip
      sha256 "2d68787ef26b0faad1564d7a2029d4187a87ed8b34480ff46693f23d290293df"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.6/agentstart-rust-linux-arm64",
          using: :nounzip
      sha256 "bafd1e39294d0703b6c07f0eb974cc3e84af02f8a7b5fa1a42550fb7d9bc63d1"
    else
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.6/agentstart-rust-linux-x64",
          using: :nounzip
      sha256 "a317cf02d4a14884601093f97cd149ceff30122aad91420f23e82185dcee600a"
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
