import { installCommands } from './commands'
import { InstallSwitcher } from './switcher'

/**
 * Why: the installer's own `--help` output is the contract these rows restate, so
 * they carry the exact variable names it reads and the channel values it accepts.
 * Anything not in that output does not belong here.
 */
const installOptions = [
  {
    name: 'AGENTSTART_INSTALL_DIR',
    description: 'Where the daemon binary is installed.'
  },
  {
    name: 'AGENTSTART_VERSION',
    description: 'The release tag to install, or latest.'
  },
  {
    name: 'AGENTSTART_EXTENSION_CHANNEL',
    description:
      'unpacked (the default), web-store, or skip. The default stages the extension on disk, verifies it against the release checksums, and refreshes it on every upgrade, which keeps it level with the daemon instead of the review queue. web-store takes the listing Chrome updates on its own, and skip leaves the browser half alone.'
  },
  {
    name: 'AGENTSTART_SKIP_SERVICE_INSTALL',
    description: 'Set to 1 to install the binary without touching the login service.'
  },
  {
    name: 'AGENTSTART_NO_MOBILE',
    description: 'Set to 1 to omit the iOS link and code.'
  }
]

export function InstallPage(): React.JSX.Element {
  return (
    <>
      <h1 className="text-ink flex flex-col gap-3 pt-24 text-[26px] leading-[1.2] font-semibold">
        Install
        <span className="text-copy max-w-[620px] text-[16px] leading-[26px] font-normal">
          One command installs the daemon, registers the browser connection, and links the iOS
          companion.
        </span>
      </h1>

      <InstallSwitcher entries={installCommands} />

      <p className="text-faint max-w-[620px] text-[14px]">
        macOS and Linux on arm64 or x64, Windows on x64.
      </p>

      <h2 className="text-ink text-[17px] leading-[1.4] font-semibold">What the installer does</h2>
      <ul className="flex max-w-[620px] list-disc flex-col gap-2 pl-5">
        <li>
          Verifies the release checksum before it installs anything, so the daemon bytes match the
          published release.
        </li>
        <li>
          Installs the daemon to{' '}
          <code className="text-ink font-mono text-[14px]">~/.local/bin</code>, and says so when
          that directory is not on your PATH. Windows installs to{' '}
          <code className="text-ink font-mono text-[14px]">%LOCALAPPDATA%\AgentStart\bin</code>.
        </li>
        <li>
          Registers the Chrome Native Messaging host, which is how the extension reaches the daemon.
        </li>
        <li>
          Starts the daemon at login: a launchd agent on macOS, a systemd user service on Linux, and
          a logon task on Windows.
        </li>
        <li>
          Stages the Chrome extension on disk, verified against the release checksums, and prints
          the folder to load in{' '}
          <code className="text-ink font-mono text-[14px]">chrome://extensions</code>.
        </li>
        <li>
          Waits up to two minutes for the extension to connect and tells you whether setup is
          finished.
        </li>
        <li>Prints the iOS TestFlight link with a code to scan.</li>
      </ul>

      <h2 className="text-ink text-[17px] leading-[1.4] font-semibold">Options</h2>
      <p className="max-w-[620px]">
        Set one of these and the installer picks it up. The shell installer lists them with{' '}
        <code className="text-ink font-mono text-[14px]">sh install.sh --help</code>; PowerShell
        lists them with <code className="text-ink font-mono text-[14px]">install.ps1 -Help</code>.
      </p>
      <div className="flex flex-col gap-4">
        {installOptions.map((option) => (
          <div key={option.name} className="flex flex-col gap-1">
            <code className="text-ink font-mono text-[14px]">{option.name}</code>
            <span className="max-w-[620px]">{option.description}</span>
          </div>
        ))}
      </div>
      <p className="max-w-[620px]">
        An assignment applies to the command it precedes, so a piped install takes it on the right
        of the pipe —{' '}
        <code className="text-ink font-mono text-[14px]">
          curl -fsSL https://agentstart.ai/install.sh | AGENTSTART_VERSION=0.1.2 sh
        </code>{' '}
        pins the release. In PowerShell, set{' '}
        <code className="text-ink font-mono text-[14px]">$env:AGENTSTART_VERSION</code> before the
        one-liner.
      </p>

      <h2 className="text-ink text-[17px] leading-[1.4] font-semibold">After installing</h2>
      <ul className="flex max-w-[620px] list-disc flex-col gap-2 pl-5">
        <li>
          <code className="text-ink font-mono text-[14px]">agentstart status</code> reports the
          daemon and whether the Chrome extension is connected.
        </li>
        <li>
          If the extension has not connected yet, load the staged folder once: open{' '}
          <code className="text-ink font-mono text-[14px]">chrome://extensions</code>, turn on
          Developer mode, choose Load unpacked, and pick the folder the installer printed. It
          connects on its own after that.
        </li>
        <li>
          <code className="text-ink font-mono text-[14px]">agentstart update</code> moves the daemon
          to the latest release and refreshes the staged extension with it, and declines when the
          binary came from Homebrew or npm — it names the channel to update through instead.
        </li>
      </ul>
    </>
  )
}
