# Why: curl installs need platform detection, checksum verification, Native Messaging registration,
# and service activation; no package-manager one-liner can own that sequence safely.
set -eu

repository="xinyao27/yiru"
install_directory="${YIRU_INSTALL_DIR:-${HOME}/.local/bin}"
release_version="${YIRU_VERSION:-latest}"
skip_service_install="${YIRU_SKIP_SERVICE_INSTALL:-0}"
max_binary_bytes=268435456
max_checksum_bytes=1048576

case "$skip_service_install" in
  0 | 1) ;;
  *)
    echo "YIRU_SKIP_SERVICE_INSTALL must be 0 or 1." >&2
    exit 1
    ;;
esac

case "$(uname -s)" in
  Darwin) platform="darwin" ;;
  Linux) platform="linux" ;;
  *)
    echo "Yiru's shell installer supports macOS and Linux; use npm on Windows." >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) architecture="arm64" ;;
  x86_64 | amd64) architecture="x64" ;;
  *)
    echo "Unsupported CPU architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

target="rust-${platform}-${architecture}"
if [ "$platform" = "linux" ] && { ldd --version 2>&1 || true; } | grep -qi musl; then
  target="${target}-musl"
fi
asset="yiru-${target}"
if [ "$release_version" = "latest" ]; then
  release_base="https://github.com/${repository}/releases/latest/download"
else
  case "$release_version" in v*) tag="$release_version" ;; *) tag="v${release_version}" ;; esac
  release_base="https://github.com/${repository}/releases/download/${tag}"
fi

temporary_directory="$(mktemp -d)"
temporary_directory="$(cd "$temporary_directory" && pwd -P)"
transaction_directory=""
transaction_committed=0
replacement_installed=0
had_previous_binary=0
previous_service_state="unknown"
previous_service_enablement="unspecified"
service_setup_attempted=0
native_manifest_path=""
native_manifest_existed=0
native_manifest_directory_existed=0
service_definition_path=""
service_definition_existed=0
service_definition_directory_existed=0
helper_state_managed=0
helper_state_existed=0
helper_state_directory_existed=0
install_directory_existed=0
install_directory_preflight_done=0
rollback_failed=0
active_download_pid=""
download_watchdog_pid=""
download_fifo=""
active_setup_pid=""
setup_watchdog_pid=""

trim_value() {
  printf '%s' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

read_platform_service_state() {
  if [ "$platform" = "darwin" ]; then
    if ! /bin/launchctl print "$launch_domain" >/dev/null 2>&1; then
      printf '%s\n' "unknown"
      return
    fi
    if /bin/launchctl print "${launch_domain}/com.yiru.daemon" >/dev/null 2>&1; then
      if [ "$service_definition_existed" = "1" ]; then
        printf '%s\n' "running"
      else
        printf '%s\n' "unrestorable"
      fi
    else
      if [ "$service_definition_existed" = "1" ]; then
        printf '%s\n' "stopped"
      else
        printf '%s\n' "not_installed"
      fi
    fi
    return
  fi
  if systemd_state="$(systemctl --user is-active yiru.service 2>/dev/null)"; then
    systemd_status=0
  else
    systemd_status=$?
  fi
  systemd_state="$(trim_value "$systemd_state")"
  case "$systemd_state:$systemd_status" in
    active:0)
      if [ "$service_definition_existed" = "1" ]; then
        printf '%s\n' "running"
      else
        printf '%s\n' "unrestorable"
      fi
      ;;
    inactive:3)
      if [ "$service_definition_existed" = "1" ]; then
        printf '%s\n' "stopped"
      else
        printf '%s\n' "not_installed"
      fi
      ;;
    unknown:4)
      if [ "$service_definition_existed" = "1" ]; then
        printf '%s\n' "unknown"
      else
        printf '%s\n' "not_installed"
      fi
      ;;
    *) printf '%s\n' "unknown" ;;
  esac
}

read_service_enablement() {
  if [ "$platform" = "darwin" ]; then
    if ! disabled_services="$(/bin/launchctl print-disabled "$launch_domain" 2>/dev/null)"; then
      printf '%s\n' "unknown"
      return
    fi
    compact_disabled_services="$(printf '%s' "$disabled_services" | tr -d '[:space:]')"
    case "$compact_disabled_services" in
      *'"com.yiru.daemon"=>true'*) printf '%s\n' "disabled" ;;
      *'"com.yiru.daemon"=>false'*) printf '%s\n' "enabled" ;;
      *) printf '%s\n' "unspecified" ;;
    esac
    return
  fi
  if systemd_enablement="$(systemctl --user is-enabled yiru.service 2>/dev/null)"; then
    systemd_enablement_status=0
  else
    systemd_enablement_status=$?
  fi
  systemd_enablement="$(trim_value "$systemd_enablement")"
  case "$systemd_enablement:$systemd_enablement_status" in
    enabled:0) printf '%s\n' "enabled" ;;
    enabled-runtime:0) printf '%s\n' "enabled-runtime" ;;
    disabled:1)
      if [ "$service_definition_existed" = "1" ]; then
        printf '%s\n' "disabled"
      else
        printf '%s\n' "absent"
      fi
      ;;
    not-found:4)
      if [ "$service_definition_existed" = "1" ]; then
        printf '%s\n' "unknown"
      else
        printf '%s\n' "absent"
      fi
      ;;
    *) printf '%s\n' "unknown" ;;
  esac
}

read_directory_mode() {
  if [ "$platform" = "darwin" ]; then
    stat -f '%Lp' "$1"
    return
  fi
  stat -c '%a' "$1"
}

find_existing_directory_ancestor() {
  directory_cursor="$1"
  while [ ! -e "$directory_cursor" ] && [ ! -L "$directory_cursor" ]; do
    directory_parent="$(dirname "$directory_cursor")"
    [ "$directory_parent" != "$directory_cursor" ] || return 1
    directory_cursor="$directory_parent"
  done
  [ -d "$directory_cursor" ] || return 1
  printf '%s\n' "$directory_cursor"
}

restore_directory_state() {
  directory_path="$1"
  directory_existed="$2"
  directory_mode="$3"
  directory_existing_ancestor="$4"
  if [ "$directory_existed" = "1" ]; then
    chmod "$directory_mode" "$directory_path"
    return
  fi
  directory_cursor="$directory_path"
  while [ "$directory_cursor" != "$directory_existing_ancestor" ]; do
    if ! rmdir "$directory_cursor" >/dev/null 2>&1 &&
      { [ -e "$directory_cursor" ] || [ -L "$directory_cursor" ]; }; then
      return 1
    fi
    directory_cursor="$(dirname "$directory_cursor")"
  done
}

restore_path_state() {
  restore_path="$1"
  restore_backup="$2"
  restore_existed="$3"
  if [ "$restore_existed" != "1" ]; then
    # Why: preflight rejected a directory here, so a new path at this exact managed target belongs
    # to the failed setup transaction and is safe to remove.
    rm -rf "$restore_path"
    return
  fi
  restore_parent="$(dirname "$restore_path")"
  mkdir -p "$restore_parent" || return 1
  restore_staging="$(mktemp -d "${restore_parent}/.yiru-restore.XXXXXX")" || return 1
  if ! cp -Pp "$restore_backup" "${restore_staging}/value"; then
    rm -rf "$restore_staging"
    return 1
  fi
  restore_current_moved=0
  if [ -e "$restore_path" ] || [ -L "$restore_path" ]; then
    if ! mv "$restore_path" "${restore_staging}/current"; then
      rm -rf "$restore_staging"
      return 1
    fi
    restore_current_moved=1
  fi
  if mv "${restore_staging}/value" "$restore_path"; then
    rm -rf "$restore_staging"
    return 0
  fi
  if [ "$restore_current_moved" = "1" ] &&
    ! mv "${restore_staging}/current" "$restore_path"; then
    echo "Managed-path recovery files were preserved at ${restore_staging}." >&2
    return 1
  fi
  rm -rf "$restore_staging"
  return 1
}

quiesce_service() {
  if [ "$platform" = "darwin" ]; then
    /bin/launchctl bootout "$launch_domain" "$service_definition_path" >/dev/null 2>&1 || true
    /bin/launchctl bootout "${launch_domain}/com.yiru.daemon" >/dev/null 2>&1 || true
    ! /bin/launchctl print "${launch_domain}/com.yiru.daemon" >/dev/null 2>&1
    return
  fi
  systemctl --user stop yiru.service >/dev/null 2>&1 || true
  if stopped_state="$(systemctl --user is-active yiru.service 2>/dev/null)"; then
    stopped_status=0
  else
    stopped_status=$?
  fi
  stopped_state="$(trim_value "$stopped_state")"
  { [ "$stopped_state" = "inactive" ] && [ "$stopped_status" = "3" ]; } ||
    { [ "$stopped_state" = "unknown" ] && [ "$stopped_status" = "4" ]; }
}

restore_service_state() {
  service_restore_status=0
  if [ "$platform" = "darwin" ]; then
    restore_path_state "$service_definition_path" "$service_definition_backup_path" \
      "$service_definition_existed" || service_restore_status=1
    # Why: launchctl has no public per-label unset; an unspecified override is effectively enabled,
    # so rollback restores that behavior without editing launchd's private persistence database.
    if [ "$previous_service_enablement" = "enabled" ] ||
      [ "$previous_service_enablement" = "unspecified" ]; then
      /bin/launchctl enable "${launch_domain}/com.yiru.daemon" >/dev/null 2>&1 ||
        service_restore_status=1
    fi
    if [ "$previous_service_state" = "running" ]; then
      if [ "$binary_state_restored" != "1" ] ||
        ! /bin/launchctl bootstrap "$launch_domain" "$service_definition_path" >/dev/null 2>&1; then
        service_restore_status=1
      fi
    fi
    if [ "$previous_service_enablement" = "disabled" ]; then
      /bin/launchctl disable "${launch_domain}/com.yiru.daemon" >/dev/null 2>&1 ||
        service_restore_status=1
    fi
    restore_directory_state "$(dirname "$service_definition_path")" \
      "$service_definition_directory_existed" "$service_definition_directory_mode" \
      "$service_definition_directory_existing_ancestor" ||
      service_restore_status=1
    return "$service_restore_status"
  fi

  # Why: disable the replacement before restoring a prior symlink-backed unit; systemctl disable
  # may otherwise remove the restored definition itself while cleaning the replacement's wants.
  systemctl --user disable yiru.service >/dev/null 2>&1 || true
  restore_path_state "$service_definition_path" "$service_definition_backup_path" \
    "$service_definition_existed" || service_restore_status=1
  systemctl --user daemon-reload >/dev/null 2>&1 || service_restore_status=1
  if [ "$previous_service_enablement" = "enabled" ]; then
    systemctl --user enable yiru.service >/dev/null 2>&1 || service_restore_status=1
  elif [ "$previous_service_enablement" = "enabled-runtime" ]; then
    systemctl --user enable --runtime yiru.service >/dev/null 2>&1 || service_restore_status=1
  fi
  if [ "$previous_service_state" = "running" ]; then
    if [ "$binary_state_restored" != "1" ] ||
      ! systemctl --user start yiru.service >/dev/null 2>&1; then
      service_restore_status=1
    fi
  fi
  if [ "$service_definition_directory_existed" != "1" ]; then
    rmdir "$(dirname "$service_definition_path")/default.target.wants" >/dev/null 2>&1 || true
  fi
  restore_directory_state "$(dirname "$service_definition_path")" \
    "$service_definition_directory_existed" "$service_definition_directory_mode" \
    "$service_definition_directory_existing_ancestor" ||
    service_restore_status=1
  return "$service_restore_status"
}

restore_helper_state() {
  [ "$helper_state_managed" = "1" ] || return 0
  if [ "$helper_state_existed" != "1" ]; then
    rm -rf "$helper_state_path" || return 1
    restore_directory_state "$(dirname "$helper_state_path")" \
      "$helper_state_directory_existed" "$helper_state_directory_mode" \
      "$helper_state_directory_existing_ancestor"
    return
  fi
  helper_state_parent="$(dirname "$helper_state_path")"
  mkdir -p "$helper_state_parent" || return 1
  helper_restore_staging="$(mktemp -d "${helper_state_parent}/.yiru-helper-restore.XXXXXX")" ||
    return 1
  if ! /usr/bin/ditto -x -k "$helper_state_backup_path" "$helper_restore_staging"; then
    rm -rf "$helper_restore_staging"
    return 1
  fi
  helper_restore_candidate="${helper_restore_staging}/computer-use"
  if [ ! -e "$helper_restore_candidate" ] && [ ! -L "$helper_restore_candidate" ]; then
    rm -rf "$helper_restore_staging"
    return 1
  fi
  helper_failed_state="${helper_restore_staging}/failed"
  helper_current_moved=0
  if [ -e "$helper_state_path" ] || [ -L "$helper_state_path" ]; then
    if ! mv "$helper_state_path" "$helper_failed_state"; then
      rm -rf "$helper_restore_staging"
      return 1
    fi
    helper_current_moved=1
  fi
  if mv "$helper_restore_candidate" "$helper_state_path"; then
    rm -rf "$helper_restore_staging"
    restore_directory_state "$(dirname "$helper_state_path")" \
      "$helper_state_directory_existed" "$helper_state_directory_mode" \
      "$helper_state_directory_existing_ancestor" || return 1
    return 0
  fi
  if [ "$helper_current_moved" = "1" ]; then
    if mv "$helper_failed_state" "$helper_state_path"; then
      rm -rf "$helper_restore_staging"
    else
      echo "Helper recovery files were preserved at ${helper_restore_staging}." >&2
    fi
  else
    rm -rf "$helper_restore_staging"
  fi
  return 1
}

rollback_install() {
  rollback_status=0
  binary_state_restored=0
  if [ "$service_setup_attempted" = "1" ]; then
    if ! quiesce_service; then
      echo "The replacement Yiru service could not be stopped during rollback." >&2
      rollback_status=1
    fi
  fi

  if restore_path_state "$executable" "$previous_binary_path" "$had_previous_binary"; then
    replacement_installed=0
    binary_state_restored=1
  else
    if [ "$had_previous_binary" = "1" ]; then
      echo "Could not restore the previous Yiru binary from ${previous_binary_path}." >&2
    else
      echo "Could not remove the incomplete Yiru installation at ${executable}." >&2
    fi
    rollback_status=1
  fi

  if ! restore_helper_state; then
    echo "The previous macOS computer-use helper state could not be restored." >&2
    rollback_status=1
  fi
  if ! restore_path_state "$native_manifest_path" "$native_manifest_backup_path" \
    "$native_manifest_existed"; then
    echo "The previous Native Messaging manifest state could not be restored." >&2
    rollback_status=1
  fi
  if ! restore_directory_state "$(dirname "$native_manifest_path")" \
    "$native_manifest_directory_existed" "$native_manifest_directory_mode" \
    "$native_manifest_directory_existing_ancestor"; then
    echo "The previous Native Messaging directory permissions could not be restored." >&2
    rollback_status=1
  fi
  if [ "$service_setup_attempted" = "1" ]; then
    if ! restore_service_state; then
      echo "The previous Yiru service definition or state could not be restored." >&2
      rollback_status=1
    fi
  fi
  if [ "$rollback_status" != "0" ]; then
    rollback_failed=1
    return 1
  fi
  if [ "$had_previous_binary" = "1" ]; then
    echo "Restored the previous Yiru installation after setup failed." >&2
  else
    echo "Removed the incomplete Yiru installation and restored prior setup state." >&2
  fi
}

cleanup() {
  cleanup_status=$?
  trap - 0
  trap '' HUP INT TERM
  if [ -n "$active_download_pid" ]; then
    kill "$active_download_pid" >/dev/null 2>&1 || true
    wait "$active_download_pid" 2>/dev/null || true
  fi
  if [ -n "$download_watchdog_pid" ]; then
    kill "$download_watchdog_pid" >/dev/null 2>&1 || true
    wait "$download_watchdog_pid" 2>/dev/null || true
  fi
  if [ -n "$active_setup_pid" ]; then
    kill "$active_setup_pid" >/dev/null 2>&1 || true
    kill -9 "$active_setup_pid" >/dev/null 2>&1 || true
    wait "$active_setup_pid" 2>/dev/null || true
  fi
  if [ -n "$setup_watchdog_pid" ]; then
    kill "$setup_watchdog_pid" >/dev/null 2>&1 || true
    wait "$setup_watchdog_pid" 2>/dev/null || true
  fi
  if [ -n "$download_fifo" ]; then
    rm -f "$download_fifo"
  fi
  if [ "$transaction_committed" != "1" ] && [ "$replacement_installed" = "1" ]; then
    rollback_install || cleanup_status=1
  fi
  if ! rm -rf "$temporary_directory"; then
    echo "Could not remove the download directory at ${temporary_directory}." >&2
    cleanup_status=1
  fi
  if [ -n "$transaction_directory" ]; then
    if [ "$rollback_failed" = "1" ]; then
      echo "Recovery files were preserved at ${transaction_directory}." >&2
    else
      if ! rm -rf "$transaction_directory"; then
        echo "Could not remove the transaction directory at ${transaction_directory}." >&2
        cleanup_status=1
      fi
    fi
  fi
  if [ "$transaction_committed" != "1" ] && [ "$rollback_failed" != "1" ] &&
    [ "$install_directory_preflight_done" = "1" ]; then
    if ! restore_directory_state "$install_directory" "$install_directory_existed" \
      "$install_directory_mode" "$install_directory_existing_ancestor"; then
      echo "The installation directory state could not be restored." >&2
      cleanup_status=1
    fi
  fi
  exit "$cleanup_status"
}

trap 'exit 1' HUP INT TERM
trap cleanup 0

download() {
  source_url="$1"
  destination="$2"
  maximum_bytes="$3"
  deadline_seconds="$4"
  download_fifo="${destination}.fifo"
  rm -f "$download_fifo"
  mkfifo "$download_fifo"
  if command -v curl >/dev/null 2>&1; then
    curl --connect-timeout 10 --fail --location --max-filesize "$maximum_bytes" \
      --max-time "$deadline_seconds" --silent --show-error \
      "$source_url" --output "$download_fifo" &
    active_download_pid=$!
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet --tries=1 --connect-timeout=10 --read-timeout=30 \
      "$source_url" --output-document "$download_fifo" &
    active_download_pid=$!
  else
    rm -f "$download_fifo"
    download_fifo=""
    echo "Install curl or wget, then retry." >&2
    exit 1
  fi

  (
    sleep "$deadline_seconds"
    kill "$active_download_pid" >/dev/null 2>&1 || true
  ) &
  download_watchdog_pid=$!

  read_succeeded=1
  if ! head -c "$((maximum_bytes + 1))" "$download_fifo" > "$destination"; then
    read_succeeded=0
  fi
  transfer_succeeded=1
  if ! wait "$active_download_pid"; then
    transfer_succeeded=0
  fi
  active_download_pid=""
  kill "$download_watchdog_pid" >/dev/null 2>&1 || true
  wait "$download_watchdog_pid" 2>/dev/null || true
  download_watchdog_pid=""
  rm -f "$download_fifo"
  download_fifo=""

  received_bytes="$(wc -c < "$destination" | tr -d '[:space:]')"
  if [ -z "$received_bytes" ] || [ "$received_bytes" -gt "$maximum_bytes" ]; then
    rm -f "$destination"
    echo "Download exceeded the ${maximum_bytes}-byte limit: ${source_url}" >&2
    exit 1
  fi
  if [ "$read_succeeded" != "1" ] || [ "$transfer_succeeded" != "1" ]; then
    rm -f "$destination"
    echo "Download failed or exceeded its ${deadline_seconds}-second deadline: ${source_url}" >&2
    exit 1
  fi
}

run_setup() {
  "$@" &
  active_setup_pid=$!
  (
    sleep 300
    kill "$active_setup_pid" >/dev/null 2>&1 || true
    sleep 5
    kill -9 "$active_setup_pid" >/dev/null 2>&1 || true
  ) &
  setup_watchdog_pid=$!
  setup_status=0
  wait "$active_setup_pid" || setup_status=$?
  active_setup_pid=""
  kill "$setup_watchdog_pid" >/dev/null 2>&1 || true
  wait "$setup_watchdog_pid" 2>/dev/null || true
  setup_watchdog_pid=""
  return "$setup_status"
}

download "${release_base}/${asset}" "${temporary_directory}/${asset}" "$max_binary_bytes" 180
download "${release_base}/yiru-checksums.txt" \
  "${temporary_directory}/yiru-checksums.txt" "$max_checksum_bytes" 30
if ! expected_checksum="$(awk -v name="$asset" '
  $2 == name {
    if (found || NF != 2 || length($1) != 64 || $1 !~ /^[0-9a-f]+$/) exit 2
    checksum = $1
    found = 1
  }
  END {
    if (!found) exit 3
    print checksum
  }
' "${temporary_directory}/yiru-checksums.txt")"; then
  echo "The release checksum list must contain one canonical SHA-256 for ${asset}." >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum="$(sha256sum "${temporary_directory}/${asset}" | awk '{ print $1 }')"
else
  actual_checksum="$(shasum -a 256 "${temporary_directory}/${asset}" | awk '{ print $1 }')"
fi
if [ "$actual_checksum" != "$expected_checksum" ]; then
  echo "Checksum verification failed for ${asset}." >&2
  exit 1
fi

case "$install_directory" in
  /*) ;;
  *) install_directory="$(pwd)/${install_directory}" ;;
esac
if [ -d "$install_directory" ]; then
  install_directory_mode="$(read_directory_mode "$install_directory")"
  install_directory_existed=1
elif [ -e "$install_directory" ] || [ -L "$install_directory" ]; then
  echo "Cannot install into non-directory path ${install_directory}." >&2
  exit 1
else
  install_directory_mode=""
  if ! install_directory_existing_ancestor="$(
    find_existing_directory_ancestor "$install_directory"
  )"; then
    echo "Cannot resolve an existing parent for ${install_directory}." >&2
    exit 1
  fi
  install_directory_existing_ancestor="$(
    cd "$install_directory_existing_ancestor" && pwd -P
  )"
fi
mkdir -p "$install_directory"
install_directory="$(cd "$install_directory" && pwd -P)"
if [ "$install_directory_existed" = "1" ]; then
  install_directory_existing_ancestor="$install_directory"
fi
install_directory_preflight_done=1
transaction_directory="$(mktemp -d "${install_directory}/.yiru-install.XXXXXX")"
candidate_path="${transaction_directory}/candidate"
previous_binary_path="${transaction_directory}/previous"
native_manifest_backup_path="${transaction_directory}/native-manifest"
service_definition_backup_path="${transaction_directory}/service-definition"
helper_state_backup_path="${transaction_directory}/computer-use.zip"
executable="${install_directory}/yiru"

raw_xdg_root="${XDG_CONFIG_HOME:-}"
configured_xdg_root="$(trim_value "$raw_xdg_root")"
if [ -n "$raw_xdg_root" ] && [ "$raw_xdg_root" != "$configured_xdg_root" ]; then
  echo "XDG_CONFIG_HOME cannot have leading or trailing whitespace." >&2
  exit 1
fi
effective_config_root="${configured_xdg_root:-${HOME}/.config}"
case "$effective_config_root" in
  /*) ;;
  *) effective_config_root="$(pwd)/${effective_config_root}" ;;
esac

configured_native_manifest_root="$(trim_value "${YIRU_NATIVE_MESSAGING_CONFIG_ROOT:-}")"
if [ -n "$configured_native_manifest_root" ]; then
  case "$configured_native_manifest_root" in
    /*) native_manifest_root="$configured_native_manifest_root" ;;
    *) native_manifest_root="$(pwd)/${configured_native_manifest_root}" ;;
  esac
elif [ "$platform" = "darwin" ]; then
  native_manifest_root="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
else
  native_manifest_root="${effective_config_root}/google-chrome/NativeMessagingHosts"
fi
native_manifest_path="${native_manifest_root}/com.yiru.daemon.json"
if [ -d "$native_manifest_root" ]; then
  native_manifest_directory_mode="$(read_directory_mode "$native_manifest_root")"
  native_manifest_directory_existed=1
  native_manifest_directory_existing_ancestor="$native_manifest_root"
elif [ -e "$native_manifest_root" ] || [ -L "$native_manifest_root" ]; then
  echo "Cannot install below non-directory path ${native_manifest_root}." >&2
  exit 1
else
  native_manifest_directory_mode=""
  if ! native_manifest_directory_existing_ancestor="$(
    find_existing_directory_ancestor "$native_manifest_root"
  )"; then
    echo "Cannot resolve an existing parent for ${native_manifest_root}." >&2
    exit 1
  fi
fi
if [ -f "$native_manifest_path" ] || [ -L "$native_manifest_path" ]; then
  cp -Pp "$native_manifest_path" "$native_manifest_backup_path"
  native_manifest_existed=1
elif [ -e "$native_manifest_path" ]; then
  echo "Cannot preserve ${native_manifest_path} because it is not a file." >&2
  exit 1
fi

if [ "$skip_service_install" != "1" ]; then
  if [ "$platform" = "darwin" ]; then
    launch_domain="gui/$(/usr/bin/id -u)"
    service_definition_path="${HOME}/Library/LaunchAgents/com.yiru.daemon.plist"
  else
    service_definition_path="${effective_config_root}/systemd/user/yiru.service"
  fi
  service_definition_directory="$(dirname "$service_definition_path")"
  if [ -d "$service_definition_directory" ]; then
    service_definition_directory_mode="$(read_directory_mode "$service_definition_directory")"
    service_definition_directory_existed=1
    service_definition_directory_existing_ancestor="$service_definition_directory"
  elif [ -e "$service_definition_directory" ] || [ -L "$service_definition_directory" ]; then
    echo "Cannot install below non-directory path ${service_definition_directory}." >&2
    exit 1
  else
    service_definition_directory_mode=""
    if ! service_definition_directory_existing_ancestor="$(
      find_existing_directory_ancestor "$service_definition_directory"
    )"; then
      echo "Cannot resolve an existing parent for ${service_definition_directory}." >&2
      exit 1
    fi
  fi
  if [ -f "$service_definition_path" ] || [ -L "$service_definition_path" ]; then
    cp -Pp "$service_definition_path" "$service_definition_backup_path"
    service_definition_existed=1
  elif [ -e "$service_definition_path" ]; then
    echo "Cannot preserve ${service_definition_path} because it is not a file." >&2
    exit 1
  fi
fi

if [ "$platform" = "darwin" ]; then
  helper_override="${YIRU_COMPUTER_MACOS_HELPER_APP_PATH:-}"
  if [ -z "$helper_override" ] ||
    [ ! -f "${helper_override}/Contents/MacOS/yiru-computer-use-macos" ]; then
    helper_state_managed=1
    configured_user_data_root="$(trim_value "${YIRU_APP_USER_DATA_PATH:-}")"
    if [ -z "$configured_user_data_root" ]; then
      configured_user_data_root="$(trim_value "${YIRU_USER_DATA_PATH:-}")"
    fi
    if [ -n "$configured_user_data_root" ]; then
      case "$configured_user_data_root" in
        /*) user_data_root="$configured_user_data_root" ;;
        *) user_data_root="$(pwd)/${configured_user_data_root}" ;;
      esac
    else
      user_data_root="${HOME}/Library/Application Support/yiru"
    fi
    helper_state_path="${user_data_root}/native/computer-use"
    helper_state_directory="$(dirname "$helper_state_path")"
    if [ -d "$helper_state_directory" ]; then
      helper_state_directory_mode="$(read_directory_mode "$helper_state_directory")"
      helper_state_directory_existed=1
      helper_state_directory_existing_ancestor="$helper_state_directory"
    elif [ -e "$helper_state_directory" ] || [ -L "$helper_state_directory" ]; then
      echo "Cannot install below non-directory path ${helper_state_directory}." >&2
      exit 1
    else
      helper_state_directory_mode=""
      if ! helper_state_directory_existing_ancestor="$(
        find_existing_directory_ancestor "$helper_state_directory"
      )"; then
        echo "Cannot resolve an existing parent for ${helper_state_directory}." >&2
        exit 1
      fi
    fi
    if [ -e "$helper_state_path" ] || [ -L "$helper_state_path" ]; then
      /usr/bin/ditto -c -k --sequesterRsrc --keepParent \
        "$helper_state_path" "$helper_state_backup_path"
      helper_state_existed=1
    fi
  fi
fi

install -m 0755 "${temporary_directory}/${asset}" "$candidate_path"
if [ -f "$executable" ] || [ -L "$executable" ]; then
  had_previous_binary=1
  cp -Pp "$executable" "$previous_binary_path"
elif [ -e "$executable" ]; then
  echo "Cannot replace ${executable} because it is not a file." >&2
  exit 1
fi
if [ "$skip_service_install" != "1" ]; then
  previous_service_state="$(read_platform_service_state)"
  case "$previous_service_state" in
    running | stopped | not_installed) ;;
    unrestorable)
      echo "Cannot safely replace a running service without its managed definition." >&2
      exit 1
      ;;
    *)
      echo "Cannot determine the existing Yiru service state." >&2
      exit 1
      ;;
  esac
  previous_service_enablement="$(read_service_enablement)"
  if [ "$previous_service_enablement" = "unknown" ]; then
    echo "Cannot determine the existing Yiru service enablement state." >&2
    exit 1
  fi
fi
replacement_installed=1
mv -f "$candidate_path" "$executable"

if [ "$skip_service_install" = "1" ]; then
  if ! run_setup "${install_directory}/yiru" install --no-browser --no-service; then
    echo "Yiru setup failed; restoring the previous installation." >&2
    exit 1
  fi
else
  service_setup_attempted=1
  if ! run_setup "${install_directory}/yiru" install --no-browser; then
    echo "Yiru setup failed; restoring the previous installation." >&2
    exit 1
  fi
fi

transaction_committed=1
echo "Installed Yiru to ${install_directory}/yiru"
case ":${PATH}:" in
  *":${install_directory}:"*) ;;
  *) echo "Add ${install_directory} to PATH." ;;
esac
