# Why: Homebrew needs platform-specific compiled Rust artifacts that the generic shell installer
# cannot express through Formula DSL; the AgentStart CLI owns cross-platform service registration.
# Why: the release workflow renders this non-installable template only after its signed artifacts
# are public, keeping main from advertising a formula whose download URLs do not exist yet.
class AgentStart < Formula
  desc "Chrome workspace daemon for coding agents"
  homepage "https://github.com/xinyao27/agentstart"
  version "0.1.4"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.4/agentstart-rust-darwin-arm64",
          using: :nounzip
      sha256 "e1c7b5775900277eddffe1982e64b4899adb2628dc3fc10d0b413248aff00dc0"
    else
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.4/agentstart-rust-darwin-x64",
          using: :nounzip
      sha256 "a4804e9adc6d7e1ba2bd3785c94f3ed59da1ba692a59025b95c55cab9fb76b9a"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.4/agentstart-rust-linux-arm64",
          using: :nounzip
      sha256 "55d8e56642747596b07fdbdc11cd4da16114ff63fcb0708eed40afd168a5bf2c"
    else
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.4/agentstart-rust-linux-x64",
          using: :nounzip
      sha256 "013760997d64fa0e7b50eb64f019a46236391a8892f1a501719e428eb9bacae3"
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
