//! Desktop shell for The Worldkeeper.
//!
//! The app is the same local web application as `npm start`: this shell launches the bundled
//! Node.js server as a sidecar (bound to 127.0.0.1 on a free port, data in the OS app-data folder),
//! waits until it answers, then points the window at it. Closing the app stops the server.

use std::fs::{self, OpenOptions};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};

struct ServerProcess(Mutex<Option<Child>>);

fn free_port() -> std::io::Result<u16> {
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

fn start_server(resources: &Path, data_dir: &Path, port: u16) -> Result<Child, String> {
    let node = sidecar_path()?;
    let server_dir = resources.join("server");
    let entry = server_dir.join("index.mjs");
    if !entry.exists() {
        return Err(format!("server bundle not found at {}", entry.display()));
    }
    let logs = data_dir.join("logs");
    fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
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
        // Lets the server exit on its own if this process dies without a clean shutdown.
        .env("WORLDKEEPER_PARENT_PID", std::process::id().to_string())
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
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("The Worldkeeper")
                .inner_size(1440.0, 920.0)
                .min_inner_size(900.0, 600.0)
                .build()?;

            let data_dir = match std::env::var_os("WORLDKEEPER_DATA_DIR") {
                Some(d) => PathBuf::from(d),
                None => app.path().app_data_dir()?,
            };
            fs::create_dir_all(&data_dir)?;
            let resources = app.path().resource_dir()?;
            let port = free_port()?;

            match start_server(&resources, &data_dir, port) {
                Ok(child) => {
                    *app.state::<ServerProcess>().0.lock().unwrap() = Some(child);
                    let log_path = data_dir.join("logs").join("server.log");
                    thread::spawn(move || {
                        if wait_for_port(port, Duration::from_secs(45)) {
                            let url = Url::parse(&format!("http://127.0.0.1:{port}/")).expect("valid url");
                            let _ = window.navigate(url);
                        } else {
                            show_error(&window, &format!("The local server did not answer in time.\nSee the log: {}", log_path.display()));
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
