# Why: Homebrew needs platform-specific compiled Rust artifacts that the generic shell installer
# cannot express through Formula DSL; the AgentStart CLI owns cross-platform service registration.
# Why: the release workflow renders this non-installable template only after its signed artifacts
# are public, keeping main from advertising a formula whose download URLs do not exist yet.
class AgentStart < Formula
  desc "Chrome workspace daemon for coding agents"
  homepage "https://github.com/xinyao27/agentstart"
  version "0.1.1"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.1/agentstart-rust-darwin-arm64",
          using: :nounzip
      sha256 "8faf0062ff64e713ef3ae646a0f58461272ce20b789233350cf32d11eb0d7258"
    else
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.1/agentstart-rust-darwin-x64",
          using: :nounzip
      sha256 "fad961fa4bc434ca23fbe147986cdbb941c069bc42a7aa6d1f29d684d6324e43"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.1/agentstart-rust-linux-arm64",
          using: :nounzip
      sha256 "86874b5677ea548e1c5f21dc7c2dedc57b8aa0a255fd278cac06cb62bf7bbe85"
    else
      url "https://github.com/xinyao27/agentstart/releases/download/v0.1.1/agentstart-rust-linux-x64",
          using: :nounzip
      sha256 "db9297578632e4780c6b8b8fc394d9ac4e9f7d759d368a94178d590378fc4291"
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
    <<~EOS
      Finish installation by adding AgentStart to Chrome:
        https://chromewebstore.google.com/detail/agentstart/ljgpbhfigjepmdeaggfdagchkgaogglp
    EOS
  end
end
