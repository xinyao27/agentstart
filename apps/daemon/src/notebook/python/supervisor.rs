pub(super) const SOURCE: &str = r#"import base64, json, os, signal, subprocess, sys, threading, time

LIMIT = 2 * 1024 * 1024

def drain(pipe, capture):
    while True:
        chunk = pipe.read(65536)
        if not chunk:
            return
        remaining = LIMIT - len(capture["bytes"])
        if remaining > 0:
            capture["bytes"].extend(chunk[:remaining])
        if len(chunk) > remaining:
            capture["truncated"] = True

def stop_tree(process):
    if os.name == "nt":
        try:
            subprocess.Popen(
                ["taskkill", "/pid", str(process.pid), "/t", "/f"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            ).wait(timeout=2)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except Exception:
        try:
            process.terminate()
        except Exception:
            pass
    try:
        process.wait(timeout=2)
        return
    except Exception:
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except Exception:
        try:
            process.kill()
        except Exception:
            pass

request = json.loads(sys.stdin.buffer.read().decode("utf-8"))
options = {
    "stdin": subprocess.DEVNULL,
    "stdout": subprocess.PIPE,
    "stderr": subprocess.PIPE,
}
if os.name == "nt":
    options["creationflags"] = (
        getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        | getattr(subprocess, "CREATE_NO_WINDOW", 0)
    )
else:
    options["start_new_session"] = True

try:
    process = subprocess.Popen([sys.executable, "-c", request["executionCode"]], **options)
except Exception as error:
    result = {
        "stdoutBase64": "",
        "stderrBase64": "",
        "stdoutTruncated": False,
        "stderrTruncated": False,
        "exitCode": None,
        "timedOut": False,
        "launchError": str(error),
    }
else:
    deadline = time.monotonic() + 60
    stdout = {"bytes": bytearray(), "truncated": False}
    stderr = {"bytes": bytearray(), "truncated": False}
    readers = [
        threading.Thread(target=drain, args=(process.stdout, stdout), daemon=True),
        threading.Thread(target=drain, args=(process.stderr, stderr), daemon=True),
    ]
    for reader in readers:
        reader.start()
    timed_out = False
    try:
        process.wait(timeout=max(0, deadline - time.monotonic()))
    except subprocess.TimeoutExpired:
        timed_out = True
        stop_tree(process)
    if not timed_out:
        for reader in readers:
            reader.join(timeout=max(0, deadline - time.monotonic()))
        if any(reader.is_alive() for reader in readers):
            timed_out = True
            stop_tree(process)
    for reader in readers:
        reader.join(timeout=3)
    result = {
        "stdoutBase64": base64.b64encode(bytes(stdout["bytes"])).decode("ascii"),
        "stderrBase64": base64.b64encode(bytes(stderr["bytes"])).decode("ascii"),
        "stdoutTruncated": stdout["truncated"],
        "stderrTruncated": stderr["truncated"],
        "exitCode": None if timed_out or process.returncode is None or process.returncode < 0 else process.returncode,
        "timedOut": timed_out,
        "launchError": None,
    }

sys.stdout.write("YIRU_NOTEBOOK_RESULT_V1:" + json.dumps(result, separators=(",", ":")))
"#;
