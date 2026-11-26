//! Desktop shell for The Worldkeeper.
//!
//! The app is the same local web application as `npm start`: this shell launches the bundled
//! Node.js server as a sidecar (bound to 127.0.0.1 on a free port, data in the OS app-data folder),
//! waits until it answers, then points the window at it. Closing the app stops the server.

use std::fs::{self, OpenOptions};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::UpdaterExt;

struct ServerProcess(Mutex<Option<Child>>);

// ---- "Update and restart" (v0.9.18) -----------------------------------------------------------------------------------
//
// The page asks for an update by going to `/__shell/update?tag=v1.2.3` on the local server. That navigation never
// happens: this shell sees it, keeps the page where it is, and does the update itself. No Tauri command is exposed to
// the page, as before. The update is only ever fetched from this project's own releases, and is only installed if it
// carries a signature made with this project's update key (the public half is in tauri.conf.json).

const RELEASE_DOWNLOADS: &str = "https://github.com/n1x-shell/Worldkeeper/releases/download";
static UPDATING: AtomicBool = AtomicBool::new(false);

/// A release tag as this project writes them: `v1.2.3` or `v1.2.3-beta.1`. Nothing else is put into an address.
fn valid_tag(tag: &str) -> bool {
    let Some(rest) = tag.strip_prefix('v') else { return false };
    let (numbers, pre) = match rest.split_once('-') {
        Some((n, p)) => (n, Some(p)),
        None => (rest, None),
    };
    let parts: Vec<&str> = numbers.split('.').collect();
    tag.len() <= 40
        && parts.len() == 3
        && parts.iter().all(|p| !p.is_empty() && p.len() <= 6 && p.chars().all(|c| c.is_ascii_digit()))
        && pre.map_or(true, |p| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '.'))
}

/// The tag the page asked to update to, when the address is the shell's own and the tag is a plain version.
fn requested_update(url: &Url) -> Option<Option<String>> {
    if url.host_str() != Some("127.0.0.1") || url.path() != "/__shell/update" {
        return None;
    }
    let tag = url.query_pairs().find(|(k, _)| k == "tag").map(|(_, v)| v.to_string());
    Some(tag.filter(|t| valid_tag(t)))
}

/// Whether this copy of the app can replace itself. On Linux only an AppImage can; a .deb or .rpm is the package manager's.
fn can_self_update() -> bool {
    if cfg!(target_os = "linux") {
        std::env::var_os("APPIMAGE").is_some()
    } else {
        cfg!(any(target_os = "windows", target_os = "macos"))
    }
}

/// What the update is doing, for the page to show (the server reads this file; the shell has no other way to speak).
fn write_update_status(file: &Path, state: &str, tag: &str, error: Option<&str>) {
    let status = serde_json::json!({ "state": state, "tag": tag, "error": error });
    let tmp = file.with_extension("json.tmp");
    if fs::write(&tmp, status.to_string()).is_ok() {
        let _ = fs::rename(&tmp, file);
    }
}

async fn run_update(handle: &tauri::AppHandle, tag: &str, status: &Path) -> Result<(), String> {
    write_update_status(status, "checking", tag, None);
    let address = match std::env::var("WORLDKEEPER_UPDATE_ENDPOINT") {
        // For trying the updater against a local file server: only in a development build.
        Ok(dev) if cfg!(debug_assertions) => dev,
        _ => format!("{RELEASE_DOWNLOADS}/{tag}/latest.json"),
    };
    let endpoint = Url::parse(&address).map_err(|e| e.to_string())?;
    let updater = handle.updater_builder().endpoints(vec![endpoint]).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("Couldn't read the update for {tag}: {e}"))?
        .ok_or_else(|| format!("{tag} has no update for this computer, or isn't newer than this version"))?;
    write_update_status(status, "downloading", tag, None);
    // The signature is checked here, against this project's public key, before anything is installed.
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| format!("The download failed or its signature didn't match: {e}"))?;
    write_update_status(status, "installing", tag, None);
    // The server holds files the installer must replace: stop it first (it closes the library cleanly).
    if let Some(mut child) = handle.state::<ServerProcess>().0.lock().unwrap().take() {
        stop_server(&mut child);
    }
    if let Err(e) = update.install(bytes) {
        write_update_status(status, "failed", tag, Some(&format!("The new version couldn't be installed: {e}")));
    }
    // Start again: the new version if the install went through, this one if it didn't (the page then says why).
    handle.restart();
}

fn start_update(handle: tauri::AppHandle, tag: Option<String>, status: PathBuf) {
    let Some(tag) = tag else {
        write_update_status(&status, "failed", "", Some("That isn't a version this app can update to"));
        return;
    };
    if !can_self_update() {
        write_update_status(&status, "failed", &tag, Some("This copy of the app can't update itself: install the new version from the releases page"));
        return;
    }
    if UPDATING.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_update(&handle, &tag, &status).await {
            eprintln!("[worldkeeper] update to {tag} failed: {e}");
            write_update_status(&status, "failed", &tag, Some(&e));
            UPDATING.store(false, Ordering::SeqCst);
        }
    });
}

/// The port the app's own server listens on. Always the same one when it is free: the page keeps what the GM chose
/// (the theme, the folded menu, pinned records) under its address, and an address with another port each time is
/// another address, so every preference was forgotten at each start. Any free port if that one is taken.
const HOME_PORT: u16 = 43110;
fn free_port() -> std::io::Result<u16> {
    if let Ok(listener) = TcpListener::bind(("127.0.0.1", HOME_PORT)) {
        return Ok(listener.local_addr()?.port());
    }
    Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
}

/// Tauri places `externalBin` sidecars next to the main executable, without the target-triple suffix.
fn sidecar_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("executable has no parent directory")?;
    let name = if cfg!(windows) { "worldkeeper-node.exe" } else { "worldkeeper-node" };
    let path = dir.join(name);
    if path.exists() {
        Ok(path)
    } else {
        Err(format!("bundled Node.js runtime not found at {}", path.display()))
    }
}

fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(150));
    }
    false
}

/// Windows gives app folders in extended-length form (`\\?\C:\Program Files\...`). Node can't run a script from such a
/// path (it fails with "EISDIR: illegal operation on a directory, lstat 'C:'"), so pass the ordinary form instead.
/// `\\?\UNC\server\share\...` becomes `\\server\share\...`; any other path is returned as it is.
fn plain_path(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = s.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        p.to_path_buf()
    }
}

/// What the server prints is kept in `logs/server.log` (the server's own log is `logs/worldkeeper.log`, which it keeps
/// small itself). This one only grows, so at each start a large one is set aside as `server.log.1`, replacing the last.
const MAX_LOG_BYTES: u64 = 1_000_000;
fn set_aside_if_large(log: &Path, max: u64) {
    if fs::metadata(log).map(|m| m.len() > max).unwrap_or(false) {
        let mut old = log.as_os_str().to_owned();
        old.push(".1");
        let _ = fs::remove_file(&old);
        if fs::rename(log, &old).is_err() {
            let _ = fs::remove_file(log);
        }
    }
}

fn start_server(resources: &Path, data_dir: &Path, port: u16) -> Result<Child, String> {
    let resources = &plain_path(resources);
    let data_dir = &plain_path(data_dir);
    let node = plain_path(&sidecar_path()?);
    let server_dir = resources.join("server");
    let entry = server_dir.join("index.mjs");
    if !entry.exists() {
        return Err(format!("server bundle not found at {}", entry.display()));
    }
    let logs = data_dir.join("logs");
    fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
    set_aside_if_large(&logs.join("server.log"), MAX_LOG_BYTES);
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs.join("server.log"))
        .map_err(|e| e.to_string())?;
    let log_err = log.try_clone().map_err(|e| e.to_string())?;

    let mut cmd = Command::new(node);
    cmd.arg(&entry)
        .current_dir(&server_dir)
        .env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        .env("HOST", "127.0.0.1")
        .env("WORLDKEEPER_MODE", "dm")
        .env("WORLDKEEPER_DATA_DIR", data_dir)
        .env("WORLDKEEPER_STATIC_DIR", resources.join("client"))
        .env("WORLDKEEPER_PLAYER_SITE_DIR", resources.join("player-site"))
        .env("WORLDKEEPER_ADDITIONS_DIR", resources.join("additions"))
        .env("WORLDKEEPER_PACKS_DIR", resources.join("packs"))
        // Lets the server exit on its own if this process dies without a clean shutdown.
        .env("WORLDKEEPER_PARENT_PID", std::process::id().to_string())
        // The page offers "Update and restart" only where this shell can do it.
        .env("WORLDKEEPER_SHELL_UPDATER", if can_self_update() { "1" } else { "0" })
        .env_remove("NODE_OPTIONS")
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_err));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn().map_err(|e| format!("could not start the server: {e}"))
}

/// Ask the server to shut down cleanly (it closes the database on SIGTERM), then force it.
fn stop_server(child: &mut Child) {
    #[cfg(unix)]
    {
        let _ = Command::new("kill").arg("-TERM").arg(child.id().to_string()).status();
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(3) {
            if let Ok(Some(_)) = child.try_wait() {
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn show_error(window: &tauri::WebviewWindow, message: &str) {
    let safe = message.replace('\\', "\\\\").replace('`', "'").replace('$', "");
    let _ = window.eval(&format!(
        "document.body.innerHTML = `<div style=\"max-width:640px;margin:15vh auto;font-family:Georgia,serif;color:#e4dfd2\"><h1 style=\"color:#cd5c52\">The Worldkeeper could not start</h1><pre style=\"white-space:pre-wrap;color:#969288\">{safe}</pre></div>`;"
    ));
}

pub fn run() {
    let app = tauri::Builder::default()
        // First, so a second launch hands over to this one before it starts its own server on the same library.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            let data_dir = match std::env::var_os("WORLDKEEPER_DATA_DIR") {
                Some(d) => PathBuf::from(d),
                None => app.path().app_data_dir()?,
            };
            fs::create_dir_all(&data_dir)?;
            let update_status = plain_path(&data_dir).join("update-status.json");
            let handle = app.handle().clone();
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("The Worldkeeper")
                .inner_size(1440.0, 920.0)
                .min_inner_size(900.0, 600.0)
                // "Update and restart": the page goes to the shell's own address; the shell acts and the page stays.
                .on_navigation(move |url| match requested_update(url) {
                    Some(tag) => {
                        start_update(handle.clone(), tag, update_status.clone());
                        false
                    }
                    None => true,
                })
                .build()?;

            let resources = app.path().resource_dir()?;
            let port = free_port()?;

            match start_server(&resources, &data_dir, port) {
                Ok(child) => {
                    *app.state::<ServerProcess>().0.lock().unwrap() = Some(child);
                    let log_path = data_dir.join("logs");
                    let running = app.package_info().version.to_string();
                    thread::spawn(move || {
                        if wait_for_port(port, Duration::from_secs(45)) {
                            let url = Url::parse(&format!("http://127.0.0.1:{port}/")).expect("valid url");
                            let _ = window.navigate(url);
                            // For trying the updater without a hand on the mouse (development builds only): the page
                            // goes where "Update and restart" would send it, once it has loaded.
                            if cfg!(debug_assertions) {
                                if let Ok(tag) = std::env::var("WORLDKEEPER_UPDATE_NOW") {
                                    if valid_tag(&tag) && tag.trim_start_matches('v') != running {
                                        thread::sleep(Duration::from_secs(8));
                                        let _ = window.eval(&format!("window.location.assign('/__shell/update?tag={tag}')"));
                                    }
                                }
                            }
                        } else {
                            show_error(&window, &format!("The local server did not answer in time.\n\nWhat went wrong is in the log files (worldkeeper.log and server.log) in:\n{}\n\nTo report it: github.com/n1x-shell/Worldkeeper/issues", log_path.display()));
                        }
                    });
                }
                Err(e) => show_error(&window, &e),
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building The Worldkeeper");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            eprintln!("[worldkeeper] exiting: stopping local server");
            if let Some(mut child) = handle.state::<ServerProcess>().0.lock().unwrap().take() {
                stop_server(&mut child);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{plain_path, requested_update, set_aside_if_large, valid_tag};
    use std::path::{Path, PathBuf};
    use tauri::Url;

    #[test]
    fn only_plain_version_tags_are_updated_to() {
        for ok in ["v0.9.18", "v1.0.0", "v12.345.6", "v1.0.0-beta.2"] {
            assert!(valid_tag(ok), "{ok}");
        }
        for bad in ["0.9.18", "v1.0", "v1.0.0.0", "v1.0.x", "v1.0.0-", "v1.0.0-beta/../x", "v1.0.0?x=1", "latest", "", "v1.0.0-beta 2", "v1.0.0/../../evil"] {
            assert!(!valid_tag(bad), "{bad}");
        }
    }

    #[test]
    fn the_app_keeps_one_port_and_takes_another_only_when_it_is_taken() {
        // Whoever holds the home port for the length of this test (this test, or an app running on this machine).
        let held = std::net::TcpListener::bind(("127.0.0.1", super::HOME_PORT));
        let other = super::free_port().unwrap();
        assert_ne!(other, super::HOME_PORT);
        if held.is_ok() {
            drop(held);
            assert_eq!(super::free_port().unwrap(), super::HOME_PORT);
            assert_eq!(super::free_port().unwrap(), super::HOME_PORT);
        }
    }

    #[test]
    fn a_large_server_log_is_set_aside_at_start() {
        let dir = std::env::temp_dir().join(format!("wk-log-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let log = dir.join("server.log");
        std::fs::write(&log, "short").unwrap();
        set_aside_if_large(&log, 100);
        assert_eq!(std::fs::read_to_string(&log).unwrap(), "short");
        std::fs::write(&log, "x".repeat(200)).unwrap();
        std::fs::write(dir.join("server.log.1"), "older").unwrap();
        set_aside_if_large(&log, 100);
        assert!(!log.exists());
        assert_eq!(std::fs::read_to_string(dir.join("server.log.1")).unwrap().len(), 200);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_shell_only_listens_at_its_own_address() {
        let u = |s: &str| Url::parse(s).unwrap();
        assert_eq!(requested_update(&u("http://127.0.0.1:4310/__shell/update?tag=v1.2.3")), Some(Some("v1.2.3".to_string())));
        // A tag that isn't a version is refused, not ignored: the page is told.
        assert_eq!(requested_update(&u("http://127.0.0.1:4310/__shell/update?tag=../../evil")), Some(None));
        assert_eq!(requested_update(&u("http://127.0.0.1:4310/__shell/update")), Some(None));
        // Any other page, and the same path anywhere else, is an ordinary navigation.
        assert_eq!(requested_update(&u("http://127.0.0.1:4310/settings")), None);
        assert_eq!(requested_update(&u("https://evil.example/__shell/update?tag=v1.2.3")), None);
    }

    #[test]
    fn strips_the_extended_length_prefix() {
        assert_eq!(plain_path(Path::new(r"\\?\C:\Program Files\The Worldkeeper\server\index.mjs")), PathBuf::from(r"C:\Program Files\The Worldkeeper\server\index.mjs"));
        assert_eq!(plain_path(Path::new(r"\\?\UNC\nas\games\worldkeeper")), PathBuf::from(r"\\nas\games\worldkeeper"));
        assert_eq!(plain_path(Path::new("/usr/lib/worldkeeper")), PathBuf::from("/usr/lib/worldkeeper"));
    }
}
