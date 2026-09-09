# Why: Homebrew needs platform-specific compiled Rust artifacts that the generic shell installer
# cannot express through Formula DSL; the Yiru CLI owns cross-platform service registration.
# Why: the release workflow pins these checksums from its signed artifacts because Rust release
# bytes exist only after CI signs and notarizes them and cannot be reproduced by local builds.
class Yiru < Formula
  desc "Chrome workspace daemon for coding agents"
  homepage "https://yiru.ai"
  version "0.0.36"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/yiru/releases/download/v0.0.36/yiru-rust-darwin-arm64",
          using: :nounzip
      sha256 "7fde64b953de9ba4fcaa898270320ed70ed35cf7b43738345b91df073233cc6b"
    else
      url "https://github.com/xinyao27/yiru/releases/download/v0.0.36/yiru-rust-darwin-x64",
          using: :nounzip
      sha256 "49c3ccdce053dee8b5698c4cdff1fc6ce08ef7a802102b0fe23488177db7122f"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/xinyao27/yiru/releases/download/v0.0.36/yiru-rust-linux-arm64",
          using: :nounzip
      sha256 "3026ceb466625bfc79a8e59c7244634169263f9083721dffded49c028d7c1128"
    else
      url "https://github.com/xinyao27/yiru/releases/download/v0.0.36/yiru-rust-linux-x64",
          using: :nounzip
      sha256 "757229565f739e5332af3ca86ce34a23dd35744f0f354fa74b811ec955ead6c1"
    end
  end

  def install
    artifact = Dir["yiru-rust-*"].first
    odie "Yiru release artifact is missing" unless artifact

    bin.install artifact => "yiru"
  end

  def post_install
    system bin/"yiru", "install", "--no-browser"
  end

  def caveats
    <<~EOS
      Finish installation by adding Yiru to Chrome:
        https://chromewebstore.google.com/detail/yiru/mfgmfiabfncmdekmikepemddejoeihbf
    EOS
  end
end
